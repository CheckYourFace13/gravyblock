/**
 * The permanent operating loop for the owner's portfolio (owner directive 2026-11-08): Studio keeps making distinct, reviewed videos until the owner pauses a product
 * or something genuinely needs the owner. One recurring `portfolio_tick` job (scheduled by the worker, durable across restarts and deploys) walks every active product:
 *   status -> (nothing waiting) -> queue the next ready script -> else generate a concept -> else WAITING_FOR_NEW_OPPORTUNITY until Product Truth changes.
 * Quality still overrides volume: the generator and every gate decide, and when nothing passes the product simply waits. One video awaits review per product at a time.
 */
import { spawn } from "node:child_process";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { ms, type StudioDb } from "./db";
import { hasApprovedLogo } from "./brand/brand-kit";
import { allowanceFor, spendCredit } from "./entitlements";
import { ensureOwnedSlots, TARGET_EXEMPT } from "./portfolio-target";
import { PLAN_PRODUCTS } from "./library-plan";
import { getAngles, updateAngle } from "./library-store";
import { listFacts, listProducts } from "./repository";
import { enqueue, getSetting, JOB_PRIORITY, setSetting } from "./runtime";
import { INTERNAL_SCOPE } from "./scope";
import { specFor } from "./publishing/platforms";
import { reviewRecipient } from "./publishing/review-contact";
import { youtubeConnectionFor } from "./publishing/youtube-share";
import { getPolicy, kidsFor, policyKey, type VideoPolicy } from "./publishing/video-policy";
import { queueReplacement } from "./publishing/review-replacement";
import { listReviews } from "./publishing/video-review";
import { conceptKey, type StoredConcept } from "./video/concepts/registry";

export type ProductStatus = "ACTIVE" | "WAITING_FOR_REVIEW" | "CHANGES_REQUESTED" | "RENDERING" | "WAITING_FOR_UPLOAD_LIMIT" | "WAITING_FOR_NEW_OPPORTUNITY" | "NEEDS_OWNER_ACTION" | "PAUSED";

/** Products kept out of the loop: games follow their own rules, and the iScream site's own showcase is not deployed. */
const OUT_OF_LOOP = new Set(["iscreamstudio"]);
const REASSESS_MS = 24 * 3_600_000;
const TRANSIENT = /NEEDS RE-RENDER|Blocked before sending|not declared|pre-upload|connection|rate|limit|timed out|timeout|closed|ECONN|fetch failed|503|502|429/i;
const MAX_REVIVES = 6;

/** A script's job that is waiting or running right now. */
async function activeJobForSpec(db: StudioDb, specId: string): Promise<boolean> {
  const rows = await db.select({ id: ms.msMediaJobs.id }).from(ms.msMediaJobs).where(and(eq(ms.msMediaJobs.kind, "library_video"), inArray(ms.msMediaJobs.status, ["queued", "running"]), sql`${ms.msMediaJobs.input}->>'specId' = ${specId}`)).limit(1);
  return rows.length > 0;
}

/** Queues one script's video unless it already has a job waiting or running. The key counts earlier jobs, so a script whose old job finished or died can be made again. */
async function queueSpec(db: StudioDb, productId: string, specId: string, priority: number = JOB_PRIORITY.normal): Promise<"queued" | "active"> {
  if (await activeJobForSpec(db, specId)) return "active";
  const prior = await db.select({ id: ms.msMediaJobs.id }).from(ms.msMediaJobs).where(and(eq(ms.msMediaJobs.kind, "library_video"), sql`${ms.msMediaJobs.input}->>'specId' = ${specId}`));
  const r = await enqueue({ kind: "library_video", weight: "heavy", priority, productId, dedupeKey: prior.length ? `library_video:${specId}:n${prior.length}` : `library_video:${specId}`, input: { specId }, maxAttempts: 3 }, db);
  return r.id ? "queued" : "active";
}

/** An angle marked in production with no job behind it (a crash, a deploy mid-job) goes back to planned so the loop can pick it up again. */
async function recoverStranded(db: StudioDb, p: Product, log: (m: string) => void) {
  for (const a of (await getAngles(db, p.slug)).filter((x) => x.status === "in_production" && x.specId)) {
    if (await activeJobForSpec(db, a.specId as string)) continue;
    await updateAngle(db, "portfolio-watchdog", p.slug, (e) => e.id === a.id && e.status === "in_production", { status: "planned" });
    log(`portfolio ${p.slug}: ${a.id} was in production with no job; it is planned again`);
  }
}

type Product = { id: string; slug: string; name: string; ownerKind: string };

export type StatusFacts = {
  paused: boolean;
  needsOwner: string | null;
  review: Array<{ status: string }>;
  activeJobs: number;
  uploadLimited: boolean;
  waiting: boolean;
};

/** Pure: the one status a product shows. Only NEEDS_OWNER_ACTION interrupts the owner. */
export function statusOf(f: StatusFacts): ProductStatus {
  if (f.paused) return "PAUSED";
  if (f.needsOwner) return "NEEDS_OWNER_ACTION";
  if (f.review.some((r) => r.status === "changes_requested")) return "CHANGES_REQUESTED";
  if (f.review.some((r) => r.status === "unlisted_live")) return "WAITING_FOR_REVIEW";
  if (f.uploadLimited) return "WAITING_FOR_UPLOAD_LIMIT";
  if (f.activeJobs > 0) return "RENDERING";
  if (f.waiting) return "WAITING_FOR_NEW_OPPORTUNITY";
  return "ACTIVE";
}

/** A short fingerprint of what Product Truth currently says, so "nothing new" is detectable without owner input. */
export async function truthSignature(db: StudioDb, productId: string): Promise<string> {
  const facts = (await listFacts(INTERNAL_SCOPE, productId, db)).filter((f) => f.status === "current" && f.verifiedAt);
  const newest = facts.reduce((m, f) => Math.max(m, f.verifiedAt ? new Date(f.verifiedAt).getTime() : 0), 0);
  return `${facts.length}:${newest}`;
}

async function gather(db: StudioDb, p: Product): Promise<StatusFacts & { policy: VideoPolicy }> {
  const policy = await getPolicy(db, p.id);
  const reviews = (await listReviews(db)).filter((r) => r.productId === p.id && (r.status === "unlisted_live" || r.status === "changes_requested"));
  const jobs = await db.select({ status: ms.msMediaJobs.status, kind: ms.msMediaJobs.kind, runAfter: ms.msMediaJobs.runAfter }).from(ms.msMediaJobs).where(and(eq(ms.msMediaJobs.productId, p.id), inArray(ms.msMediaJobs.status, ["queued", "running"]), inArray(ms.msMediaJobs.kind, ["library_video", "review_replacement"])));
  const cap = specFor("youtube")?.rateLimit.ourCap24h ?? 3;
  const since = Date.now() - 24 * 3_600_000;
  const pubs = await db.select({ at: ms.msPublications.publishedAt }).from(ms.msPublications).where(and(eq(ms.msPublications.platform, "youtube"), eq(ms.msPublications.productId, p.id), eq(ms.msPublications.status, "published")));
  const recent = pubs.filter((x) => x.at && x.at.getTime() > since).length;
  let needsOwner: string | null = null;
  if ((await kidsFor(db, p)) === null) needsOwner = "the one-time YouTube made-for-kids declaration for this product has not been made";
  else if (!(await hasApprovedLogo(db, p.id))) needsOwner = "NEEDS BRAND ASSET: no approved logo file is on record, and a logo is never invented";
  else if (!(await reviewRecipient(db, p.id))) needsOwner = "no verified review email is set for this product";
  else if (!(await youtubeConnectionFor(db, p.id))) needsOwner = "no healthy YouTube connection is available for this product";
  return { paused: Boolean(policy.paused), needsOwner, review: reviews, activeJobs: jobs.length, uploadLimited: recent >= cap, waiting: Boolean(policy.waiting), policy };
}

export async function productStatus(db: StudioDb, p: Product): Promise<{ status: ProductStatus; detail: string | null }> {
  const g = await gather(db, p);
  return { status: statusOf(g), detail: g.needsOwner };
}

/** Runs the portfolio driver for one product as a child process (the AI creative step, gates and registration live there). Resolves with its output. */
function runDriver(slug: string, timeoutMs = 25 * 60_000): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", "scripts/ops/marketing-portfolio-run.ts", "--only", slug], { cwd: process.cwd(), env: process.env });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (out += String(d)));
    child.on("close", () => {
      clearTimeout(timer);
      resolve(out);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(out);
    });
  });
}

export type TickReport = Array<{ slug: string; status: ProductStatus; action: string }>;

const GENERATION_LOG = "portfolio_generation_log";
/** GravyBlock is served about twice as often as any other product (it has the largest library to build); everyone else rotates by who was served longest ago. */
const GRAVYBLOCK_HEAD_START_MS = 6 * 3_600_000;
async function generationOrder(db: StudioDb) {
  const served = await getSetting<Record<string, number>>(GENERATION_LOG, {}, db);
  const key = (slug: string) => (served[slug] ?? 0) - (slug === "gravyblock" ? GRAVYBLOCK_HEAD_START_MS : 0);
  return [...PLAN_PRODUCTS].sort((a, b) => key(a.slug) - key(b.slug));
}

export async function portfolioTick(db: StudioDb, log: (m: string) => void = () => {}, opts: { generate?: boolean } = {}): Promise<TickReport> {
  const report: TickReport = [];
  const products = (await listProducts(INTERNAL_SCOPE, db)) as unknown as Product[];
  let generated = 0;
  for (const plan of await generationOrder(db)) {
    if (OUT_OF_LOOP.has(plan.slug)) continue;
    const p = products.find((x) => x.slug === plan.slug);
    if (!p) continue;
    const g = await gather(db, p);
    const status = statusOf(g);
    const say = (action: string) => {
      report.push({ slug: p.slug, status, action });
      log(`portfolio ${p.slug}: ${status}: ${action}`);
    };
    if (status === "PAUSED" || status === "NEEDS_OWNER_ACTION") {
      say(status === "PAUSED" ? "paused by the owner, nothing is made" : (g.needsOwner as string));
      continue;
    }
    // durability: a job that died of a temporary problem (YouTube limit, site failure, closed browser, throttling) is revived, a few times, with no owner action
    await recoverStranded(db, p, log);
    // the owner's portfolio target is five distinct videos per product: make sure the two open slots exist (GravyBlock has its own inventory)
    if (p.ownerKind !== "customer" && !TARGET_EXEMPT.has(p.slug)) await ensureOwnedSlots(db, "portfolio-tick", { slug: p.slug, name: p.name, home: plan.home }).catch(() => 0);
    await reviveTransient(db, p, log);
    if (status === "CHANGES_REQUESTED") {
      // a change request never waits on the owner again: make sure its replacement is queued (a pause, a restart or a dead job cannot strand it)
      for (const r of (await listReviews(db)).filter((x) => x.productId === p.id && x.status === "changes_requested")) await queueReplacement(db, "portfolio-tick", r).catch(() => {});
      say("replacement for the requested changes is queued");
      continue;
    }
    if (status === "WAITING_FOR_REVIEW" || status === "RENDERING" || status === "WAITING_FOR_UPLOAD_LIMIT") {
      say("waiting, nothing new to start");
      continue;
    }
    // plan allowance: a ceiling on NEW videos only (replacements never come through here). Quality still decides whether anything is made at all.
    const allow = await allowanceFor(db, p);
    if (!allow.eligible) {
      say(`plan allowance: ${allow.reason}; next new video eligible ${allow.nextEligibleAt ?? "now"}`);
      continue;
    }
    const angles = (await getAngles(db, p.slug)).filter((a) => a.status === "planned").sort((a, b) => a.position - b.position);
    let queued: string | null = null;
    let inFlight = false;
    for (const a of angles) {
      if (!a.specId || !a.yt) continue;
      // a script made by the concept generator must be ready; a hand-written script (no stored concept) is judged by the creative standard when it renders
      const c = await getSetting<StoredConcept | null>(conceptKey(a.specId), null, db);
      if (c && c.status !== "ready") continue;
      // paid add-on capacity runs in the lowest class; the plan's own allowance runs as normal work
      const burst = allow.base !== null && allow.generated >= allow.base + allow.carried;
      const r = await queueSpec(db, p.id, a.specId, burst ? JOB_PRIORITY.burst : JOB_PRIORITY.normal);
      if (r === "queued") {
        if (allow.base !== null && allow.generated >= allow.base + allow.carried + allow.addOnPerPeriod) await spendCredit(db, p.id);
        queued = a.specId;
        break; // one at a time
      }
      inFlight = true; // this script already has a job: nothing else is started until it finishes
      break;
    }
    if (queued) {
      await clearWaiting(db, p.id, g.policy);
      say(`queued the next video (${queued})`);
      continue;
    }
    if (inFlight) {
      say("a script is already queued or in progress");
      continue;
    }
    // nothing ready: look for a new distinct angle, but only when Product Truth changed or a day has passed since the last honest look
    const sig = await truthSignature(db, p.id);
    const due = !g.policy.waiting || g.policy.waiting.truthSig !== sig || Date.now() - Date.parse(g.policy.waiting.checkedAt) > REASSESS_MS;
    if (!due) {
      say("WAITING_FOR_NEW_OPPORTUNITY: Product Truth has not changed since the last look");
      continue;
    }
    if (opts.generate === false || generated >= 1) {
      say("generation deferred to a later tick");
      continue;
    }
    generated++;
    await setSetting(GENERATION_LOG, { ...(await getSetting<Record<string, number>>(GENERATION_LOG, {}, db)), [p.slug]: Date.now() }, "portfolio-tick", db, { audited: false });
    const out = await runDriver(p.slug);
    const made = /: (SAVED|NEW ANGLE|concept ready)/.test(out);
    if (made) {
      await clearWaiting(db, p.id, g.policy);
      say("a new concept passed every gate; it is queued on the next tick");
    } else {
      const now = new Date().toISOString();
      await setSetting(policyKey(p.id), { ...g.policy, waiting: { since: g.policy.waiting?.since ?? now, truthSig: sig, checkedAt: now, reason: "no truthful concept with real product interaction meets the quality bar yet" } }, "portfolio-tick", db, { audited: false });
      say("WAITING_FOR_NEW_OPPORTUNITY: no concept met the bar, will look again when Product Truth changes");
    }
  }
  return report;
}

async function clearWaiting(db: StudioDb, productId: string, policy: VideoPolicy) {
  if (!policy.waiting) return;
  const { waiting: _w, ...rest } = policy;
  void _w;
  await setSetting(policyKey(productId), rest, "portfolio-tick", db, { audited: false });
}

/** Revives library jobs that died of a temporary cause, at most MAX_REVIVES times per script. A real QA failure is not revived: that video was judged not good enough. */
async function reviveTransient(db: StudioDb, p: Product, log: (m: string) => void) {
  const dead = await db.select().from(ms.msMediaJobs).where(and(eq(ms.msMediaJobs.productId, p.id), eq(ms.msMediaJobs.status, "dead"), inArray(ms.msMediaJobs.kind, ["library_video", "review_replacement"]))).orderBy(desc(ms.msMediaJobs.createdAt)).limit(12);
  const seen = new Set<string>();
  for (const j of dead) {
    const spec = (j.input as { specId?: string; publicationId?: string }).specId ?? (j.input as { publicationId?: string }).publicationId ?? j.id;
    if (seen.has(spec)) continue; // one revival per script, from its newest dead job
    seen.add(spec);
    const specId = (j.input as { specId?: string }).specId;
    if (specId) {
      if (await activeJobForSpec(db, specId)) continue;
      const newer = await db.select({ id: ms.msMediaJobs.id }).from(ms.msMediaJobs).where(and(eq(ms.msMediaJobs.kind, "library_video"), sql`${ms.msMediaJobs.input}->>'specId' = ${specId}`, inArray(ms.msMediaJobs.status, ["done"]), sql`${ms.msMediaJobs.createdAt} > ${j.createdAt.toISOString()}::timestamptz`)).limit(1);
      if (newer.length) continue;
      const angle = (await getAngles(db, p.slug)).find((a) => a.specId === specId);
      if (angle && ["unlisted_review", "approved", "public"].includes(angle.status)) continue;
    }
    if (!TRANSIENT.test(j.error ?? "") || /QA did not pass|made-for-kids|paused by the owner/i.test(j.error ?? "")) continue;
    if (j.finishedAt && Date.now() - j.finishedAt.getTime() < 30 * 60_000) continue;
    const key = `video_revive_${spec}`;
    const n = await getSetting<number>(key, 0, db);
    if (n >= MAX_REVIVES) continue;
    await setSetting(key, n + 1, "portfolio-tick", db, { audited: false });
    await enqueue({ kind: j.kind as "library_video", weight: "heavy", priority: 3, productId: p.id, dedupeKey: `${j.dedupeKey ?? j.id}:revive-${n + 1}`, input: j.input as Record<string, unknown>, maxAttempts: 3 }, db);
    log(`portfolio ${p.slug}: revived ${j.kind} (${spec}) after a temporary failure, attempt ${n + 1}`);
  }
}

/**
 * The empty-queue watchdog (owner directive 2026-11-10). It runs every 10 minutes as its own light job and is independent of the 30-minute portfolio tick: for every active product it
 * queues the next eligible work (a ready or hand-written script, a temporarily failed job, a stranded angle) when nothing is waiting or running and nothing legitimately blocks it. It never
 * generates a new concept (the tick does that) and never overrides a pause, an owner decision or a gate. What it saw is stored in `portfolio_watchdog` so a silent stall is visible.
 */
export async function portfolioWatchdog(db: StudioDb, log: (m: string) => void = () => {}) {
  const report = await portfolioTick(db, log, { generate: false });
  const queuedNow = report.filter((r) => /^queued|revived/.test(r.action)).map((r) => r.slug);
  const active = report.filter((r) => r.status === "ACTIVE").map((r) => r.slug);
  const jobs = await db.select({ id: ms.msMediaJobs.id }).from(ms.msMediaJobs).where(and(inArray(ms.msMediaJobs.status, ["queued", "running"]), inArray(ms.msMediaJobs.kind, ["library_video", "review_replacement", "render_demo_video"])));
  const state = { at: new Date().toISOString(), activeProducts: active, queuedNow, workInFlight: jobs.length, byStatus: Object.fromEntries(report.map((r) => [r.slug, r.status])) };
  await setSetting("portfolio_watchdog", state, "portfolio-watchdog", db, { audited: false });
  if (queuedNow.length) log(`watchdog: queued work for ${queuedNow.join(", ")} (nothing was waiting)`);
  return state;
}

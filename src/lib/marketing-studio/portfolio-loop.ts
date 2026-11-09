/**
 * The permanent operating loop for the owner's portfolio (owner directive 2026-11-08): Studio keeps making distinct, reviewed videos until the owner pauses a product
 * or something genuinely needs the owner. One recurring `portfolio_tick` job (scheduled by the worker, durable across restarts and deploys) walks every active product:
 *   status -> (nothing waiting) -> queue the next ready script -> else generate a concept -> else WAITING_FOR_NEW_OPPORTUNITY until Product Truth changes.
 * Quality still overrides volume: the generator and every gate decide, and when nothing passes the product simply waits. One video awaits review per product at a time.
 */
import { spawn } from "node:child_process";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ms, type StudioDb } from "./db";
import { hasApprovedLogo } from "./brand/brand-kit";
import { allowanceFor } from "./entitlements";
import { PLAN_PRODUCTS } from "./library-plan";
import { getAngles } from "./library-store";
import { listFacts, listProducts } from "./repository";
import { enqueue, getSetting, setSetting } from "./runtime";
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
const TRANSIENT = /pre-upload|connection|rate|limit|timed out|timeout|closed|ECONN|fetch failed|503|502|429/i;
const MAX_REVIVES = 6;

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

export async function portfolioTick(db: StudioDb, log: (m: string) => void = () => {}, opts: { generate?: boolean } = {}): Promise<TickReport> {
  const report: TickReport = [];
  const products = (await listProducts(INTERNAL_SCOPE, db)) as unknown as Product[];
  let generated = 0;
  for (const plan of PLAN_PRODUCTS) {
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
    for (const a of angles) {
      if (!a.specId || !a.yt) continue;
      const c = await getSetting<StoredConcept | null>(conceptKey(a.specId), null, db);
      if (c?.status !== "ready") continue;
      const r = await enqueue({ kind: "library_video", weight: "heavy", priority: 2, productId: p.id, dedupeKey: `library_video:${a.specId}`, input: { specId: a.specId }, maxAttempts: 3 }, db);
      queued = r.id ? a.specId : null;
      if (queued || r.id === null) break; // already queued or just queued: one at a time
    }
    if (queued) {
      await clearWaiting(db, p.id, g.policy);
      say(`queued the next video (${queued})`);
      continue;
    }
    if (angles.some((a) => a.specId && a.yt)) {
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
  const dead = await db.select().from(ms.msMediaJobs).where(and(eq(ms.msMediaJobs.productId, p.id), eq(ms.msMediaJobs.status, "dead"), inArray(ms.msMediaJobs.kind, ["library_video", "review_replacement"]))).orderBy(desc(ms.msMediaJobs.createdAt)).limit(5);
  for (const j of dead) {
    const spec = (j.input as { specId?: string; publicationId?: string }).specId ?? (j.input as { publicationId?: string }).publicationId ?? j.id;
    if (!TRANSIENT.test(j.error ?? "") || /QA did not pass|made-for-kids|paused by the owner/i.test(j.error ?? "")) continue;
    if (j.finishedAt && Date.now() - j.finishedAt.getTime() < 30 * 60_000) continue;
    const key = `video_revive_${spec}`;
    const n = await getSetting<number>(key, 0, db);
    if (n >= MAX_REVIVES) continue;
    await setSetting(key, n + 1, "portfolio-tick", db, { audited: false });
    await enqueue({ kind: j.kind as "library_video", weight: "heavy", priority: 2, productId: p.id, dedupeKey: `${j.dedupeKey ?? j.id}:revive-${n + 1}`, input: j.input as Record<string, unknown>, maxAttempts: 3 }, db);
    log(`portfolio ${p.slug}: revived ${j.kind} (${spec}) after a temporary failure, attempt ${n + 1}`);
  }
}

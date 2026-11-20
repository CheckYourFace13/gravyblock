/**
 * GravyBlock's own videos, planned by the permanent engine. For each brief (gravyblock-briefs.ts) the AI concept planner writes a distinct live-tour concept from Product Truth and the real
 * site; every plan passes the pre-render gates (script, grounding, narration against screen, real interactions, copy and visual similarity against the creative history) and is replanned
 * with the exact problems when it does not, so nothing is left blocked for a person to repair. The stored concept is then produced by the same pipeline every product uses.
 * Nothing is published; every video still goes to the owner's review, and a video the owner approved or made public is never touched.
 */
import { eq } from "drizzle-orm";
import { ms, type StudioDb } from "./db";
import { briefVariant, GRAVYBLOCK_BRIEFS, GRAVYBLOCK_PLAN_PATHS } from "./gravyblock-briefs";
import { readLedger, spendNow } from "./video/concepts/ai-budget";
import { GRAVYBLOCK_BRAND, MARKETING_STUDIO_FACTS } from "./gravyblock-explainers";
import { getAngles, updateAngle } from "./library-store";
import { addFact, listClaims, listFacts, listProducts, verifyFact } from "./repository";
import { getSetting, setSetting } from "./runtime";
import { INTERNAL_SCOPE } from "./scope";
import { siteCorpus, type Corpus } from "./video/concepts/corpus";
import { conceptFromExplainer } from "./video/concepts/explainer";
import { conceptKey, type StoredConcept } from "./video/concepts/registry";
import { creativeHistory, fingerprintOfConcept, type CreativeFingerprint } from "./video/concepts/similarity";
import { aiAsk, gateDef, groundedCorpus, planTour, staleQuotes, type Ask } from "./video/concepts/tour-planner";
import type { ExplainerDef } from "./video/concepts/explainer";

const ACTOR = "gravyblock-concept-planner";
/** Bump when the planner or its gates change in a way that should replace plans made before. */
export const PLANNER_VERSION = 2;
const RETRY_AFTER_MS = 2 * 3_600_000;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export type RegisterReport = { stored: string[]; reopened: string[]; problems: string[] };
/** The most one concept may spend on the model in a month (micro-dollars as dollars): a concept that cannot be planned in this much is set aside, not fed more of the monthly cap. */
export const PER_CONCEPT_CAP_USD = 0.4;
/** The most one registrar pass may spend, so a pass over ten concepts cannot take the month's budget in one go. */
export const PER_PASS_CAP_USD = 0.6;
/** How fresh the snapshot of the live site must be when plans are checked or made. */
export const SNAPSHOT_MAX_AGE_MS = 3_600_000;
type PlanRecord = {
  v: number;
  at: string;
  ok: boolean;
  attempts: number;
  problems?: string[];
  fp?: CreativeFingerprint;
  qaReplans?: number;
  qaReplanAt?: string;
  /** the plan itself, kept so its quotes can be checked against the live site at any time and before every render */
  def?: ExplainerDef;
  yt?: { title: string; description: string };
  /** planning runs in a row that ended without an acceptable plan */
  failedRuns?: number;
  /** which framing of the brief is being planned (0 is the brief itself) */
  variant?: number;
  /** why the plan was thrown away: the live site no longer says what it quotes */
  stale?: string[];
  repairs?: number;
};
const planKey = (key: string) => `video_plan_gravyblock_${key.replace(/[^a-z0-9]+/gi, "_")}`;

/** The hard QA failures of the latest rendered video of a script, as plain instructions for the planner. */
async function renderFailures(db: StudioDb, productId: string, specId: string): Promise<string[]> {
  const rows = await db.select({ sb: ms.msVideos.storyboard, status: ms.msVideos.status, qa: ms.msVideos.qa, at: ms.msVideos.createdAt }).from(ms.msVideos).where(eq(ms.msVideos.productId, productId));
  const mine = rows.filter((r) => (r.sb as { specId?: string } | null)?.specId === specId).sort((x, y) => y.at.getTime() - x.at.getTime())[0];
  if (!mine || mine.status !== "qa_failed") return [];
  const checks = ((mine.qa as { checks?: Array<{ id: string; ok: boolean; severity: string; detail: string }> } | null)?.checks ?? []).filter((c) => !c.ok && c.severity === "fail");
  return checks.slice(0, 6).map((c) => `the rendered video failed ${c.id}: ${c.detail}`);
}

/** Angles that are being made or are with the owner: never replanned, never invalidated. */
const IN_FLIGHT = ["approved", "public", "in_production", "ready_for_review"];
const specOf = (key: string) => `gravyblock:${key}`;

/** What this month's model spend on one concept is, in dollars (every framing of the concept counts together). */
async function conceptSpendUsd(db: StudioDb, specId: string): Promise<number> {
  const l = await readLedger(db);
  return Object.entries(l.byVideo).filter(([k]) => k === specId || k.startsWith(specId + "#")).reduce((n, [, v]) => n + v, 0) / 1_000_000;
}

/** Throws a plan away because the live site no longer says what it quotes (or it no longer passes a gate): it is never rendered, the concept is held, and a new plan is made from the current site. */
async function invalidatePlan(db: StudioDb, key: string, rec: PlanRecord, why: string[], log: (m: string) => void): Promise<void> {
  await setSetting(planKey(key), { ...rec, ok: false, stale: why.slice(0, 6), at: new Date().toISOString() } satisfies PlanRecord, ACTOR, db, { audited: false });
  const stored = await getSetting<StoredConcept | null>(conceptKey(specOf(key)), null, db);
  if (stored) await setSetting(conceptKey(specOf(key)), { ...stored, status: "blocked", note: `planned from site text that has changed: ${why[0] ?? ""}` }, ACTOR, db, { audited: false });
  const brief = GRAVYBLOCK_BRIEFS.find((b) => b.key === key);
  if (brief) await updateAngle(db, ACTOR, "gravyblock", (a) => a.id === brief.angleId && a.status === "planned", { status: "blocked" });
  log(`gravyblock: the plan for ${specOf(key)} is out of date (${why[0] ?? "?"}); it will be planned again from the current site`);
}

/** The verified facts, the prohibited claims and the history a plan is made and checked against. */
async function planningContext(db: StudioDb, corpus: Corpus, productId: string) {
  const facts = await listFacts(INTERNAL_SCOPE, productId, db);
  const verified = facts.filter((f) => f.status === "current" && f.verifiedAt).map((f) => f.factValue);
  const prohibited = (await listClaims(INTERNAL_SCOPE, productId, db)).filter((c) => c.kind === "prohibited").map((c) => c.text);
  const ctxBase = { corpus: groundedCorpus(corpus, verified), facts: verified, prohibited, brand: GRAVYBLOCK_BRAND, slug: "gravyblock", productName: "GravyBlock", origin: "https://gravyblock.com", ctaHost: "gravyblock.com" };
  return { ctxBase, verified };
}

export async function registerGravyblockExplainers(db: StudioDb, log: (m: string) => void = () => {}, deps: { ask?: (specId: string) => Ask; corpus?: Corpus; retryNow?: boolean } = {}): Promise<RegisterReport> {
  const report: RegisterReport = { stored: [], reopened: [], problems: [] };
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === "gravyblock");
  if (!product) return report;
  // the owner's own statements about Marketing Studio are Product Truth (owner-entered)
  let facts = await listFacts(INTERNAL_SCOPE, product.id, db);
  for (const value of MARKETING_STUDIO_FACTS) {
    const have = facts.find((f) => f.status === "current" && norm(f.factValue) === norm(value));
    if (have?.verifiedAt) continue;
    const row = have ?? (await addFact(INTERNAL_SCOPE, ACTOR, product.id, { factKey: "capability", factValue: value, sourceKind: "owner_entered" }, db));
    await verifyFact(INTERNAL_SCOPE, ACTOR, product.id, row.id, db);
  }
  facts = await listFacts(INTERNAL_SCOPE, product.id, db);
  const angles = await getAngles(db, "gravyblock");

  // every pass works from a current snapshot of the live site (read again once it is over an hour old), so a plan is never made from, or kept on, text the site no longer says
  const corpus = deps.corpus ?? (await siteCorpus(db, "https://gravyblock.com", GRAVYBLOCK_PLAN_PATHS, false, SNAPSHOT_MAX_AGE_MS));
  for (const b of GRAVYBLOCK_BRIEFS) {
    const angle = angles.find((a) => a.id === b.angleId);
    if (!angle || IN_FLIGHT.includes(angle.status) || angle.status === "unlisted_review") continue;
    const rec = await getSetting<PlanRecord | null>(planKey(b.key), null, db);
    if (rec?.ok && rec.def) {
      const stale = staleQuotes(rec.def, corpus);
      if (stale.length) await invalidatePlan(db, b.key, rec, stale, log);
    }
  }

  // which briefs need a plan: no plan of this version yet, a plan thrown away as out of date, or a failed one whose retry time has come
  const todo: typeof GRAVYBLOCK_BRIEFS = [];
  const seeds = new Map<string, string[]>();
  const angleNow = await getAngles(db, "gravyblock");
  for (const b of GRAVYBLOCK_BRIEFS) {
    const angle = angleNow.find((a) => a.id === b.angleId);
    if (!angle) continue;
    // a video that is public, approved or being made is left exactly as it is
    if (IN_FLIGHT.includes(angle.status)) continue;
    const specId = specOf(b.key);
    const rec = await getSetting<PlanRecord | null>(planKey(b.key), null, db);
    // one concept may not spend the month's budget: past its share it is set aside, and the rest of the set carries on
    const spent = await conceptSpendUsd(db, specId);
    if (spent >= PER_CONCEPT_CAP_USD) {
      report.problems.push(`${specId}: set aside this month, it has used its $${PER_CONCEPT_CAP_USD} share of the AI budget (${spent.toFixed(2)})`);
      continue;
    }
    // a concept the render marked blocked is stuck the same way whatever its angle says (it is never made again until replanned)
    const stored = await getSetting<StoredConcept | null>(conceptKey(specId), null, db);
    const stuck = stored?.status === "blocked";
    if (rec?.ok && rec.v === PLANNER_VERSION && (angle.status === "blocked" || stuck)) {
      // a bounded number of replans a day: another round is allowed once a day has passed, so a concept never stays stuck for good
      const fresh = Date.now() - Date.parse(rec.qaReplanAt ?? rec.at) > 24 * 3_600_000;
      const used = fresh ? 0 : rec.qaReplans ?? 0;
      if (used < 6) {
        const failed = await renderFailures(db, product.id, specId);
        seeds.set(b.key, failed.length ? failed : ["the last finished video did not pass the creative standard: choose a different hook, different screens and a clearer payoff"]);
        await setSetting(planKey(b.key), { ...rec, qaReplans: used + 1, qaReplanAt: new Date().toISOString() }, ACTOR, db, { audited: false });
        todo.push(b);
        continue;
      }
    }
    if (rec?.ok && rec.v === PLANNER_VERSION) continue;
    // a plan thrown away as out of date is made again at once; a failed plan waits its turn, so one stubborn concept never holds up the others
    if (rec && !rec.ok && rec.v === PLANNER_VERSION && !rec.stale && !deps.retryNow && Date.now() - Date.parse(rec.at) < RETRY_AFTER_MS) continue;
    todo.push(b);
  }
  if (!todo.length) return report;
  // the concepts that have failed least go first
  const failedRuns = async (key: string) => (await getSetting<PlanRecord | null>(planKey(key), null, db))?.failedRuns ?? 0;
  const order = new Map<string, number>();
  for (const b of todo) order.set(b.key, await failedRuns(b.key));
  todo.sort((x, y) => (order.get(x.key) ?? 0) - (order.get(y.key) ?? 0));

  const accepted: CreativeFingerprint[] = [];
  // plans already accepted for the other briefs count as history too, so the set is distinct from itself
  for (const b of GRAVYBLOCK_BRIEFS) {
    const rec = await getSetting<PlanRecord | null>(planKey(b.key), null, db);
    if (rec?.ok && rec.fp && !todo.includes(b)) accepted.push(rec.fp);
  }
  const base = await creativeHistory(db, product.id, "");
  const { ctxBase } = await planningContext(db, corpus, product.id);
  const startSpend = (await spendNow(db)).spentUsd;
  for (const b of todo) {
    // one pass may not take the month's budget either
    if ((await spendNow(db)).spentUsd - startSpend >= PER_PASS_CAP_USD) {
      log(`gravyblock: this pass has used its $${PER_PASS_CAP_USD} of AI budget; the rest of the concepts wait for the next pass`);
      break;
    }
    const specId = specOf(b.key);
    const rec0 = await getSetting<PlanRecord | null>(planKey(b.key), null, db);
    const variant = rec0?.variant ?? 0;
    const others = [...base.filter((h) => h.specId !== specId), ...accepted];
    const planned = await planTour(briefVariant(b, variant), { ...ctxBase, history: others }, others, (deps.ask ?? ((id: string) => aiAsk(db, id)))(specId), undefined, seeds.get(b.key) ?? []);
    if (!planned.ok) {
      // a concept that fails twice in a row is asked another way (a different framing of the same subject on the same page) instead of the same question again
      const runs = (rec0?.failedRuns ?? 0) + 1;
      const nextVariant = runs % 2 === 0 ? variant + 1 : variant;
      await setSetting(planKey(b.key), { v: PLANNER_VERSION, at: new Date().toISOString(), ok: false, attempts: planned.attempts, problems: planned.problems, failedRuns: runs, variant: nextVariant, repairs: (planned as { repairs?: number }).repairs } satisfies PlanRecord, ACTOR, db, { audited: false });
      report.problems.push(`${specId}: no acceptable plan after ${planned.attempts} attempts: ${planned.problems.slice(0, 2).join(" | ")}`);
      log(`gravyblock: planning ${specId} failed internally (${planned.problems[0] ?? "?"}); ${nextVariant !== variant ? "it will be asked another way next time" : "it will plan again later"}`);
      continue;
    }
    const c = conceptFromExplainer(planned.def);
    const next: StoredConcept = { specId, status: "ready", concept: c, alternates: [], nextVariant: 2, attempts: [], generatedAt: new Date().toISOString() };
    await setSetting(conceptKey(specId), next, ACTOR, db, { audited: false });
    const fp = fingerprintOfConcept(c);
    accepted.push(fp);
    await setSetting(planKey(b.key), { v: PLANNER_VERSION, at: new Date().toISOString(), ok: true, attempts: planned.attempts, fp, def: planned.def, yt: planned.yt, failedRuns: 0, variant, repairs: planned.repairs } satisfies PlanRecord, ACTOR, db, { audited: false });
    await updateAngle(db, ACTOR, "gravyblock", (a) => a.id === b.angleId, { specId, hook: c.hook, yt: planned.yt, scenes: c.capturePlan.map((p) => p.heading), status: "planned" });
    const was = angleNow.find((a) => a.id === b.angleId)?.status;
    (was === "unlisted_review" || was === "blocked" ? report.reopened : report.stored).push(specId);
    log(`gravyblock: planned ${specId} in ${planned.attempts} attempt(s)${planned.repairs ? ` with ${planned.repairs} free repair(s)` : ""}: "${c.hook}"`);
  }
  return report;
}

/**
 * Checked before any render is queued for a GravyBlock concept: the plan's quotes must still be on the live site and its structural, similarity, duration and first-action gates must still pass. A plan
 * that fails is thrown away (it will be planned again from the current site) and the rollout carries on with the next concept. Costs nothing: no model call, no render.
 */
export async function validateBeforeRender(db: StudioDb, specId: string, log: (m: string) => void = () => {}, deps: { corpus?: Corpus } = {}): Promise<{ ok: boolean; problems: string[] }> {
  const brief = GRAVYBLOCK_BRIEFS.find((b) => specOf(b.key) === specId);
  if (!brief) return { ok: true, problems: [] };
  const rec = await getSetting<PlanRecord | null>(planKey(brief.key), null, db);
  // a plan from before plans were kept with their text is checked by the render's own live-page check
  if (!rec?.ok || !rec.def) return { ok: true, problems: [] };
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === "gravyblock");
  if (!product) return { ok: true, problems: [] };
  const corpus = deps.corpus ?? (await siteCorpus(db, "https://gravyblock.com", GRAVYBLOCK_PLAN_PATHS, false, SNAPSHOT_MAX_AGE_MS));
  const problems = staleQuotes(rec.def, corpus).map((q) => `the live site no longer says ${q}`);
  if (!problems.length) {
    const { ctxBase } = await planningContext(db, corpus, product.id);
    const others: CreativeFingerprint[] = [...(await creativeHistory(db, product.id, "")).filter((h) => h.specId !== specId)];
    for (const o of GRAVYBLOCK_BRIEFS) {
      if (o.key === brief.key) continue;
      const r = await getSetting<PlanRecord | null>(planKey(o.key), null, db);
      if (r?.ok && r.fp) others.push(r.fp);
    }
    problems.push(...gateDef(rec.def, { ...ctxBase, history: others }, others));
  }
  if (problems.length) {
    await invalidatePlan(db, brief.key, rec, problems, log);
    return { ok: false, problems };
  }
  return { ok: true, problems: [] };
}

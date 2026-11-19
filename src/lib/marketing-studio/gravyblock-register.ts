/**
 * GravyBlock's own videos, planned by the permanent engine. For each brief (gravyblock-briefs.ts) the AI concept planner writes a distinct live-tour concept from Product Truth and the real
 * site; every plan passes the pre-render gates (script, grounding, narration against screen, real interactions, copy and visual similarity against the creative history) and is replanned
 * with the exact problems when it does not, so nothing is left blocked for a person to repair. The stored concept is then produced by the same pipeline every product uses.
 * Nothing is published; every video still goes to the owner's review, and a video the owner approved or made public is never touched.
 */
import { eq } from "drizzle-orm";
import { ms, type StudioDb } from "./db";
import { GRAVYBLOCK_BRIEFS, GRAVYBLOCK_PLAN_PATHS } from "./gravyblock-briefs";
import { GRAVYBLOCK_BRAND, MARKETING_STUDIO_FACTS } from "./gravyblock-explainers";
import { getAngles, updateAngle } from "./library-store";
import { addFact, listClaims, listFacts, listProducts, verifyFact } from "./repository";
import { getSetting, setSetting } from "./runtime";
import { INTERNAL_SCOPE } from "./scope";
import { siteCorpus, type Corpus } from "./video/concepts/corpus";
import { conceptFromExplainer } from "./video/concepts/explainer";
import { conceptKey, type StoredConcept } from "./video/concepts/registry";
import { creativeHistory, fingerprintOfConcept, type CreativeFingerprint } from "./video/concepts/similarity";
import { aiAsk, groundedCorpus, planTour, type Ask } from "./video/concepts/tour-planner";

const ACTOR = "gravyblock-concept-planner";
/** Bump when the planner or its gates change in a way that should replace plans made before. */
export const PLANNER_VERSION = 2;
const RETRY_AFTER_MS = 2 * 3_600_000;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export type RegisterReport = { stored: string[]; reopened: string[]; problems: string[] };
type PlanRecord = { v: number; at: string; ok: boolean; attempts: number; problems?: string[]; fp?: CreativeFingerprint; qaReplans?: number; qaReplanAt?: string };
const planKey = (key: string) => `video_plan_gravyblock_${key.replace(/[^a-z0-9]+/gi, "_")}`;

/** The hard QA failures of the latest rendered video of a script, as plain instructions for the planner. */
async function renderFailures(db: StudioDb, productId: string, specId: string): Promise<string[]> {
  const rows = await db.select({ sb: ms.msVideos.storyboard, status: ms.msVideos.status, qa: ms.msVideos.qa, at: ms.msVideos.createdAt }).from(ms.msVideos).where(eq(ms.msVideos.productId, productId));
  const mine = rows.filter((r) => (r.sb as { specId?: string } | null)?.specId === specId).sort((x, y) => y.at.getTime() - x.at.getTime())[0];
  if (!mine || mine.status !== "qa_failed") return [];
  const checks = ((mine.qa as { checks?: Array<{ id: string; ok: boolean; severity: string; detail: string }> } | null)?.checks ?? []).filter((c) => !c.ok && c.severity === "fail");
  return checks.slice(0, 6).map((c) => `the rendered video failed ${c.id}: ${c.detail}`);
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
  const verified = facts.filter((f) => f.status === "current" && f.verifiedAt).map((f) => f.factValue);
  const prohibited = (await listClaims(INTERNAL_SCOPE, product.id, db)).filter((c) => c.kind === "prohibited").map((c) => c.text);
  const angles = await getAngles(db, "gravyblock");

  // which briefs need a plan: no plan of this version yet, or a failed one whose retry time has come
  const todo: typeof GRAVYBLOCK_BRIEFS = [];
  const seeds = new Map<string, string[]>();
  for (const b of GRAVYBLOCK_BRIEFS) {
    const angle = angles.find((a) => a.id === b.angleId);
    if (!angle) continue;
    // a video that is public, approved or being made is left exactly as it is
    if (["approved", "public", "in_production", "ready_for_review"].includes(angle.status)) continue;
    const rec = await getSetting<PlanRecord | null>(planKey(b.key), null, db);
    // a plan whose RENDER failed full QA is replanned with what the QA found, internally, a bounded number of times: it never waits for a person
    // a concept the render marked blocked is stuck the same way whatever its angle says (it is never made again until replanned)
    const stored = await getSetting<StoredConcept | null>(conceptKey(`gravyblock:${b.key}`), null, db);
    const stuck = stored?.status === "blocked";
    if (rec?.ok && rec.v === PLANNER_VERSION && (angle.status === "blocked" || stuck)) {
      // a bounded number of replans a day: another round is allowed once a day has passed, so a concept never stays stuck for good
      const fresh = Date.now() - Date.parse(rec.qaReplanAt ?? rec.at) > 24 * 3_600_000;
      const used = fresh ? 0 : rec.qaReplans ?? 0;
      if (used < 6) {
        const failed = await renderFailures(db, product.id, `gravyblock:${b.key}`);
        seeds.set(b.key, failed.length ? failed : ["the last finished video did not pass the creative standard: choose a different hook, different screens and a clearer payoff"]);
        await setSetting(planKey(b.key), { ...rec, qaReplans: used + 1, qaReplanAt: new Date().toISOString() }, ACTOR, db, { audited: false });
        todo.push(b);
        continue;
      }
    }
    if (rec?.ok && rec.v === PLANNER_VERSION) continue;
    if (rec && !rec.ok && rec.v === PLANNER_VERSION && !deps.retryNow && Date.now() - Date.parse(rec.at) < RETRY_AFTER_MS) continue;
    todo.push(b);
  }
  if (!todo.length) return report;

  const corpus = deps.corpus ?? (await siteCorpus(db, "https://gravyblock.com", GRAVYBLOCK_PLAN_PATHS));
  const accepted: CreativeFingerprint[] = [];
  // plans already accepted for the other briefs count as history too, so the set is distinct from itself
  for (const b of GRAVYBLOCK_BRIEFS) {
    const rec = await getSetting<PlanRecord | null>(planKey(b.key), null, db);
    if (rec?.ok && rec.fp && !todo.includes(b)) accepted.push(rec.fp);
  }
  const base = await creativeHistory(db, product.id, "");
  const ctxBase = { corpus: groundedCorpus(corpus, verified), facts: verified, prohibited, brand: GRAVYBLOCK_BRAND, slug: "gravyblock", productName: "GravyBlock", origin: "https://gravyblock.com", ctaHost: "gravyblock.com" };
  for (const b of todo) {
    const specId = `gravyblock:${b.key}`;
    const others = [...base.filter((h) => h.specId !== specId), ...accepted];
    const planned = await planTour(b, { ...ctxBase, history: others }, others, (deps.ask ?? ((id: string) => aiAsk(db, id)))(specId), undefined, seeds.get(b.key) ?? []);
    if (!planned.ok) {
      await setSetting(planKey(b.key), { v: PLANNER_VERSION, at: new Date().toISOString(), ok: false, attempts: planned.attempts, problems: planned.problems } satisfies PlanRecord, ACTOR, db, { audited: false });
      report.problems.push(`${specId}: no acceptable plan after ${planned.attempts} attempts: ${planned.problems.slice(0, 2).join(" | ")}`);
      log(`gravyblock: planning ${specId} failed internally (${planned.problems[0] ?? "?"}); it will plan again later`);
      continue;
    }
    const c = conceptFromExplainer(planned.def);
    const next: StoredConcept = { specId, status: "ready", concept: c, alternates: [], nextVariant: 2, attempts: [], generatedAt: new Date().toISOString() };
    await setSetting(conceptKey(specId), next, ACTOR, db, { audited: false });
    const fp = fingerprintOfConcept(c);
    accepted.push(fp);
    await setSetting(planKey(b.key), { v: PLANNER_VERSION, at: new Date().toISOString(), ok: true, attempts: planned.attempts, fp } satisfies PlanRecord, ACTOR, db, { audited: false });
    await updateAngle(db, ACTOR, "gravyblock", (a) => a.id === b.angleId, { specId, hook: c.hook, yt: planned.yt, scenes: c.capturePlan.map((p) => p.heading), status: "planned" });
    const was = angles.find((a) => a.id === b.angleId)?.status;
    (was === "unlisted_review" || was === "blocked" ? report.reopened : report.stored).push(specId);
    log(`gravyblock: planned ${specId} in ${planned.attempts} attempt(s): "${c.hook}"`);
  }
  return report;
}

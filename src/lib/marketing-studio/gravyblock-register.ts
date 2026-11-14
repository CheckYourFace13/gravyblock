/**
 * Registers GravyBlock's own explainer videos (PRODUCT EXPLAINER / WORKFLOW VISUALIZATION: lit-up steps, no clickable site controls) with the portfolio loop, by itself.
 * GravyBlock works out of sight, so the generator that looks for real controls to click never finds anything; these approved explainers are the first five videos instead.
 * Each tick this stores the concepts, attaches them to their topic angles and keeps them moving: a concept that changed (or an engine fix, by bumping EXPLAINER_VERSION) gets a fresh try
 * automatically, and one that failed QA is tried again a bounded number of times. Nothing is published; every video still goes to the owner's review.
 */
import { createHash } from "node:crypto";
import type { StudioDb } from "./db";
import { GRAVYBLOCK_EXPLAINERS, MARKETING_STUDIO_FACTS } from "./gravyblock-explainers";
import { getAngles, updateAngle } from "./library-store";
import { addFact, listClaims, listFacts, listProducts, verifyFact } from "./repository";
import { getSetting, setSetting } from "./runtime";
import { INTERNAL_SCOPE } from "./scope";
import { conceptFromExplainer } from "./video/concepts/explainer";
import { conceptKey, type StoredConcept } from "./video/concepts/registry";
import { hookProblems, scriptProblems } from "./video/concepts/validate";

const ACTOR = "gravyblock-explainers";
/** Bump when the explainer renderer or its QA changes in a way that could rescue a video that failed before. */
export const EXPLAINER_VERSION = 3;
const MAX_RETRIES = 3;
const RETRY_AFTER_MS = 6 * 3_600_000;
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export type RegisterReport = { stored: string[]; reopened: string[]; problems: string[] };

export async function registerGravyblockExplainers(db: StudioDb, log: (m: string) => void = () => {}): Promise<RegisterReport> {
  const report: RegisterReport = { stored: [], reopened: [], problems: [] };
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === "gravyblock");
  if (!product) return report;
  // the owner's own statements about Marketing Studio are Product Truth (owner-entered)
  const facts = await listFacts(INTERNAL_SCOPE, product.id, db);
  for (const value of MARKETING_STUDIO_FACTS) {
    const have = facts.find((f) => f.status === "current" && norm(f.factValue) === norm(value));
    if (have?.verifiedAt) continue;
    const row = have ?? (await addFact(INTERNAL_SCOPE, ACTOR, product.id, { factKey: "capability", factValue: value, sourceKind: "owner_entered" }, db));
    await verifyFact(INTERNAL_SCOPE, ACTOR, product.id, row.id, db);
  }
  const prohibited = (await listClaims(INTERNAL_SCOPE, product.id, db)).filter((c) => c.kind === "prohibited").map((c) => c.text);
  for (const e of GRAVYBLOCK_EXPLAINERS) {
    const c = conceptFromExplainer(e.def);
    const problems = [...hookProblems(c.hook, c.productName), ...scriptProblems(c.narration.map((l) => ({ spoken: l.spoken.replace(/\{[^}]*\}/g, "") })), c.onScreen.map((o) => o.text), prohibited)];
    if (problems.length) {
      report.problems.push(`${c.specId}: ${problems.join(" | ")}`);
      continue;
    }
    const angle = (await getAngles(db, "gravyblock")).find((a) => a.id === e.angleId);
    if (!angle) continue;
    // an explainer that already reached the owner is left exactly as it is
    if (["unlisted_review", "approved", "public", "in_production", "ready_for_review"].includes(angle.status)) continue;
    const fp = createHash("sha1").update(JSON.stringify(c)).update(String(EXPLAINER_VERSION)).digest("hex").slice(0, 12);
    const fpKey = `video_explainer_fp_${c.specId.replace(/[^a-z0-9]+/gi, "_")}`;
    const seen = await getSetting<{ fp: string; retries: number; blockedSeen?: string } | null>(fpKey, null, db);
    const stored = await getSetting<StoredConcept | null>(conceptKey(c.specId), null, db);
    const changed = !seen || seen.fp !== fp || !angle.specId || stored?.status !== "ready";
    // QA-failed and blocked: tried again a few times, hours apart, with no one asking
    const blockedSince = seen?.blockedSeen ? Date.parse(seen.blockedSeen) : null;
    const retry = !changed && angle.status === "blocked" && (seen?.retries ?? 0) < MAX_RETRIES && blockedSince !== null && Date.now() - blockedSince > RETRY_AFTER_MS;
    if (!changed && !retry) {
      if (angle.status === "blocked" && !seen?.blockedSeen) await setSetting(fpKey, { ...(seen as { fp: string; retries: number }), blockedSeen: new Date().toISOString() }, ACTOR, db, { audited: false });
      continue;
    }
    const next: StoredConcept = { specId: c.specId, status: "ready", concept: c, alternates: [], nextVariant: 2, attempts: [], generatedAt: new Date().toISOString() };
    await setSetting(conceptKey(c.specId), next, ACTOR, db, { audited: false });
    const description = `${c.hook} ${e.yt.description}\n\n${c.cta.text}: ${c.cta.url}`;
    await updateAngle(db, ACTOR, "gravyblock", (a) => a.id === e.angleId, { specId: c.specId, hook: c.hook, yt: { title: e.yt.title, description }, scenes: c.capturePlan.map((p) => p.heading), status: "planned" });
    await setSetting(fpKey, { fp, retries: changed ? 0 : (seen?.retries ?? 0) + 1 }, ACTOR, db, { audited: false });
    (retry ? report.reopened : report.stored).push(c.specId);
    log(`gravyblock: ${retry ? "tried again" : "registered"} explainer ${c.specId}`);
  }
  return report;
}

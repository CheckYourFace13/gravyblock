// Stores GravyBlock's first video set as PRODUCT EXPLAINER concepts and attaches each to its topic angle, so the portfolio loop (GravyBlock first) renders them, sends them for the owner's
// review and never publishes them itself. Marketing Studio's three owner-entered facts are added to Product Truth first (the owner's own description of his product).
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-gravyblock-explainers.ts [--dry]
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { GRAVYBLOCK_EXPLAINERS, MARKETING_STUDIO_FACTS } from "../../src/lib/marketing-studio/gravyblock-explainers";
import { getAngles, updateAngle } from "../../src/lib/marketing-studio/library-store";
import { addFact, listClaims, listFacts, listProducts, verifyFact } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { setSetting } from "../../src/lib/marketing-studio/runtime";
import { conceptFromExplainer } from "../../src/lib/marketing-studio/video/concepts/explainer";
import { conceptKey, type StoredConcept } from "../../src/lib/marketing-studio/video/concepts/registry";
import { hookProblems, scriptProblems } from "../../src/lib/marketing-studio/video/concepts/validate";

const ACTOR = "owner-directive 2026-11-10 (GravyBlock explainers)";
const DRY = process.argv.includes("--dry");
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

async function main() {
  const db = requireStudioDb();
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === "gravyblock");
  if (!product) throw new Error("gravyblock is not a Studio product");
  const facts = await listFacts(INTERNAL_SCOPE, product.id, db);
  for (const value of MARKETING_STUDIO_FACTS) {
    const have = facts.find((f) => f.status === "current" && norm(f.factValue) === norm(value));
    if (have?.verifiedAt) continue;
    console.log(`${DRY ? "would add" : "adding"} owner-entered fact: ${value}`);
    if (DRY) continue;
    const row = have ?? (await addFact(INTERNAL_SCOPE, ACTOR, product.id, { factKey: "capability", factValue: value, sourceKind: "owner_entered" }, db));
    await verifyFact(INTERNAL_SCOPE, ACTOR, product.id, row.id, db);
  }
  const prohibited = (await listClaims(INTERNAL_SCOPE, product.id, db)).filter((c) => c.kind === "prohibited").map((c) => c.text);
  for (const e of GRAVYBLOCK_EXPLAINERS) {
    const c = conceptFromExplainer(e.def);
    const problems = [...hookProblems(c.hook, c.productName), ...scriptProblems(c.narration.map((l) => ({ spoken: l.spoken.replace(/\{[^}]*\}/g, "") })), c.onScreen.map((o) => o.text), prohibited)];
    console.log(`${c.specId}: ${problems.length ? `PROBLEMS: ${problems.join(" | ")}` : "script gates pass"} (about ${c.estSeconds}s)`);
    if (problems.length || DRY) continue;
    const stored: StoredConcept = { specId: c.specId, status: "ready", concept: c, alternates: [], nextVariant: 2, attempts: [], generatedAt: new Date().toISOString() };
    await setSetting(conceptKey(c.specId), stored, ACTOR, db, { audited: false });
    const description = `${c.hook} ${e.yt.description}\n\n${c.cta.text}: ${c.cta.url}`;
    const hit = (await getAngles(db, "gravyblock")).find((a) => a.id === e.angleId);
    if (!hit) throw new Error(`no GravyBlock angle ${e.angleId}`);
    await updateAngle(db, ACTOR, "gravyblock", (a) => a.id === e.angleId, { specId: c.specId, hook: c.hook, yt: { title: e.yt.title, description }, scenes: c.capturePlan.map((p) => p.heading), ...(["blocked", "in_production"].includes(hit.status) ? { status: "planned" as const } : {}) });
    console.log(`  stored and attached to ${e.angleId}`);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => closeStudioDb());

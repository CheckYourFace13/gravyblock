// The language-model creative step for ONE angle: shows the candidate demonstrations, asks the model for the copy, judges it with the deterministic gates and the
// fact-checker, prints everything, and (with --save) stores the accepted concept so marketing-concept-render.ts can render it. Capped at $5 a month (ai-budget.ts);
// uploads, queues and publishes nothing.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-concept-ai.ts <slug> <position> [--plans] [--save] [--pool N]
import { eq } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { consumes, type AngleEntry } from "../../src/lib/marketing-studio/library";
import { PLAN_PRODUCTS } from "../../src/lib/marketing-studio/library-plan";
import { getAngles } from "../../src/lib/marketing-studio/library-store";
import { getBrandProfile, listClaims, listFacts, listProducts } from "../../src/lib/marketing-studio/repository";
import { getSetting, setSetting } from "../../src/lib/marketing-studio/runtime";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { aiConcept } from "../../src/lib/marketing-studio/video/concepts/ai-copy";
import { spendNow, usd } from "../../src/lib/marketing-studio/video/concepts/ai-budget";
import { rankedPairs, varied } from "../../src/lib/marketing-studio/video/concepts/generate";
import { conceptKey, discoveryKey, type StoredConcept } from "../../src/lib/marketing-studio/video/concepts/registry";
import type { GeneratorInput, PageDiscovery } from "../../src/lib/marketing-studio/video/concepts/types";

const ACTOR = "concept-generator ai step (owner directive 2026-11-08)";
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flag = (n: string) => process.argv.includes(`--${n}`);
const pool = Number(process.argv[process.argv.indexOf("--pool") + 1]) || 4;

async function main() {
  const [slug, pos] = args;
  if (!slug || !pos) throw new Error("usage: marketing-concept-ai.ts <slug> <position> [--plans] [--save] [--pool N]");
  const db = requireStudioDb();
  const p = PLAN_PRODUCTS.find((x) => x.slug === slug);
  if (!p) throw new Error(`unknown product ${slug}`);
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((x) => x.slug === slug);
  if (!product) throw new Error(`${slug} is not a Studio product`);
  const angles = await getAngles(db, slug);
  const a = angles.find((x) => x.position === Number(pos));
  if (!a) throw new Error(`no angle at position ${pos}`);
  const discoveries = await getSetting<PageDiscovery[]>(discoveryKey(slug), [], db);
  const verified = (await listFacts(INTERNAL_SCOPE, product.id, db)).filter((f) => f.status === "current" && f.verifiedAt).map((f) => f.factValue);
  const prohibited = (await listClaims(INTERNAL_SCOPE, product.id, db)).filter((c) => c.kind === "prohibited").map((c) => c.text);
  const brand = await getBrandProfile(INTERNAL_SCOPE, product.id, db);
  const allAngles: AngleEntry[] = [];
  for (const q of PLAN_PRODUCTS) allAngles.push(...(await getAngles(db, q.slug)));
  const usedControls: string[] = slug === "sendfable" ? ["Monthly", "Annual", "How does SMS pricing work?", "Can I cancel anytime?"] : [];
  const vids = await db.select({ sb: ms.msVideos.storyboard, status: ms.msVideos.status }).from(ms.msVideos).where(eq(ms.msVideos.productId, product.id));
  const said = vids.filter((x) => !["superseded", "failed", "qa_failed"].includes(x.status)).map((x) => x.sb as { transcript?: Array<{ text: string }>; onScreen?: Array<{ text: string }>; claims?: Array<{ sources: Array<{ quote: string }> }> } | null).flatMap((s) => [...(s?.transcript ?? []).map((t) => t.text), ...(s?.onScreen ?? []).map((o) => o.text), ...(s?.claims ?? []).flatMap((c) => c.sources.map((q) => q.quote))]).join(" | ").toLowerCase();
  for (const d of discoveries) for (const g of d.groups) for (const c of g.controls) if (said.includes(c.name.toLowerCase())) usedControls.push(c.name);
  // --calc: a proof built around the product's own calculator, under its own spec id (never added to the library or the queue)
  const argOf = (n: string) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : undefined);
  const calc = flag("calc") ? discoveries.flatMap((d) => d.calcs ?? [])[0] : undefined;
  if (flag("calc") && !calc) throw new Error("no calculator was discovered for this product");
  const angle: AngleEntry = calc ? { ...a, id: `${slug}-proof-${calc.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`, title: `${p.name}: ${calc.heading}`, hook: argOf("hook") ?? "", goal: argOf("goal") ?? `show how the real ${calc.heading.toLowerCase()} works on ${p.name}`, audience: argOf("audience") ?? a.audience, coreBenefit: argOf("benefit") ?? `see the answer instead of guessing`, features: [calc.heading, ...calc.fields.map((f) => f.label)], scenes: [] } : a;
  const specId = `${slug}:${angle.id.slice(slug.length + 1)}`;
  const input: GeneratorInput = {
    specId,
    slug,
    productName: p.name,
    origin: new URL(p.home).origin,
    home: p.home,
    brand: { primary: (brand?.colors as Record<string, string> | undefined)?.primary },
    angle: { id: angle.id, role: angle.role, title: angle.title, hook: angle.hook, goal: angle.goal, audience: angle.audience, coreBenefit: angle.coreBenefit, features: angle.features, scenes: angle.scenes, cta: angle.cta, funnel: angle.funnel },
    discoveries,
    verifiedFacts: verified,
    prohibited,
    takenHooks: allAngles.filter((x) => x.id !== a.id && consumes(x)).map((x) => x.hook),
    // --proof waives the duplicate gate for a proof that is never queued or published (the existing public video may already cover this product feature)
    consumed: flag("proof") ? [] : angles.filter((e) => e.id !== a.id && consumes(e) && e.status !== "planned").map((e) => ({ id: e.id, slug: e.slug, role: e.role, title: e.title, hook: e.hook, goal: e.goal, coreBenefit: e.coreBenefit, features: e.features, scenes: e.scenes, cta: e.cta, status: e.status })),
    usedControls,
    variant: 0,
  };
  console.log(`${p.name} video ${pos}: "${a.title}" (${specId})`);
  const rp = rankedPairs(input);
  if (rp.reason) console.log(`no candidate demonstrations: ${rp.reason}`);
  varied(rp.pairs, pool).forEach((pair, i) => console.log(`plan ${i + 1}: ${pair.map((c) => `${c.plan.path} [${c.plan.heading || "-"}] ` + c.plan.clicks.map((k) => `${k.kind}:${k.name} => ${k.payoff}`).join(" ; ")).join("  ||  ")}`));
  if (flag("plans")) return;
  const before = await spendNow(db);
  const r = await aiConcept(db, input, { pool });
  const after = await spendNow(db);
  console.log(r.log.join("\n"));
  if (!r.concept) {
    console.log(`NO CONCEPT: ${r.reasons.join(" | ")}`);
  } else {
    const c = r.concept;
    console.log(JSON.stringify({ hook: c.hook, script: c.narration.map((l) => `${l.sceneId}: ${l.spoken}`), cta: c.cta, capturePlan: c.capturePlan.map((pl) => ({ page: pl.path, area: pl.heading, taps: pl.clicks.map((k) => `${k.kind}:${k.name} => ${k.payoff}`) })), estSeconds: c.estSeconds, firstTapMs: c.estFirstTapMs, gate: c.gate?.checks.map((k) => `${k.ok ? "PASS" : "FAIL"} ${k.label}: ${k.detail}`) }, null, 1));
    if (flag("save")) {
      const stored: StoredConcept = { specId, status: "ready", concept: c, alternates: [], nextVariant: 1, attempts: [], generatedAt: new Date().toISOString(), note: "written by the language-model creative step" };
      await setSetting(conceptKey(specId), stored, ACTOR, db, { audited: false });
      console.log(`saved ${specId}`);
    }
  }
  console.log(`AI cost this run: ${usd(r.micros)} over ${r.calls} call(s) (${r.cachedCalls} cached); month ${after.spentUsd.toFixed(4)} / ${after.capUsd} (was ${before.spentUsd.toFixed(4)})`);
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => closeStudioDb());

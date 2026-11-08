// The autonomous concept and script generator, run over the portfolio library. For every planned angle without a script it (1) discovers what the live product
// can really demonstrate, (2) generates the concept, script and capture plan from verified Product Truth, (3) judges it against the permanent creative
// standard and the duplicate gate, regenerating up to 16 variants, and (4) when the angle cannot be made well from this product, replaces it with another
// verified angle the product CAN demonstrate. Stores the standard and every concept; renders, uploads and publishes nothing. Read-only toward every site.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-concepts-run.ts [slug] [--no-discover] [--dry]
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { consumes, type AngleEntry } from "../../src/lib/marketing-studio/library";
import { PLAN_PRODUCTS } from "../../src/lib/marketing-studio/library-plan";
import { getAngles } from "../../src/lib/marketing-studio/library-store";
import { getBrandProfile, listClaims, listFacts, listProducts } from "../../src/lib/marketing-studio/repository";
import { getSetting, setSetting } from "../../src/lib/marketing-studio/runtime";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { discoverProduct } from "../../src/lib/marketing-studio/video/concepts/discover";
import { generateConcept } from "../../src/lib/marketing-studio/video/concepts/generate";
import { conceptKey, discoveryKey, type StoredConcept } from "../../src/lib/marketing-studio/video/concepts/registry";
import { standardRecord, STANDARD_SETTING } from "../../src/lib/marketing-studio/video/concepts/standard";
import type { GeneratorInput, PageDiscovery } from "../../src/lib/marketing-studio/video/concepts/types";

const ACTOR = "concept-generator (owner directive 2026-11-08, creative standard)";
const DRY = process.argv.includes("--dry");
const ONLY = process.argv.slice(2).find((a) => !a.startsWith("--"));

/** Controls the hand-written videos already used, so a new video demonstrates something else. */
const HAND_WRITTEN_CONTROLS: Record<string, string[]> = { sendfable: ["Monthly", "Annual", "How does SMS pricing work?", "Can I cancel anytime?"] };

const ytFor = (c: NonNullable<StoredConcept["concept"]>) => {
  const title = c.title.length <= 100 ? c.title : `${c.title.slice(0, 97)}...`;
  const body = c.payoff.map((p) => (/[.!?]$/.test(p) ? p : `${p}.`)).join(" ");
  return { title, description: `${/[?!.]$/.test(c.hook) ? c.hook : `${c.hook}?`} ${body}\n\n${c.cta.text}: ${c.cta.url}` };
};

async function main() {
  const db = requireStudioDb();
  if (!DRY) await setSetting(STANDARD_SETTING, standardRecord(), ACTOR, db);
  const products = await listProducts(INTERNAL_SCOPE, db);
  const allAngles: Record<string, AngleEntry[]> = {};
  for (const p of PLAN_PRODUCTS) allAngles[p.slug] = await getAngles(db, p.slug);
  const takenHooks = (except: string) => Object.values(allAngles).flat().filter((a) => a.id !== except && consumes(a)).map((a) => a.hook);
  const tally = { evaluated: 0, passedAsPlanned: 0, regenerated: 0, replaced: 0, blocked: 0, ready: 0 };
  const lines: string[] = [];

  for (const p of PLAN_PRODUCTS.filter((x) => !ONLY || x.slug === ONLY)) {
    const product = products.find((x) => x.slug === p.slug);
    if (!product) {
      lines.push(`${p.name}: not in Studio, skipped`);
      continue;
    }
    const angles = allAngles[p.slug];
    const todo = angles.filter((a) => a.status === "planned" && !a.existing && !(a.specId && !a.generated));
    if (!todo.length) {
      lines.push(`${p.name}: nothing to generate`);
      continue;
    }
    // 1. what the live product can really demonstrate
    let discoveries = await getSetting<PageDiscovery[]>(discoveryKey(p.slug), [], db);
    if (!process.argv.includes("--no-discover") || !discoveries.length) {
      const facts0 = (await listFacts(INTERNAL_SCOPE, product.id, db)).filter((f) => f.status === "current" && f.verifiedAt);
      const paths = [...new Set(["/", ...facts0.map((f) => f.sourceUrl).filter((u): u is string => Boolean(u)).map((u) => { try { return new URL(u).pathname; } catch { return ""; } }).filter(Boolean), ...angles.map((a) => { try { return new URL(a.cta.url).pathname; } catch { return ""; } })])].filter((x) => x && !/\.(png|jpg|svg|pdf)$/i.test(x));
      console.log(`discovering ${p.name} (${paths.length} pages)`);
      discoveries = await discoverProduct(p.home, paths, (m) => console.log(m));
      if (!DRY) await setSetting(discoveryKey(p.slug), discoveries, ACTOR, db, { audited: false });
    }
    const verified = (await listFacts(INTERNAL_SCOPE, product.id, db)).filter((f) => f.status === "current" && f.verifiedAt).map((f) => f.factValue);
    const prohibited = (await listClaims(INTERNAL_SCOPE, product.id, db)).filter((c) => c.kind === "prohibited").map((c) => c.text);
    const brand = await getBrandProfile(INTERNAL_SCOPE, product.id, db);
    const usedControls = [...(HAND_WRITTEN_CONTROLS[p.slug] ?? [])];
    for (const a of todo.sort((x, y) => x.position - y.position)) {
      tally.evaluated++;
      const specId = `${p.slug}:${a.id.slice(p.slug.length + 1)}`;
      const base = (angle: AngleEntry): GeneratorInput => ({
        specId,
        slug: p.slug,
        productName: p.name,
        origin: new URL(p.home).origin,
        home: p.home,
        brand: { primary: (brand?.colors as Record<string, string> | undefined)?.primary },
        angle: { id: angle.id, role: angle.role, title: angle.title, hook: angle.hook, goal: angle.goal, audience: angle.audience, coreBenefit: angle.coreBenefit, features: angle.features, scenes: angle.scenes, cta: angle.cta, funnel: angle.funnel },
        discoveries,
        verifiedFacts: verified,
        prohibited,
        takenHooks: takenHooks(angle.id),
        consumed: angles.filter((e) => e.id !== angle.id && consumes(e) && e.status !== "planned").map((e) => ({ id: e.id, slug: e.slug, role: e.role, title: e.title, hook: e.hook, goal: e.goal, coreBenefit: e.coreBenefit, features: e.features, scenes: e.scenes, cta: e.cta, status: e.status })),
        usedControls,
        variant: 0,
      });
      let res = generateConcept(base(a));
      let usedAngle = a;
      let replaced = false;
      if (!res.concept) {
        // another verified angle the product CAN demonstrate: the planned wording is dropped and the angle is rebuilt from the best unused interaction
        const pageGroup = discoveries.flatMap((d) => d.groups).find((g) => g.sequence.length >= 2);
        const alt: AngleEntry = { ...a, id: `${a.id}-alt`, title: `${p.name}: ${pageGroup?.heading || "what you can do here"}`.slice(0, 80), hook: "", goal: `show ${pageGroup?.heading || "a real use"} on ${p.name} working on the live product`, coreBenefit: `see ${pageGroup?.heading || "it"} work before you decide`, features: pageGroup ? pageGroup.controls.map((c) => c.name).slice(0, 4) : [], scenes: [] };
        const r2 = generateConcept({ ...base(alt), specId: `${p.slug}:${alt.id.slice(p.slug.length + 1)}` });
        if (r2.concept) {
          res = { ...r2, attempts: [...res.attempts, ...r2.attempts] };
          usedAngle = alt;
          replaced = true;
        }
      }
      const sid = replaced ? `${p.slug}:${usedAngle.id.slice(p.slug.length + 1)}` : specId;
      if (res.concept) {
        const c = res.concept;
        c.specId = sid;
        c.angle.id = usedAngle.id;
        c.angle.title = usedAngle.title;
        c.angle.funnel = usedAngle.funnel;
        c.title = c.title.length ? c.title : usedAngle.title;
        const stored: StoredConcept = { specId: sid, status: "ready", concept: c, alternates: res.alternates ?? [], nextVariant: c.variant + 1, attempts: res.attempts, generatedAt: new Date().toISOString(), ...(replaced ? { note: `replaced "${a.title}": the live product could not demonstrate it well` } : {}) };
        const clicks = c.capturePlan.flatMap((pl) => pl.clicks.map((k) => k.name));
        usedControls.push(...clicks);
        if (replaced) tally.replaced++;
        else if (c.variant > 0) tally.regenerated++;
        else tally.passedAsPlanned++;
        tally.ready++;
        if (!DRY) {
          await setSetting(conceptKey(sid), stored, ACTOR, db, { audited: false });
          const cur = await getAngles(db, p.slug);
          const entry: AngleEntry = { ...usedAngle, hook: c.hook, specId: sid, yt: ytFor(c), generated: { variant: c.variant, personality: c.personality, ...(replaced ? { replaces: a.id } : {}) }, scenes: c.capturePlan.map((pl) => pl.heading || pl.path), features: clicks, cta: { text: c.cta.text, url: c.cta.url } };
          const next = replaced ? [...cur.map((e) => (e.id === a.id ? { ...e, status: "superseded" as const, replacedBy: usedAngle.id } : e)), entry] : cur.map((e) => (e.id === a.id ? entry : e));
          await setSetting(`video_angles_${p.slug}`, next, ACTOR, db, { audited: false });
          allAngles[p.slug] = next;
        }
        lines.push(`${p.name} video ${a.position}: READY${replaced ? " (REPLACED)" : c.variant > 0 ? ` (variant ${c.variant})` : ""} "${c.hook}" | ${c.personality} | ${c.estSeconds}s | taps: ${clicks.join(" > ")}`);
      } else {
        tally.blocked++;
        const why = res.attempts.flatMap((x) => x.reasons).slice(0, 3);
        if (!DRY) await setSetting(conceptKey(sid), { specId: sid, status: "blocked", concept: null, alternates: [], nextVariant: 0, attempts: res.attempts, generatedAt: new Date().toISOString() } satisfies StoredConcept, ACTOR, db, { audited: false });
        lines.push(`${p.name} video ${a.position}: BLOCKED, no verified angle passes the standard yet. ${why.join(" | ")}`);
      }
    }
  }
  console.log(`\nCONCEPT GENERATION${DRY ? " (dry run)" : ""}\n${lines.join("\n")}\n`);
  console.log(JSON.stringify(tally));
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => closeStudioDb());

// Re-runs discovery (real, read-only use of the live product: control groups, links, searches, calculators) for ONE product and stores it. Generates and
// renders nothing; the AI step reads what this stores.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-discover.ts <slug> [/extra/path ...]
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { PLAN_PRODUCTS } from "../../src/lib/marketing-studio/library-plan";
import { getAngles } from "../../src/lib/marketing-studio/library-store";
import { listFacts, listProducts } from "../../src/lib/marketing-studio/repository";
import { setSetting } from "../../src/lib/marketing-studio/runtime";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { discoverProduct } from "../../src/lib/marketing-studio/video/concepts/discover";
import { discoveryKey } from "../../src/lib/marketing-studio/video/concepts/registry";

async function main() {
  const [slug, ...extra] = process.argv.slice(2);
  const p = PLAN_PRODUCTS.find((x) => x.slug === slug);
  if (!p) throw new Error("usage: marketing-discover.ts <slug> [/path ...]");
  const db = requireStudioDb();
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((x) => x.slug === slug);
  if (!product) throw new Error(`${slug} is not a Studio product`);
  const facts = (await listFacts(INTERNAL_SCOPE, product.id, db)).filter((f) => f.status === "current" && f.verifiedAt);
  const angles = await getAngles(db, slug);
  const pathOf = (u: string) => { try { return new URL(u, p.home).pathname; } catch { return ""; } };
  const paths = [...new Set([...extra, "/", ...facts.map((f) => f.sourceUrl).filter((u): u is string => Boolean(u)).map(pathOf), ...angles.map((a) => pathOf(a.cta.url))])].filter((x) => x && !/\.(png|jpg|svg|pdf)$/i.test(x));
  console.log(`discovering ${p.name}: ${paths.slice(0, 7).join(" ")}`);
  const d = await discoverProduct(p.home, paths, (m) => console.log(m));
  await setSetting(discoveryKey(slug), d, "discovery (owner directive 2026-11-08)", db, { audited: false });
  for (const pg of d) for (const c of pg.calcs ?? []) console.log(`CALCULATOR ${pg.path} "${c.heading}": ${c.fields.map((f) => `${f.label}=${f.value}`).join(", ")}\n` + c.steps.map((s) => `  ${s.name} -> ${s.value}: ${s.newText.slice(0, 160)}`).join("\n"));
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => closeStudioDb());

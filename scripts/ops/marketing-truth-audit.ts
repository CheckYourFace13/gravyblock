// Read-only: lists the Studio products and, for the slugs given, every Product Truth fact (current, verified or not) with its source. Changes nothing.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-truth-audit.ts [slug ...]
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { listFacts, listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";

async function main() {
  const db = requireStudioDb();
  const products = await listProducts(INTERNAL_SCOPE, db);
  console.log(`products (${products.length}): ${products.map((p) => `${p.slug}[${p.kind},${p.status}]`).join(", ")}`);
  for (const slug of process.argv.slice(2)) {
    const p = products.find((x) => x.slug === slug);
    if (!p) { console.log(`\n${slug}: NOT a Studio product`); continue; }
    const facts = await listFacts(INTERNAL_SCOPE, p.id, db);
    console.log(`\n${p.name} (${p.slug}) ${p.id}: ${facts.length} facts`);
    for (const f of facts) console.log(`  ${f.status} ${f.verifiedAt ? "VERIFIED" : "unverified"} ${f.factKey}: ${f.factValue.slice(0, 140)}  <${f.sourceUrl ?? f.sourceKind}>`);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());

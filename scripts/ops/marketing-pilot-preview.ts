// Previews the replacement concept set for the pilot products WITHOUT touching the database: it builds the concepts from verified Product Truth,
// renders them with the real templates and approved assets, runs the full QA, and writes PNG files to a folder. Nothing is stored or posted.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-pilot-preview.ts out-dir [--all] [slug ...]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildConceptSpecs } from "../../src/lib/marketing-studio/creative/copy";
import { previewConcept, type ConceptLike } from "../../src/lib/marketing-studio/creative/pipeline";
import { SIZE_KEYS, type SizeKey } from "../../src/lib/marketing-studio/creative/theme";
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { listAssets, listFacts, listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";

async function main() {
  const args = process.argv.slice(2);
  const out = args[0] ?? "preview-out";
  const all = args.includes("--all");
  const slugs = args.slice(1).filter((a) => !a.startsWith("--"));
  const sizes: SizeKey[] = all ? [...SIZE_KEYS] : ["square"];
  mkdirSync(out, { recursive: true });
  const db = requireStudioDb();
  const products = (await listProducts(INTERNAL_SCOPE, db)).filter((p) => (slugs.length ? slugs : ["drinkknird", "rentalnoodle", "scribblezap"]).includes(p.slug));
  let failures = 0;
  for (const p of products) {
    const facts = await listFacts(INTERNAL_SCOPE, p.id, db);
    const assets = await listAssets(INTERNAL_SCOPE, p.id, db);
    const screenshots = assets.filter((a) => a.kind === "screenshot" && a.approved === "true").map((a) => ({ id: a.id, name: a.originalName ?? "" }));
    const specs = buildConceptSpecs(facts, { hasScreenshot: screenshots.length > 0, screenshots });
    console.log(`\n${p.name}: ${specs.length} concepts`);
    for (const [i, s] of specs.entries()) {
      const concept: ConceptLike = { id: `preview-${p.slug}-${i}`, productId: p.id, family: s.family, headline: s.headline, subhead: s.subhead, ctaText: s.ctaText, ctaUrl: s.ctaUrl, payload: s.payload, factIds: s.factIds };
      console.log(`  ${i + 1}. ${s.family} | "${s.headline}"${s.subhead ? ` | ${s.subhead.slice(0, 70)}` : ""}`);
      const r = await previewConcept(
        concept,
        sizes,
        ({ size, png }) => {
          writeFileSync(path.join(out, `${p.slug}-${i + 1}-${s.family}-${size}.png`), png);
        },
        INTERNAL_SCOPE,
        db,
      );
      for (const x of r.results) {
        if (x.failed.length) failures++;
        console.log(`     ${x.size}: ${x.status}${x.failed.length ? ` :: ${x.failed.join(" || ")}` : ""}`);
      }
    }
    const heads = specs.map((s) => s.headline.toLowerCase());
    console.log(`  distinct headlines: ${new Set(heads).size}/${heads.length}`);
  }
  console.log(`\nQA failures: ${failures}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exitCode = 1;
  })
  .finally(() => closeStudioDb());

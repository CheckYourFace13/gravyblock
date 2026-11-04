// Read-only check of the owner review: loads the real pilot output, prints what the Review screen shows, and builds the private bundle.
// Posts, schedules and connects nothing.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-review-check.ts [bundle-output-path]
import { writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { loadReview } from "../../src/lib/marketing-studio/review";
import { buildReviewBundle } from "../../src/lib/marketing-studio/review-bundle";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";

async function main() {
  const db = requireStudioDb();
  const review = await loadReview(INTERNAL_SCOPE, db);
  for (const p of review) {
    console.log(`\n${p.name} (${p.kind}): ${p.representatives.length} representative of ${p.totalCreatives} images`);
    for (const c of p.representatives) {
      console.log(`  - ${c.family} ${c.sizeKey} ${c.width}x${c.height} ${c.aspect} | qa ${c.qa.passed ? "PASS" : "FAIL"} (${c.qa.checks}) | facts ${c.facts.length} (${c.facts.every((f) => f.verified) ? "all verified" : "UNVERIFIED present"}) | cta ${c.ctaText ?? "none"} | "${c.headline}"`);
    }
    const v = p.video;
    if (!v) console.log("  video: NONE");
    else console.log(`  video: ${v.status} ${v.durationSec}s ${v.width}x${v.height} | qa ${v.qa.passed ? "PASS" : "FAIL"} (${v.qa.checks}) | captions ${v.captions.length} | endCard ${v.endCard ? `"${v.endCard.headline}" cta ${v.endCard.ctaText}` : "NONE"} | sources ${v.sources.length} | facts ${v.facts.length} | file ${v.assetId ? "yes" : "NO"}`);
  }
  const b = await buildReviewBundle(INTERNAL_SCOPE, db);
  console.log(`\nbundle: ${b.fileName} ${(b.zip.length / 1048576).toFixed(1)} MB, ${b.images} images, ${b.videos} videos, ${b.files.length} files`);
  const out = process.argv[2];
  if (out) {
    writeFileSync(out, b.zip, { mode: 0o600 });
    console.log(`written (owner-only) to ${out}`);
  }
  const [pubs, conns] = await Promise.all([db.execute(sql`select count(*)::int as n from ms_publications where status in ('scheduled','publishing','published')`), db.execute(sql`select count(*)::int as n from ms_connections`)]);
  console.log(`live publications: ${(pubs as unknown as Array<{ n: number }>)[0].n}, connections: ${(conns as unknown as Array<{ n: number }>)[0].n}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeStudioDb());

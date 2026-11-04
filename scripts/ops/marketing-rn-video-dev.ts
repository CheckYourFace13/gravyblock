// Dry run of a product demo (default RentalNoodle; pass a slug as the second argument): real capture, real voiceover, real render and full QA, written to a folder. Stores nothing in the database and
// adds no facts. Used to look at the video before it is stored for owner review.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-rn-video-dev.ts /tmp/gbdemo [--reuse-capture]
import { writeFileSync } from "node:fs";
import path from "node:path";
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { produceDemo } from "../../src/lib/marketing-studio/video/demo/run";

async function main() {
  const out = process.argv[2] ?? "/tmp/gbdemo";
  const slug = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "rentalnoodle";
  const t0 = Date.now();
  const made = await produceDemo({ slug, db: requireStudioDb(), workDir: out, writeFacts: false, reuse: { manifest: process.argv.includes("--reuse-capture") }, log: (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`) });
  writeFileSync(path.join(out, "record.json"), JSON.stringify({ record: made.record, qa: made.qa, stats: made.stats }, null, 2));
  console.log(`\nfile: ${made.file}\nstats: ${JSON.stringify(made.stats)}\nmetrics: ${JSON.stringify(made.qa.metrics)}\nQA ${made.qa.passed ? "PASSED" : "FAILED"}`);
  for (const c of made.qa.checks) console.log(`  ${c.ok ? "ok  " : c.severity === "warn" ? "warn" : "FAIL"} ${c.id}: ${c.detail}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.stack : e);
    process.exitCode = 1;
  })
  .finally(() => closeStudioDb());

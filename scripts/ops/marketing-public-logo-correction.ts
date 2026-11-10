// Prepares a CORRECTED version of an already-public video whose logo was altered by the old stage (owner directive 2026-11-08). The public video is never touched:
// this creates a new demo record beside it (and with --queue the worker renders it under the logo-integrity gate, one heavy job at a time). Upload it UNLISTED for owner review with
// marketing-video-review.ts <slug> --video <id> --upload-unlisted .... If the owner approves a correction, the migration off the old public video is a deliberate act.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-public-logo-correction.ts <slug> [specId] [--queue]
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { createDemoVideo } from "../../src/lib/marketing-studio/video/demo/queue";

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const slug = args[0];
  if (!slug) throw new Error("usage: marketing-public-logo-correction.ts <slug> [specId] [--queue]");
  const queue = process.argv.includes("--queue");
  const db = requireStudioDb();
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === slug);
  if (!product) throw new Error(`${slug} is not a Studio product`);
  const row = await createDemoVideo(INTERNAL_SCOPE, "logo-correction", product.id, db, { queue, specId: args[1], replaceStale: true });
  console.log(`${product.name}: corrected-logo video ${row.id} created beside the public one${queue ? " and queued for the worker" : ". Render it with marketing-demo-run.ts " + slug}.`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());

// Renders ONE generated concept through the real pipeline (capture, voice, music, frames, full QA including the ten desirability checks) and saves the
// file for inspection. It uploads, emails, queues and publishes nothing; the finished video is only a local review copy and a ready_for_review row.
// Run in its own bounded scope:  systemd-run --scope -p MemoryMax=2200M runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-concept-render.ts <specId>
import { writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { readAssetBytes } from "../../src/lib/marketing-studio/creative/context";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { ensureSpec } from "../../src/lib/marketing-studio/video/concepts/registry";
import { createDemoVideo } from "../../src/lib/marketing-studio/video/demo/queue";
import { renderDemoVideoJob } from "../../src/lib/marketing-studio/video/demo/run";
import { demoSpecFor } from "../../src/lib/marketing-studio/video/demo/specs";

async function main() {
  const specId = process.argv[2];
  if (!specId) throw new Error("usage: marketing-concept-render.ts <specId>");
  const db = requireStudioDb();
  await ensureSpec(db, specId);
  const spec = demoSpecFor(specId);
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === spec.slug);
  if (!product) throw new Error(`${spec.slug} is not a Studio product`);
  const row = await createDemoVideo(INTERNAL_SCOPE, "concept-proof", product.id, db, { queue: false, specId });
  console.log(`rendering ${specId} as video ${row.id}`);
  const r = await renderDemoVideoJob({ videoId: row.id }, INTERNAL_SCOPE, db);
  console.log(JSON.stringify({ videoId: r.videoId, status: r.status, failed: r.failed, metrics: r.metrics }, null, 1));
  const [v] = await db.select().from(ms.msVideos).where(eq(ms.msVideos.id, row.id));
  const qa = v.qa as { checks?: Array<{ id: string; ok: boolean; severity: string; detail: string }> } | null;
  for (const c of qa?.checks ?? []) console.log(`${c.ok ? "PASS" : c.severity === "warn" ? "warn" : "FAIL"} ${c.id}: ${c.detail}`);
  if (v.assetId) {
    const [asset] = await db.select().from(ms.msAssets).where(eq(ms.msAssets.id, v.assetId));
    if (asset) {
      const out = `/tmp/proof-${specId.replace(/[^a-z0-9]+/gi, "_")}.mp4`;
      await writeFile(out, await readAssetBytes(asset));
      console.log(`saved ${out}`);
    }
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => closeStudioDb());

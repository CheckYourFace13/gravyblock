// Queues one real review video per pilot through the Studio queue (storyboard from verified Product Truth and approved real assets, rendered
// by the worker, checked by the automated video QA). Nothing is published.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-pilot-videos.ts
import { eq, inArray } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { createVideoFromProduct } from "../../src/lib/marketing-studio/video/queue";

const PLAN: Array<[slug: string, seconds: number]> = [["rentalnoodle", 30], ["drinkknird", 30], ["scribblezap", 15]];

async function main() {
  const db = requireStudioDb();
  const products = await listProducts(INTERNAL_SCOPE, db);
  const ids: string[] = [];
  for (const [slug, seconds] of PLAN) {
    const p = products.find((x) => x.slug === slug);
    if (!p) continue;
    try {
      const v = await createVideoFromProduct(INTERNAL_SCOPE, "pilot-run", p.id, seconds, db);
      ids.push(v.id);
      console.log(`${p.name}: queued ${seconds}s video ${v.id} (${(v.storyboard as { scenes: unknown[] }).scenes.length} scenes)`);
    } catch (e) {
      console.log(`${p.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  const deadline = Date.now() + 40 * 60_000;
  for (;;) {
    const rows = ids.length ? await db.select().from(ms.msVideos).where(inArray(ms.msVideos.id, ids)) : [];
    if (rows.every((r) => !["queued", "rendering"].includes(r.status)) || Date.now() > deadline) {
      for (const r of rows) {
        const fails = ((r.qa as { checks?: Array<{ ok: boolean; severity: string; id: string; detail: string }> } | null)?.checks ?? []).filter((c) => !c.ok);
        console.log(`\n${r.title}: ${r.status}, ${r.durationMs ? (r.durationMs / 1000).toFixed(1) + "s" : "n/a"}, ${r.bytes ? (r.bytes / 1048576).toFixed(2) + " MB" : "n/a"}, render ${r.renderMs ? (r.renderMs / 1000).toFixed(0) + "s" : "n/a"}, peak ${r.peakRssBytes ? Math.round(r.peakRssBytes / 1048576) + " MB" : "n/a"}${r.error ? ", error: " + r.error : ""}`);
        for (const f of fails) console.log(`   ${f.severity}: ${f.id}: ${f.detail}`);
      }
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  void eq;
  await closeStudioDb();
}
void main();

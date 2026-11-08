// Queues the library videos whose scripts exist: one durable `library_video` job per angle, picked up by the existing Marketing Studio worker one heavy
// job at a time under the resource governor. Idempotent (one job per script). It lists planned angles that still need a script written. Publishes nothing.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-library-queue.ts
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { getAngles } from "../../src/lib/marketing-studio/library-store";
import { PLAN_PRODUCTS } from "../../src/lib/marketing-studio/library-plan";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { enqueue } from "../../src/lib/marketing-studio/runtime";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { DEMO_SPECS } from "../../src/lib/marketing-studio/video/demo/specs";
import { ensureSpec } from "../../src/lib/marketing-studio/video/concepts/registry";

async function main() {
  const db = requireStudioDb();
  const products = await listProducts(INTERNAL_SCOPE, db);
  let order = 0;
  const waiting: string[] = [];
  for (const p of PLAN_PRODUCTS) {
    const product = products.find((x) => x.slug === p.slug);
    for (const e of (await getAngles(db, p.slug)).filter((a) => a.status === "planned").sort((a, b) => a.position - b.position)) {
      if (e.specId) await ensureSpec(db, e.specId).catch(() => {});
      if (!e.specId || !DEMO_SPECS[e.specId] || !product) {
        waiting.push(`${p.name} video ${e.position} (${e.title}): ${product ? "script not written yet" : "not in Studio yet"}`);
        continue;
      }
      const r = await enqueue({ kind: "library_video", weight: "heavy", priority: 2, productId: product.id, dedupeKey: process.argv.includes("--retry") ? `library_video:${e.specId}:retry-${Date.now()}` : `library_video:${e.specId}`, input: { specId: e.specId }, runAfter: new Date(Date.now() + order++ * 1000), maxAttempts: 3 }, db);
      console.log(`${r.id ? "queued" : "already queued"}: ${p.name} video ${e.position} of 3, ${e.title} (${e.specId})`);
    }
  }
  console.log(`\nwaiting for a script: ${waiting.length}`);
  waiting.slice(0, 40).forEach((w) => console.log(`  ${w}`));
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());

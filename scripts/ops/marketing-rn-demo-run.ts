// Renders the queued RentalNoodle pilot demo. This job needs about 1.5 GB at its peak (Chromium, the voice model, FFmpeg), more than the worker's
// 768 MB cap, so it runs in its own bounded systemd scope instead of loosening the worker. It still obeys the Studio governor (host load, free RAM,
// no deploy running, no other heavy job) and the kill switch, and it stores the result as ready_for_review, never approved.
//   systemd-run --scope -p MemoryMax=2G -p MemoryHigh=1800M -p CPUQuota=100% \
//     runuser -u gbstudio -- nice -n 19 ionice -c 3 tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-rn-demo-run.ts
import { and, eq, sql } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { disableState, evaluateGovernor, runningHeavyCount } from "../../src/lib/marketing-studio/runtime";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { renderDemoVideoJob } from "../../src/lib/marketing-studio/video/demo/run";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = requireStudioDb();
  const noodle = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === "rentalnoodle");
  if (!noodle) throw new Error("RentalNoodle not found");
  const [video] = await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.productId, noodle.id), eq(ms.msVideos.status, "queued"), sql`${ms.msVideos.storyboard}->>'kind' = 'demo'`)).limit(1);
  if (!video) throw new Error("There is no queued demo video. Run marketing-rn-demo-start.ts first.");

  // Wait for the same conditions the worker waits for before any heavy job.
  const deadline = Date.now() + 45 * 60_000;
  for (;;) {
    const dis = await disableState(db);
    if (dis.disabled) throw new Error(`The Studio is disabled: ${dis.reasons.join("; ")}`);
    const gov = await evaluateGovernor({ heavy: true });
    const heavy = await runningHeavyCount(db);
    if (gov.allowed && heavy === 0) break;
    if (Date.now() > deadline) throw new Error(`Gave up waiting for the host to be quiet enough: ${gov.reasons.join("; ") || "another heavy job is running"}`);
    console.log(`waiting: ${[...gov.reasons, heavy ? "another heavy job is running" : ""].filter(Boolean).join("; ")}`);
    await sleep(20_000);
  }
  console.log(`rendering demo video ${video.id}`);
  const r = await renderDemoVideoJob({ videoId: video.id }, INTERNAL_SCOPE, db);
  console.log(JSON.stringify(r, null, 2));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeStudioDb());

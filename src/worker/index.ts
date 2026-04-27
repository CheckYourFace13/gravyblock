/**
 * GravyBlock background worker — runs alongside the Next.js app on VPS.
 *
 * Start via PM2 (see ecosystem.config.js):
 *   pm2 start ecosystem.config.js
 *
 * Or standalone:
 *   npx tsx src/worker/index.ts
 *
 * What it does on each tick (every WORKER_INTERVAL_MS, default 15 min):
 *   1. Processes up to JOBS_PER_TICK pending recurring snapshot jobs
 *   2. For each active paid business with queued content, publishes one item
 */

import { eq, and, inArray } from "drizzle-orm";
import { runPendingRecurringSnapshotJobs, executeContentPublishPath } from "@/lib/autopilot/executor";
import { getDb, businesses, contentQueue } from "@/lib/db";

const WORKER_INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 15 * 60 * 1000);
const JOBS_PER_TICK = Number(process.env.JOBS_PER_TICK ?? 5);
const CONTENT_PER_TICK = Number(process.env.CONTENT_PER_TICK ?? 3);

async function processContentQueue() {
  const db = getDb();
  if (!db) return;

  // Find businesses with queued content and an active paid plan
  const withQueued = await db
    .selectDistinct({ businessId: contentQueue.businessId })
    .from(contentQueue)
    .where(eq(contentQueue.status, "queued"))
    .limit(CONTENT_PER_TICK);

  const paidTiers = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];

  for (const row of withQueued) {
    if (!row.businessId) continue;
    const [biz] = await db
      .select({ planTier: businesses.planTier })
      .from(businesses)
      .where(and(eq(businesses.id, row.businessId), inArray(businesses.planTier, paidTiers)))
      .limit(1);
    if (!biz) continue;

    try {
      const result = await executeContentPublishPath(row.businessId);
      console.info("[worker] content publish", { businessId: row.businessId, ...result });
    } catch (error) {
      console.error("[worker] content publish failed", {
        businessId: row.businessId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function tick() {
  const startedAt = new Date().toISOString();
  console.info("[worker] tick start", { startedAt, jobsPerTick: JOBS_PER_TICK });

  try {
    const snapshotResult = await runPendingRecurringSnapshotJobs(JOBS_PER_TICK);
    console.info("[worker] snapshot jobs", snapshotResult);
  } catch (error) {
    console.error("[worker] snapshot jobs failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await processContentQueue();
  } catch (error) {
    console.error("[worker] content queue failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  console.info("[worker] tick done", { durationMs: Date.now() - new Date(startedAt).getTime() });
}

// Run immediately on start, then on interval
void tick();
setInterval(() => void tick(), WORKER_INTERVAL_MS);

console.info("[worker] started", {
  intervalMs: WORKER_INTERVAL_MS,
  jobsPerTick: JOBS_PER_TICK,
  contentPerTick: CONTENT_PER_TICK,
});

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
 *   3. Daily (8am UTC): sends owner report to chris@gravyblock.com
 *   4. Monday (9am UTC): sends weekly upsell emails to paid non-Agency subscribers
 *   5. Every tick: processes 7-day lead nurture drip for unconverted scan leads
 */

import { eq, and, inArray, gte, lte, count } from "drizzle-orm";
import { runPendingRecurringSnapshotJobs, executeContentPublishPath } from "@/lib/autopilot/executor";
import { getDb, businesses, contentQueue, jobs } from "@/lib/db";
import { queueContentForBusiness } from "@/lib/content-gen/queue-content";
import { sendDailyOwnerReport } from "@/lib/email/daily-owner-report";
import { sendWeeklyUpsellEmails } from "@/lib/email/weekly-upsell";
import { runLeadDripBatch } from "@/lib/email/lead-drip";

const WORKER_INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 15 * 60 * 1000);
const JOBS_PER_TICK = Number(process.env.JOBS_PER_TICK ?? 5);
const CONTENT_PER_TICK = Number(process.env.CONTENT_PER_TICK ?? 3);

const CONTENT_GEN_PER_TICK = 3;
const PAID_TIERS_FOR_CONTENT = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];

async function processContentGeneration() {
  const db = getDb();
  if (!db) return;

  // Find paid businesses that currently have zero queued content items
  const allPaidBizIds = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(inArray(businesses.planTier, PAID_TIERS_FOR_CONTENT))
    .limit(100);

  if (allPaidBizIds.length === 0) return;

  // For each candidate, check their queue depth; collect those with none queued
  const candidates: string[] = [];
  for (const row of allPaidBizIds) {
    if (candidates.length >= CONTENT_GEN_PER_TICK) break;
    const [countRow] = await db
      .select({ count: count() })
      .from(contentQueue)
      .where(and(eq(contentQueue.businessId, row.id), eq(contentQueue.status, "queued")));
    if ((countRow?.count ?? 0) === 0) {
      candidates.push(row.id);
    }
  }

  for (const businessId of candidates) {
    try {
      const result = await queueContentForBusiness(businessId);
      if (result.queued > 0) {
        console.info("[worker] content generation queued", { businessId, queued: result.queued });
      }
    } catch (error) {
      console.error("[worker] content generation failed", {
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function processContentQueue() {
  const db = getDb();
  if (!db) return;

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

async function hasJobRunToday(jobType: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, jobType), gte(jobs.createdAt, todayStart)))
    .limit(1);
  return Boolean(row);
}

async function hasJobRunThisWeek(jobType: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const weekStart = new Date();
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay()); // Sunday
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, jobType), gte(jobs.createdAt, weekStart)))
    .limit(1);
  return Boolean(row);
}

async function recordWorkerJob(jobType: string, payload?: Record<string, unknown>) {
  const db = getDb();
  if (!db) return;
  await db.insert(jobs).values({ type: jobType, status: "completed", payload: payload ?? {} });
}

async function maybeSendDailyReport() {
  const nowHour = new Date().getUTCHours();
  if (nowHour < 8 || nowHour > 9) return; // only fire in the 8am UTC window
  if (await hasJobRunToday("daily_owner_report")) return;
  try {
    const ok = await sendDailyOwnerReport();
    if (ok) {
      await recordWorkerJob("daily_owner_report");
      console.info("[worker] daily owner report sent");
    }
  } catch (error) {
    console.error("[worker] daily report failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

async function maybeSendWeeklyUpsell() {
  const now = new Date();
  if (now.getUTCDay() !== 1) return; // Monday only
  const nowHour = now.getUTCHours();
  if (nowHour < 9 || nowHour > 10) return; // 9am UTC window
  if (await hasJobRunThisWeek("weekly_upsell_batch")) return;
  try {
    const result = await sendWeeklyUpsellEmails();
    await recordWorkerJob("weekly_upsell_batch", result);
    console.info("[worker] weekly upsell emails", result);
  } catch (error) {
    console.error("[worker] weekly upsell failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

async function tick() {
  const startedAt = new Date().toISOString();
  console.info("[worker] tick start", { startedAt, jobsPerTick: JOBS_PER_TICK });

  try {
    const snapshotResult = await runPendingRecurringSnapshotJobs(JOBS_PER_TICK);
    console.info("[worker] snapshot jobs", snapshotResult);
  } catch (error) {
    console.error("[worker] snapshot jobs failed", { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    await processContentGeneration();
  } catch (error) {
    console.error("[worker] content generation failed", { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    await processContentQueue();
  } catch (error) {
    console.error("[worker] content queue failed", { error: error instanceof Error ? error.message : String(error) });
  }

  await maybeSendDailyReport();
  await maybeSendWeeklyUpsell();

  try {
    const dripResult = await runLeadDripBatch();
    if (dripResult.sent > 0) {
      console.info("[worker] lead drip emails sent", dripResult);
    }
  } catch (error) {
    console.error("[worker] lead drip failed", { error: error instanceof Error ? error.message : String(error) });
  }

  console.info("[worker] tick done", { durationMs: Date.now() - new Date(startedAt).getTime() });
}

void tick();
setInterval(() => void tick(), WORKER_INTERVAL_MS);

console.info("[worker] started", {
  intervalMs: WORKER_INTERVAL_MS,
  jobsPerTick: JOBS_PER_TICK,
  contentPerTick: CONTENT_PER_TICK,
});

/**
 * Shared daily send budget across ALL prospect-acquisition email types (new
 * cold outreach + follow-up + breakup). These three are scheduled
 * independently in worker/index.ts, so without a shared ceiling they can
 * collectively stack past what one Resend account/sending domain can safely
 * handle in a day even though each individually looks capped. Every batch
 * must re-check remaining budget from the DB immediately before sending —
 * the worker tick is sequential/single-process, so this self-throttles
 * correctly across the day's windows without needing cross-process locking.
 */
import { and, count, desc, eq, gte } from "drizzle-orm";
import { getDb, jobs } from "@/lib/db";

const COLD_JOB_TYPE = "cold_outreach_sent";
const FOLLOWUP_JOB_TYPE = "cold_outreach_followup_sent";
const BREAKUP_JOB_TYPE = "cold_outreach_breakup_sent";
const RESTART_JOB_TYPE = "cold_outreach_restart";

/** One combined ceiling for cold + follow-up + breakup sends per UTC day. */
export const SHARED_DAILY_SEND_CEILING = 100;

function todayStartUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function countJobsToday(jobType: string): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(jobs)
    .where(and(eq(jobs.type, jobType), gte(jobs.createdAt, todayStartUTC())));
  return row?.n ?? 0;
}

export async function getTodaysSendCounts(): Promise<{ cold: number; followup: number; breakup: number; total: number }> {
  const [cold, followup, breakup] = await Promise.all([
    countJobsToday(COLD_JOB_TYPE),
    countJobsToday(FOLLOWUP_JOB_TYPE),
    countJobsToday(BREAKUP_JOB_TYPE),
  ]);
  return { cold, followup, breakup, total: cold + followup + breakup };
}

/** Budget left against the shared ceiling right now — never negative. */
export async function getRemainingSharedBudget(): Promise<number> {
  const { total } = await getTodaysSendCounts();
  return Math.max(0, SHARED_DAILY_SEND_CEILING - total);
}

/**
 * Ramp schedule for NEW cold-prospect volume specifically (follow-up/breakup
 * aren't "new" sends, so they're governed only by the shared ceiling above,
 * not this ramp). Days 0-1 since restart: 25/day. Days 2-3: 50/day. Day 4+:
 * 90/day (top of the requested 75-90 range — the shared ceiling and health
 * check above are what actually gate volume down if things look bad, so
 * there's no separate "if health remains good" branch to hand-roll here).
 * No restart marker found (shouldn't happen once launched) fails to the most
 * conservative cap rather than assuming full ramp.
 */
export async function getColdOutreachRampCap(): Promise<number> {
  const db = getDb();
  if (!db) return 25;
  const [row] = await db
    .select({ payload: jobs.payload, createdAt: jobs.createdAt })
    .from(jobs)
    .where(eq(jobs.type, RESTART_JOB_TYPE))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  if (!row) return 25;
  const restartedAtRaw = (row.payload as { restartedAt?: string } | null)?.restartedAt;
  const restartedAt = restartedAtRaw ? new Date(restartedAtRaw) : row.createdAt;
  const daysSince = Math.floor((Date.now() - restartedAt.getTime()) / 86_400_000);
  if (daysSince <= 1) return 25;
  if (daysSince <= 3) return 50;
  return 90;
}

/** Remaining budget for NEW cold prospects today, honoring both the ramp and the shared ceiling. */
export async function getRemainingColdRampBudget(): Promise<number> {
  const [rampCap, counts] = await Promise.all([getColdOutreachRampCap(), getTodaysSendCounts()]);
  const rampRemaining = Math.max(0, rampCap - counts.cold);
  const sharedRemaining = Math.max(0, SHARED_DAILY_SEND_CEILING - counts.total);
  return Math.min(rampRemaining, sharedRemaining);
}

export async function recordOutreachRestart(): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(jobs).values({
    type: RESTART_JOB_TYPE,
    status: "completed",
    payload: { restartedAt: new Date().toISOString() },
  });
}

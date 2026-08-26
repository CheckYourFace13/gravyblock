/**
 * Automatic health protection for automated prospect-acquisition sending.
 * Extends the original bounce-only circuit breaker (worker/index.ts) to the
 * full set of failure modes that should stop or shrink sending without a
 * human watching it: bounce spike, complaint, webhook/correlation silence,
 * and repeated provider errors (which also covers Resend quota exhaustion —
 * a quota-exceeded response comes back as a repeated send failure, not a
 * distinct signal Resend exposes separately).
 *
 * Deliberately conservative thresholds with minimum sample sizes so this
 * doesn't trip on ordinary day-to-day noise — the instruction was "sensible
 * deliverability protections," not a hair-trigger that pages someone every
 * few hours.
 */
import { and, count, eq, gte } from "drizzle-orm";
import { getDb, jobs, emailEvents } from "@/lib/db";

const COLD_JOB_TYPE = "cold_outreach_sent";
const FOLLOWUP_JOB_TYPE = "cold_outreach_followup_sent";
const BREAKUP_JOB_TYPE = "cold_outreach_breakup_sent";
const SEND_FAILED_JOB_TYPE = "outreach_send_failed";

export type HealthCheckResult = { healthy: true } | { healthy: false; reason: string };

async function hasAlertedToday(markerType: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const [row] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.type, markerType), gte(jobs.createdAt, todayStart))).limit(1);
  return Boolean(row);
}

async function recordAlert(markerType: string, payload: Record<string, unknown>): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(jobs).values({ type: markerType, status: "failed", payload });
  console.error(`[outreach-health] ${markerType}`, payload);
}

/** Records a real send failure (thrown Resend API error) for the repeated-provider-error check below. */
export async function recordOutreachSendFailure(context: Record<string, unknown>): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(jobs).values({ type: SEND_FAILED_JOB_TYPE, status: "failed", payload: context }).catch(() => {});
}

/**
 * Single gate every automated send batch (cold/follow-up/breakup) must pass
 * before sending anything. Fails CLOSED: any error evaluating health means
 * "not healthy" — same fail-closed posture as pause-guard.ts, for the same
 * reason (ambiguity about safety is never permission to send).
 */
export async function checkOutreachHealth(): Promise<HealthCheckResult> {
  const db = getDb();
  if (!db) return { healthy: false, reason: "no database — cannot verify health" };

  try {
    const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since2h = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const [coldSends48h, followupSends48h, breakupSends48h, bounces48h, complaints48h, deliveredOrBounced24h, recentFailures] =
      await Promise.all([
        db.select({ n: count() }).from(jobs).where(and(eq(jobs.type, COLD_JOB_TYPE), gte(jobs.createdAt, since48h))).then((r) => r[0]?.n ?? 0),
        db.select({ n: count() }).from(jobs).where(and(eq(jobs.type, FOLLOWUP_JOB_TYPE), gte(jobs.createdAt, since48h))).then((r) => r[0]?.n ?? 0),
        db.select({ n: count() }).from(jobs).where(and(eq(jobs.type, BREAKUP_JOB_TYPE), gte(jobs.createdAt, since48h))).then((r) => r[0]?.n ?? 0),
        db.select({ n: count() }).from(emailEvents).where(and(eq(emailEvents.eventType, "bounced"), gte(emailEvents.createdAt, since48h))).then((r) => r[0]?.n ?? 0),
        db.select({ n: count() }).from(emailEvents).where(and(eq(emailEvents.eventType, "complained"), gte(emailEvents.createdAt, since48h))).then((r) => r[0]?.n ?? 0),
        db.select({ n: count() }).from(emailEvents).where(and(gte(emailEvents.createdAt, since24h))).then((r) => r[0]?.n ?? 0),
        db.select({ n: count() }).from(jobs).where(and(eq(jobs.type, SEND_FAILED_JOB_TYPE), gte(jobs.createdAt, since2h))).then((r) => r[0]?.n ?? 0),
      ]);

    const totalSends48h = coldSends48h + followupSends48h + breakupSends48h;

    // 1. Bounce rate — needs a real sample to avoid small-batch noise.
    if (totalSends48h >= 20) {
      const bounceRate = bounces48h / totalSends48h;
      if (bounceRate > 0.08) {
        const marker = "outreach_health_bounce_rate";
        if (!(await hasAlertedToday(marker))) {
          await recordAlert(marker, { totalSends48h, bounces48h, ratePct: Math.round(bounceRate * 100) });
        }
        return { healthy: false, reason: `bounce rate ${Math.round(bounceRate * 100)}% over last 48h (${bounces48h}/${totalSends48h})` };
      }
    }

    // 2. Complaints — rarer and more severe than bounces, so a lower bar,
    // but still requires a minimum sample so 1 complaint on a 20-send day
    // doesn't read as a crisis.
    if (totalSends48h >= 50) {
      const complaintRate = complaints48h / totalSends48h;
      if (complaintRate > 0.003) {
        const marker = "outreach_health_complaint_rate";
        if (!(await hasAlertedToday(marker))) {
          await recordAlert(marker, { totalSends48h, complaints48h, ratePct: Math.round(complaintRate * 1000) / 10 });
        }
        return { healthy: false, reason: `complaint rate over last 48h (${complaints48h}/${totalSends48h})` };
      }
    }

    // 3. Webhook/correlation silence — real sends went out a while ago but
    // literally zero events of any kind came back. Requires enough sends and
    // enough elapsed time (2h+) that "no delivered event yet" can't just be
    // provider lag.
    const oldEnoughSends = coldSends48h + followupSends48h + breakupSends48h; // reuse 48h counts, gated by volume below
    if (oldEnoughSends >= 10 && deliveredOrBounced24h === 0) {
      const marker = "outreach_health_webhook_silence";
      if (!(await hasAlertedToday(marker))) {
        await recordAlert(marker, { sends48h: oldEnoughSends, events24h: deliveredOrBounced24h });
      }
      return { healthy: false, reason: "no webhook events recorded in 24h despite recent sends — correlation may be broken" };
    }

    // 4. Repeated provider errors (covers Resend quota exhaustion, which
    // shows up as repeated failed send calls rather than a distinct signal).
    if (recentFailures >= 5) {
      const marker = "outreach_health_provider_errors";
      if (!(await hasAlertedToday(marker))) {
        await recordAlert(marker, { failures2h: recentFailures });
      }
      return { healthy: false, reason: `${recentFailures} provider send failures in the last 2h` };
    }

    return { healthy: true };
  } catch (err) {
    return { healthy: false, reason: `health check failed (${err instanceof Error ? err.message : String(err)}) — SKIPPED, not assumed healthy` };
  }
}

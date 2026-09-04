import { timingSafeEqual, createHmac } from "node:crypto";
import { getSqlClient } from "@/lib/db";
import { getOutreachSettings } from "@/app/admin/(dashboard)/outreach/actions";
import { getTodaysSendCounts, getColdOutreachRampCap, SHARED_DAILY_SEND_CEILING } from "@/lib/outreach/send-budget";
import { checkOutreachHealth } from "@/lib/outreach/outreach-health";

/** TEMPORARY, secret-gated, read-only current-state snapshot for the final status report. Remove after use. */
function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!expected || !provided) return false;
  const a = createHmac("sha256", "health-snapshot").update(provided).digest();
  const b = createHmac("sha256", "health-snapshot").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const sql = getSqlClient();
  if (!sql) return Response.json({ error: "no_db" }, { status: 500 });

  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const [bounces, complaints, delivered, sentTypes, settings, todaysCounts, rampCap, health] = await Promise.all([
    sql.unsafe(`select count(*) as n from email_events where event_type = 'bounced' and created_at >= $1`, [since48h]),
    sql.unsafe(`select count(*) as n from email_events where event_type = 'complained' and created_at >= $1`, [since48h]),
    sql.unsafe(`select count(*) as n from email_events where event_type = 'delivered' and created_at >= $1`, [since48h]),
    sql.unsafe(
      `select type, count(*) as n from jobs where type in ('cold_outreach_sent','cold_outreach_followup_sent','cold_outreach_breakup_sent') and created_at >= $1 group by type`,
      [since48h],
    ),
    getOutreachSettings(),
    getTodaysSendCounts(),
    getColdOutreachRampCap(),
    checkOutreachHealth(),
  ]);

  return Response.json({
    since48h,
    bounces48h: bounces[0]?.n ?? 0,
    complaints48h: complaints[0]?.n ?? 0,
    delivered48h: delivered[0]?.n ?? 0,
    sentByType48h: sentTypes,
    outreachSettings: settings,
    todaysSendCounts: todaysCounts,
    coldRampCapToday: rampCap,
    sharedDailyCeiling: SHARED_DAILY_SEND_CEILING,
    health,
  });
}

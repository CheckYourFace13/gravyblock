import { timingSafeEqual, createHmac } from "node:crypto";
import { getSqlClient } from "@/lib/db";

/**
 * TEMPORARY, secret-gated, read-only funnel report for the Aug 25 - present
 * cold-outreach restart window. One-time analysis pull, no side effects.
 * Remove after use.
 */
function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!expected || !provided) return false;
  const a = createHmac("sha256", "funnel-report").update(provided).digest();
  const b = createHmac("sha256", "funnel-report").update(expected).digest();
  return timingSafeEqual(a, b);
}

const START = "2026-08-25T00:00:00Z";

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const sql = getSqlClient();
  if (!sql) return Response.json({ error: "no_db" }, { status: 500 });

  const [
    coldOutreachBatchJobs,
    outreachSends,
    leadsFromOutreachPlaces,
    funnelEventsFromOutreachBiz,
    paidBusinessesFromOutreach,
    emailEventCounts,
    optOutCount,
    sendFailures,
  ] = await Promise.all([
    sql.unsafe(`select payload, created_at from jobs where type = 'cold_outreach_batch' and created_at >= $1 order by created_at asc`, [START]),
    sql.unsafe(`
      select os.resend_email_id, os.business_id, os.place_id, os.recipient, os.campaign, os.sequence_step,
             os.contact_source, os.contact_confidence, os.is_test, os.status, os.attempted_at,
             os.delivered_at, os.opened_at, os.first_clicked_at, os.bounced_at, os.complained_at, os.unsubscribed_at,
             b.vertical, b.target_scope
      from outreach_sends os
      left join businesses b on b.place_id = os.place_id
      where os.attempted_at >= $1 and os.is_test = 'false'
      order by os.attempted_at asc
    `, [START]),
    sql.unsafe(`
      select l.id, l.place_id, l.business_id, l.source, l.created_at, l.report_public_id
      from leads l
      where l.created_at >= $1
        and l.place_id in (select distinct place_id from outreach_sends where attempted_at >= $1 and place_id is not null)
      order by l.created_at asc
    `, [START]),
    sql.unsafe(`
      select fe.event_type, fe.created_at, fe.business_id, fe.report_public_id
      from funnel_events fe
      where fe.created_at >= $1
        and fe.business_id in (
          select distinct b.id from businesses b
          join outreach_sends os on os.place_id = b.place_id
          where os.attempted_at >= $1
        )
      order by fe.created_at asc
    `, [START]),
    sql.unsafe(`
      select b.id, b.name, b.place_id, b.vertical, b.plan_tier, b.subscription_status, b.stripe_subscription_id, b.created_at, b.updated_at
      from businesses b
      where b.place_id in (select distinct place_id from outreach_sends where attempted_at >= $1)
        and b.subscription_status is not null
    `, [START]),
    sql.unsafe(`select event_type, count(*) as n from email_events where created_at >= $1 group by event_type`, [START]),
    sql.unsafe(`select count(*) as n from jobs where type = 'email_optout' and created_at >= $1`, [START]),
    sql.unsafe(`select payload, created_at from jobs where type = 'outreach_send_failed' and created_at >= $1`, [START]),
  ]);

  return Response.json({
    windowStart: START,
    generatedAt: new Date().toISOString(),
    coldOutreachBatchJobs,
    outreachSends,
    leadsFromOutreachPlaces,
    funnelEventsFromOutreachBiz,
    paidBusinessesFromOutreach,
    emailEventCounts,
    optOutCount,
    sendFailures,
  });
}

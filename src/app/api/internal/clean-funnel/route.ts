import { timingSafeEqual, createHmac } from "node:crypto";
import { getSqlClient } from "@/lib/db";

/** TEMPORARY, secret-gated, read-only. Clean-attribution-era funnel pull. Remove after use. */
function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!expected || !provided) return false;
  const a = createHmac("sha256", "clean-funnel").update(provided).digest();
  const b = createHmac("sha256", "clean-funnel").update(expected).digest();
  return timingSafeEqual(a, b);
}

const ATTRIBUTION_START = "2026-09-04T00:00:00Z";

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sql = getSqlClient();
  if (!sql) return Response.json({ error: "no_db" }, { status: 500 });

  const [sentJobs, followupJobs, breakupJobs, outreachSends, funnelEvents, warmLeads, warmLeadEvents] = await Promise.all([
    sql.unsafe(
      `select id, created_at, payload from jobs where type = 'cold_outreach_sent' and created_at >= $1 order by created_at asc`,
      [ATTRIBUTION_START],
    ),
    sql.unsafe(
      `select id, created_at, payload from jobs where type = 'cold_outreach_followup_sent' and created_at >= $1 order by created_at asc`,
      [ATTRIBUTION_START],
    ),
    sql.unsafe(
      `select id, created_at, payload from jobs where type = 'cold_outreach_breakup_sent' and created_at >= $1 order by created_at asc`,
      [ATTRIBUTION_START],
    ),
    sql.unsafe(
      `select resend_email_id, place_id, recipient, campaign, sequence_step, contact_source, contact_confidence,
              attempted_at, delivered_at, bounced_at, complained_at, unsubscribed_at
       from outreach_sends where attempted_at >= $1 and is_test = 'false' order by attempted_at asc`,
      [ATTRIBUTION_START],
    ),
    sql.unsafe(
      `select event_type, created_at, business_id, report_public_id, metadata
       from funnel_events where created_at >= $1 and metadata->>'attributionToken' is not null
       order by created_at asc`,
      [ATTRIBUTION_START],
    ),
    sql.unsafe(
      `select resend_email_id, recipient, campaign, attempted_at, delivered_at, bounced_at, complained_at, unsubscribed_at
       from outreach_sends where recipient in ('sammy@unicornmedispa.com','nolansappliance@yahoo.com')`,
    ),
    sql.unsafe(
      `select event_type, created_at, business_id, metadata from funnel_events
       where business_id in (select business_id from businesses b where b.place_id in (
         select place_id from businesses where website ilike '%unicornmedispa%' or website ilike '%nolansappliance%' or name ilike '%unicorn%' or name ilike '%nolan%'
       ))`,
    ).catch(() => []),
  ]);

  const [paidBusinesses] = await Promise.all([
    sql.unsafe(
      `select b.id, b.name, b.place_id, b.plan_tier, b.subscription_status, b.created_at, b.updated_at
       from businesses b
       where b.subscription_status is not null and b.updated_at >= $1`,
      [ATTRIBUTION_START],
    ),
  ]);

  return Response.json({
    windowStart: ATTRIBUTION_START,
    generatedAt: new Date().toISOString(),
    sentJobs,
    followupJobs,
    breakupJobs,
    outreachSends,
    funnelEvents,
    paidBusinesses,
    warmLeads,
    warmLeadEvents,
  });
}

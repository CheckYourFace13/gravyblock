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

  const [sentJobs, followupJobs, breakupJobs, outreachSends, funnelEvents, paidBusinesses, warmEmailEvents] = await Promise.all([
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
      `select b.id, b.name, b.place_id, b.plan_tier, b.subscription_status, b.created_at, b.updated_at
       from businesses b
       where b.subscription_status is not null and b.updated_at >= $1`,
      [ATTRIBUTION_START],
    ),
    sql.unsafe(
      `select event_type, email_id, recipient, created_at from email_events
       where email_id in ('2819b05c-8fa2-4e03-92be-6f72b88e0c17','7c808e7e-9e3c-45a5-bc71-3351b9f90dd0')
          or recipient in ('sammy@unicornmedispa.com','nolansappliance@yahoo.com')
       order by created_at asc`,
    ),
  ]);

  const warmFunnelEvents = await sql.unsafe(
    `select event_type, created_at, business_id, metadata from funnel_events
     where business_id in ('af881ef1-9773-4081-8402-03663153e7fe','c4ddb947-0db0-492a-92bd-9ebec3e94a25')
     order by created_at asc`,
  );

  return Response.json({
    windowStart: ATTRIBUTION_START,
    generatedAt: new Date().toISOString(),
    sentJobs,
    followupJobs,
    breakupJobs,
    outreachSends,
    funnelEvents,
    paidBusinesses,
    warmEmailEvents,
    warmFunnelEvents,
  });
}

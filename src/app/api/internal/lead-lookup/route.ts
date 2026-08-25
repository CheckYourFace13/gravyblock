import { timingSafeEqual, createHmac } from "node:crypto";
import { getSqlClient } from "@/lib/db";

/**
 * TEMPORARY, read-only, secret-gated production lookup for the first-customer
 * sales-action report (existing 6 real leads). Not linked from anywhere, not
 * admin-session-gated (no interactive login available to this caller) — gated
 * instead by a constant-time compare against ADMIN_SECRET via header. Remove
 * once the lead audit is done.
 */
function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!expected || !provided) return false;
  const a = createHmac("sha256", "lead-lookup").update(provided).digest();
  const b = createHmac("sha256", "lead-lookup").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const sql = getSqlClient();
  if (!sql) return Response.json({ error: "no_db" }, { status: 500 });

  const patterns = [
    "%unicorn%", "%tantawy%", "%amy chen%", "%tabatha%", "%nolan%",
    "%dean%", "%peggy%", "%duggan%", "%micstage%", "%mic stage%",
  ];

  const leads = await sql.unsafe(`
    select id, name, email, website, source, sources, pipeline_status, business_id,
           report_public_id, phone, message, first_seen_at, last_seen_at, created_at
    from leads
    where ${patterns.map((_, i) => `(lower(name) like $${i + 1} or lower(email) like $${i + 1} or lower(coalesce(website,'')) like $${i + 1})`).join(" or ")}
    order by first_seen_at asc
  `, patterns);

  const businessIds = [...new Set(leads.map((l: any) => l.business_id).filter(Boolean))];
  const reportPublicIds = [...new Set(leads.map((l: any) => l.report_public_id).filter(Boolean))];
  const leadIds = leads.map((l: any) => l.id);

  const businesses = businessIds.length
    ? await sql.unsafe(
        `select id, name, website, plan_tier, pending_plan, account_type, stripe_customer_id,
                stripe_subscription_id, subscription_status, billing_email, account_email,
                current_period_end, created_at, updated_at
         from businesses where id = any($1)`,
        [businessIds],
      )
    : [];

  const scansByBusiness = businessIds.length
    ? await sql.unsafe(`select id, business_id, source, created_at from scans where business_id = any($1) order by created_at asc`, [businessIds])
    : [];

  const reports = businessIds.length
    ? await sql.unsafe(
        `select r.id, r.public_id, r.scan_id, r.overall_score, r.opportunity_level, r.created_at, s.business_id
         from reports r join scans s on s.id = r.scan_id where s.business_id = any($1) order by r.created_at asc`,
        [businessIds],
      )
    : [];

  const snapshots = businessIds.length
    ? await sql.unsafe(
        `select business_id, overall_score, opportunity_level, source, score_method_version, created_at
         from visibility_snapshots where business_id = any($1) order by created_at asc`,
        [businessIds],
      )
    : [];

  const funnel = (businessIds.length || leadIds.length || reportPublicIds.length)
    ? await sql.unsafe(
        `select event_type, session_id, business_id, report_public_id, lead_id, utm_source, referrer, path, metadata, created_at
         from funnel_events
         where business_id = any($1) or lead_id = any($2) or report_public_id = any($3)
         order by created_at asc`,
        [businessIds, leadIds, reportPublicIds],
      )
    : [];

  const outreach = businessIds.length
    ? await sql.unsafe(
        `select resend_email_id, business_id, recipient, campaign, sequence_step, status,
                attempted_at, delivered_at, opened_at, first_clicked_at, bounced_at
         from outreach_sends where business_id = any($1) order by attempted_at asc`,
        [businessIds],
      )
    : [];

  return Response.json({ leads, businesses, scans: scansByBusiness, reports, snapshots, funnel, outreach });
}

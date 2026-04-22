import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgresql://gravyblock:gravyblock@localhost:5432/gravyblock");
const businessId = process.argv[2];
const brandId = process.argv[3];
const organizationId = process.argv[4];

if (!businessId || !brandId || !organizationId) {
  console.error("Usage: node scripts/proof-query.mjs <businessId> <brandId> <organizationId>");
  process.exit(1);
}

const q = (query) => sql.unsafe(query);

try {
  const out = {
    organization: await q(
      `select id,name,account_type,plan_tier from organizations where id='${organizationId}'`,
    ),
    brand: await q(`select id,organization_id,name,business_model from brands where id='${brandId}'`),
    locations: await q(
      `select id,brand_id,name,city,place_id from locations where brand_id='${brandId}' order by created_at asc`,
    ),
    business: await q(
      `select id,organization_id,brand_id,location_id,name,business_model,place_id,website from businesses where id='${businessId}'`,
    ),
    place_profile: await q(
      `select id,business_id,place_id,display_name from place_profiles where business_id='${businessId}' order by created_at desc limit 2`,
    ),
    scan: await q(
      `select id,business_id,lookup_query,selected_place_id from scans where business_id='${businessId}' order by created_at desc limit 2`,
    ),
    report: await q(
      "select id,public_id,scan_id,overall_score,opportunity_level from reports order by created_at desc limit 2",
    ),
    visibility_snapshot: await q(
      `select id,business_id,overall_score,source from visibility_snapshots where business_id='${businessId}' order by created_at desc limit 3`,
    ),
    ranking_checks: await q(
      `select id,business_id,query,estimated_position from ranking_checks where business_id='${businessId}' order by created_at desc limit 3`,
    ),
    audit_findings: await q(
      `select id,business_id,title,severity from audit_findings where business_id='${businessId}' order by created_at desc limit 3`,
    ),
    recommendations: await q(
      `select id,business_id,title,status from recommendations where business_id='${businessId}' order by created_at desc limit 5`,
    ),
    content_strategy: await q(
      `select id,business_id,strategy_window_days from content_strategies where business_id='${businessId}' order by created_at desc limit 2`,
    ),
    content_queue: await q(
      `select id,business_id,title,status,kind from content_queue where business_id='${businessId}' order by created_at desc limit 5`,
    ),
    lead: await q(
      `select id,business_id,organization_id,brand_id,location_id,email,source,first_seen_at,last_seen_at from leads where business_id='${businessId}' order by created_at desc limit 3`,
    ),
    lead_by_brand: await q(
      `select id,business_id,organization_id,brand_id,location_id,email,source,first_seen_at,last_seen_at from leads where brand_id='${brandId}' order by created_at desc limit 10`,
    ),
    publishing_jobs: await q("select id,queue_id,status,response_log from publishing_jobs order by created_at desc limit 5"),
    published_content: await q(
      `select id,business_id,queue_id,title,status,public_url from published_content where business_id='${businessId}' order by created_at desc limit 5`,
    ),
    recurring_jobs: await q(
      `select id,business_id,type,status,run_after from jobs where business_id='${businessId}' order by created_at desc limit 5`,
    ),
    ai_visibility_checks: await q(
      `select id,business_id,prompt,mention_found,sentiment from ai_visibility_checks where business_id='${businessId}' order by created_at desc limit 5`,
    ),
  };
  console.log(JSON.stringify(out, null, 2));
} finally {
  await sql.end();
}

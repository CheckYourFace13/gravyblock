import { timingSafeEqual, createHmac } from "node:crypto";
import { getSqlClient } from "@/lib/db";

/** TEMPORARY, secret-gated, read-only. 30-day production evidence for canary businesses. Remove after use. */
function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!expected || !provided) return false;
  const a = createHmac("sha256", "canary-evidence").update(provided).digest();
  const b = createHmac("sha256", "canary-evidence").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sql = getSqlClient();
  if (!sql) return Response.json({ error: "no_db" }, { status: 500 });

  const q = async (label: string, text: string, params: unknown[] = []) => {
    try {
      return await sql.unsafe(text, params as never[]);
    } catch (e) {
      return [{ error: `${label}: ${e instanceof Error ? e.message : String(e)}` }];
    }
  };

  const businesses = (await q(
    "businesses",
    `select id, name, plan_tier, account_type, subscription_status, website, created_at from businesses
     where name ilike '%league pour%' or name ilike '%boating chicago%' or website ilike '%leaguepour%' or website ilike '%boatingchicago%'`,
  )) as unknown as Array<{ id: string; name: string }>;

  const out: Record<string, unknown> = { generatedAt: new Date().toISOString(), businesses };

  out.globalJobs30d = await q(
    "globalJobs30d",
    `select type, status, count(*)::int as n, max(created_at) as last_at from jobs
     where created_at > now() - interval '30 days' and type not like 'cold_outreach%' and type not like 'email_optout'
     group by type, status order by type, status`,
  );

  const perBiz: Record<string, unknown> = {};
  for (const b of businesses) {
    if (!b.id) continue;
    const id = b.id;
    const p = [id];
    perBiz[b.name] = {
      jobs30d: await q("jobs", `select type, status, count(*)::int n, max(created_at) last_at from jobs where business_id=$1 and created_at > now() - interval '30 days' group by 1,2 order by 1,2`, p),
      jobSamples: await q(
        "jobSamples",
        `select distinct on (type) type, status, created_at, left(payload::text, 320) as payload from jobs where business_id=$1 and created_at > now() - interval '30 days' order by type, created_at desc`,
        p,
      ),
      contentQueue30d: await q("contentQueue", `select kind, status, count(*)::int n, max(created_at) last_at from content_queue where business_id=$1 and created_at > now() - interval '30 days' group by 1,2 order by 1,2`, p),
      publishingJobs30d: await q(
        "publishingJobs",
        `select pj.status, count(*)::int n, max(pj.created_at) last_at from publishing_jobs pj join content_queue cq on cq.id=pj.queue_id where cq.business_id=$1 and pj.created_at > now() - interval '30 days' group by 1`,
        p,
      ),
      publishingJobSamples: await q(
        "publishingJobSamples",
        `select pj.status, pj.created_at, left(pj.response_log, 200) as response_log from publishing_jobs pj join content_queue cq on cq.id=pj.queue_id where cq.business_id=$1 order by pj.created_at desc limit 5`,
        p,
      ),
      publishingTargets: await q("publishingTargets", `select adapter, active, label from publishing_targets where business_id=$1`, p),
      publishedContent30d: await q("publishedContent", `select channel, status, count(*)::int n, max(created_at) last_at from published_content where business_id=$1 and created_at > now() - interval '30 days' group by 1,2 order by 1,2`, p),
      publishedContentSamples: await q("publishedSamples", `select title, channel, status, public_url, created_at, (meta_title is not null) as has_meta from published_content where business_id=$1 order by created_at desc limit 6`, p),
      backlinks: await q("backlinks", `select status, contact_source, count(*)::int n, max(created_at) last_at from backlink_opportunities where business_id=$1 group by 1,2 order by 1,2`, p),
      aiChecks30d: await q("aiChecks", `select engine, mention_found, count(*)::int n, max(created_at) last_at from ai_visibility_checks where business_id=$1 and created_at > now() - interval '30 days' group by 1,2 order by 1,2`, p),
      citations: await q("citations", `select status, count(*)::int n, max(created_at) last_at from citation_monitors where business_id=$1 group by 1`, p),
      operatorTasks: await q("operatorTasks", `select queue, status, count(*)::int n, max(created_at) last_at from operator_tasks where business_id=$1 group by 1,2 order by 1,2`, p),
      reviews: await q("reviews", `select source, status, count(*)::int n, count(replied_at)::int replied, max(created_at) last_at from business_reviews where business_id=$1 group by 1,2 order by 1,2`, p),
      keywordRankings: await q("keywordRankings", `select source, count(*)::int n, max(date) last_date, sum(impressions)::int impressions from keyword_rankings where business_id=$1 and date >= to_char(now() - interval '30 days','YYYY-MM-DD') group by 1`, p),
      rankingChecks30d: await q("rankingChecks", `select count(*)::int n, max(created_at) last_at from ranking_checks where business_id=$1 and created_at > now() - interval '30 days'`, p),
      googleConnection: await q("googleConn", `select (gbp_location_name is not null) as has_gbp_location, (search_console_property is not null) as has_gsc, google_email is not null as has_email, updated_at from google_oauth_connections where business_id=$1`, p),
      recommendations: await q("recommendations", `select status, count(*)::int n from recommendations where business_id=$1 group by 1`, p),
    };
  }
  out.perBusiness = perBiz;
  return Response.json(out);
}

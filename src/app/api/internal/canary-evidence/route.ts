import { timingSafeEqual, createHmac } from "node:crypto";
import { getSqlClient } from "@/lib/db";
import { refreshBusinessTruth, getBusinessTruth } from "@/lib/truth";
import { runCitationEngineForBusiness } from "@/lib/citations/engine";
import { runSiteWatchdogForBusiness } from "@/lib/watchdog/site-watchdog";
import { planTruthGroundedContent } from "@/lib/autopilot/content-planner";
import { discoverAndQualify, previewAuthorityOutreach, enableAuthoritySending, getAuthorityStats } from "@/lib/authority/engine";

/** TEMPORARY, secret-gated. Rollout verification for the canary businesses. Remove after use. */
function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!expected || !provided) return false;
  const a = createHmac("sha256", "canary-evidence").update(provided).digest();
  const b = createHmac("sha256", "canary-evidence").update(expected).digest();
  return timingSafeEqual(a, b);
}

async function canaries() {
  const sql = getSqlClient();
  if (!sql) return [];
  return (await sql.unsafe(
    `select id, name from businesses where name ilike '%league pour%' or name ilike '%boating chicago%'`,
  )) as unknown as Array<{ id: string; name: string }>;
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
  const out: Record<string, unknown> = { generatedAt: new Date().toISOString() };
  out.globalJobs7d = await q(
    "globalJobs7d",
    `select type, status, count(*)::int n, max(created_at) last_at from jobs where created_at > now() - interval '7 days'
       and (type like 'truth_%' or type like 'authority_%' or type like 'citation_engine%' or type like 'site_watchdog%' or type like 'content_engine_%' or type like 'content_publish_%' or type in ('gbp_review_reply','gbp_photo_upload','rank_tracking_batch','local_pack_tracking_batch','pro_recurring_refresh'))
     group by 1,2 order by 1,2`,
  );
  const per: Record<string, unknown> = {};
  for (const b of await canaries()) {
    const p = [b.id];
    per[b.name] = {
      factsByKey: await q("facts", `select fact_key, count(*)::int n, max(confidence) max_conf from business_facts where business_id=$1 and status='current' group by 1 order by 1`, p),
      factSamples: await q("factSamples", `select fact_key, left(fact_value,110) v, source_system, source_url, fetched_at, source_updated_at, confidence, stability from business_facts where business_id=$1 and status='current' and fact_key in ('name','city','address','phone','email','description','service','recent_content','service_area','hours') order by fact_key, confidence desc limit 40`, p),
      backlinkStatuses: await q("backlinks", `select status, source_type, count(*)::int n from backlink_opportunities where business_id=$1 group by 1,2 order by 1,2`, p),
      authorityEvents: await q("authEvents", `select payload->>'event' ev, count(*)::int n from jobs where business_id=$1 and type='authority_event' group by 1`, p),
      citationMonitors: await q("citations", `select source_name, status, left(mismatch_note,160) note from citation_monitors where business_id=$1 order by source_name`, p),
      contentEngine: await q("contentEngine", `select type, count(*)::int n, max(created_at) last_at, max(left(payload::text,220)) sample from jobs where business_id=$1 and (type like 'content_engine_%' or type like 'content_publish_%') group by 1`, p),
      contentQueue: await q("cq", `select kind, status, count(*)::int n from content_queue where business_id=$1 group by 1,2 order by 1,2`, p),
      operatorTasksOpen: await q("tasks", `select queue, status, count(*)::int n from operator_tasks where business_id=$1 group by 1,2 order by 1,2`, p),
      siteWatchdog: await q("watchdog", `select status, created_at, left(payload::text, 300) p from jobs where business_id=$1 and type='site_watchdog' order by created_at desc limit 2`, p),
    };
  }
  out.perBusiness = per;
  out.authorityStatsGlobal = await getAuthorityStats().catch((e) => ({ error: String(e) }));
  return Response.json(out);
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const results: Record<string, unknown> = {};
  for (const b of await canaries()) {
    try {
      if (body.action === "refresh_truth") {
        results[b.name] = await refreshBusinessTruth(b.id);
      } else if (body.action === "truth_summary") {
        const t = await getBusinessTruth(b.id);
        results[b.name] = { sufficient: t.sufficient, reason: t.insufficientReason, city: t.verifiedCity, services: t.services, description: t.description, lastWebsiteCrawlAt: t.lastWebsiteCrawlAt, promptBlock: t.promptBlock };
      } else if (body.action === "citations") {
        results[b.name] = await runCitationEngineForBusiness(b.id);
      } else if (body.action === "watchdog") {
        results[b.name] = await runSiteWatchdogForBusiness(b.id);
      } else if (body.action === "plan_content") {
        results[b.name] = await planTruthGroundedContent({ businessId: b.id, maxItems: 3, maxLocationPages: 1 });
      } else if (body.action === "authority_discover") {
        results[b.name] = await discoverAndQualify(b.id);
      } else if (body.action === "authority_preview") {
        results[b.name] = await previewAuthorityOutreach(b.id, 3);
      }
    } catch (e) {
      results[b.name] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  if (body.action === "authority_enable") {
    await enableAuthoritySending("Enabled after first-run review of previewed pitches at rollout.");
    results.enabled = true;
  }
  return Response.json({ action: body.action, results });
}

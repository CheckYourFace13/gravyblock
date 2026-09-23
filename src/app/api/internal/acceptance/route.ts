import { timingSafeEqual, createHmac } from "node:crypto";
import { getSqlClient } from "@/lib/db";
import { runOrchestrator } from "@/lib/opportunities/orchestrator";
import { allOpenRanked } from "@/lib/opportunities/queue";
import { discoverUnlinkedMentions, discoverBrokenLinkOpportunities, discoverAndQualify, requalifyProspects } from "@/lib/authority/engine";
import { scanCrossEngineOpportunities } from "@/lib/opportunities/scan";
import { runCanaryAssertions } from "@/lib/canary/assertions";

export const maxDuration = 300;

function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!expected || !provided) return false;
  const a = createHmac("sha256", "acceptance5").update(provided).digest();
  const b = createHmac("sha256", "acceptance5").update(expected).digest();
  return timingSafeEqual(a, b);
}

async function run(engine: string, id: string) {
  switch (engine) {
    case "top5":
      return allOpenRanked(id, 8);
    case "orchestrate":
      return runOrchestrator(id, 8);
    case "mentions":
      return discoverUnlinkedMentions(id, 3);
    case "broken_links":
      return discoverBrokenLinkOpportunities(id, 3);
    case "authority_discover":
      return discoverAndQualify(id);
    case "authority_requalify":
      return requalifyProspects(id);
    case "scan_opp":
      return scanCrossEngineOpportunities(id);
    case "canary":
      return runCanaryAssertions(id);
    default:
      return { error: "unknown_engine" };
  }
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const engine = url.searchParams.get("engine") ?? "";
  const which = (url.searchParams.get("biz") ?? "").toLowerCase();
  const sql = getSqlClient();
  if (!sql) return Response.json({ error: "no_db" }, { status: 500 });
  const rows = (await sql.unsafe(
    `select id, name from businesses where lower(name) like $1 and account_type = 'house' order by (name ilike $2) desc, created_at desc limit 1`,
    [`%${which}%`, which] as never[],
  )) as unknown as { id: string; name: string }[];
  const biz = rows[0];
  if (!biz) return Response.json({ error: "business_not_found" }, { status: 404 });
  const started = Date.now();
  try {
    const result = await run(engine, biz.id);
    return Response.json({ engine, business: biz.name, ms: Date.now() - started, result });
  } catch (e) {
    return Response.json({ engine, business: biz.name, ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sql = getSqlClient();
  if (!sql) return Response.json({ error: "no_db" }, { status: 500 });
  const q = async (label: string, text: string) => {
    try {
      return await sql.unsafe(text);
    } catch (e) {
      return [{ error: `${label}: ${e instanceof Error ? e.message : String(e)}` }];
    }
  };
  return Response.json({
    authorityTotals: await q(
      "at",
      `select b.name, o.opportunity_kind, o.status, count(*)::int n from backlink_opportunities o join businesses b on b.id=o.business_id where b.account_type='house' group by 1,2,3 order by 1,2,3`,
    ),
    authoritySends24h: await q("as", `select b.name, j.type, j.created_at, j.payload->>'to' as to_addr from jobs j join businesses b on b.id=j.business_id where j.type in ('authority_outreach_sent','authority_followup_sent') and j.created_at > now() - interval '6 hours' order by j.created_at desc limit 20`),
    emailEvents: await q("ee", `select event_type, count(*)::int n from email_events where email_id in (select payload->>'resendEmailId' from jobs where type='authority_outreach_sent' and created_at > now() - interval '6 hours') group by 1`),
    proofLevels: await q("pl", `select b.name, p.proof_level, p.metric_name, p.action_type, p.verified_at from proof_ledger p join businesses b on b.id=p.business_id order by p.verified_at desc limit 20`),
    measurementPlans: await q("mp", `select b.name, g.opportunity_type, g.status, g.measurement_plan->>'metric' metric, g.measurement_plan->>'earliestEvaluationAt' due from growth_opportunities g join businesses b on b.id=g.business_id where g.measurement_plan is not null order by 1,2`),
    learningEvidence: await q("le", `select opportunity_type, business_mode, measured_result->>'status' result, count(*)::int n from growth_opportunities where measured_result is not null group by 1,2,3 order by 1,2,3`),
  });
}

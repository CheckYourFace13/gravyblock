import { timingSafeEqual, createHmac } from "node:crypto";
import { getSqlClient } from "@/lib/db";
import { nextOpportunities, blockedByCapability, summaryByType } from "@/lib/opportunities/queue";
import { runTruthOpportunitiesBatch, createOpportunitiesFromTruth } from "@/lib/opportunities/truth-opportunities";
import { scanCrossEngineOpportunities } from "@/lib/opportunities/scan";
import { evaluateMeasurementPlans } from "@/lib/opportunities/evaluate";
import { runBasicSeoForBusiness, verifyBasicSeoActions } from "@/lib/seo/basic-autopilot";
import { runAeoActionForBusiness, runAeoRecheckBatch } from "@/lib/ai-visibility/aeo-actions";
import { runLlmProbesForBusiness } from "@/lib/ai-visibility/llm-probes";
import { discoverAndQualify, runAuthorityBatch } from "@/lib/authority/engine";
import { runCanaryAssertions } from "@/lib/canary/assertions";
import { getCapabilityProfile } from "@/lib/capability-profile";

export const maxDuration = 300;

function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!expected || !provided) return false;
  const a = createHmac("sha256", "acceptance3").update(provided).digest();
  const b = createHmac("sha256", "acceptance3").update(expected).digest();
  return timingSafeEqual(a, b);
}

async function run(engine: string, id: string) {
  switch (engine) {
    case "profile": {
      const p = await getCapabilityProfile(id);
      return { ...p, active: [...p.active] };
    }
    case "opportunities":
      return { next: await nextOpportunities(id, 10), blocked: await blockedByCapability(id, 10), byType: await summaryByType(id) };
    case "truth_opp":
      return createOpportunitiesFromTruth(id);
    case "scan_opp":
      return scanCrossEngineOpportunities(id);
    case "eval_plans":
      return evaluateMeasurementPlans(20);
    case "basic_seo":
      return runBasicSeoForBusiness(id);
    case "basic_seo_verify":
      return verifyBasicSeoActions(id);
    case "aeo_probe":
      return runLlmProbesForBusiness(id);
    case "aeo_act":
      return runAeoActionForBusiness(id);
    case "aeo_recheck":
      return runAeoRecheckBatch(6);
    case "authority_discover":
      return discoverAndQualify(id);
    case "authority_batch":
      return runAuthorityBatch({ maxBusinesses: 10 });
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
    opportunities: await q("op", `select b.name, g.opportunity_type, g.value_class, g.status, g.auto_eligible, count(*)::int n from growth_opportunities g join businesses b on b.id=g.business_id group by 1,2,3,4,5 order by 1,2`),
    measurementPlans: await q("mp", `select b.name, g.opportunity_type, g.measurement_plan->>'metric' metric, g.status from growth_opportunities g join businesses b on b.id=g.business_id where g.measurement_plan is not null order by 1,2`),
    proofLevels: await q("pl", `select b.name, p.proof_level, p.metric_name, p.action_type, p.verified_at from proof_ledger p join businesses b on b.id=p.business_id order by p.verified_at desc limit 20`),
    contentQueueAeo: await q("cq", `select b.name, c.title, c.status, c.variant from content_queue c join businesses b on b.id=c.business_id where c.variant='aeo_action' order by c.created_at desc limit 10`),
  });
}

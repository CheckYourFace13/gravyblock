import { timingSafeEqual, createHmac } from "node:crypto";
import { getSqlClient } from "@/lib/db";
import { getCapabilityProfile } from "@/lib/capability-profile";
import { getOperatingMode } from "@/lib/business-mode";
import { nextOpportunities, blockedByCapability, summaryByType } from "@/lib/opportunities/queue";
import { runBasicSeoForBusiness, verifyBasicSeoActions } from "@/lib/seo/basic-autopilot";
import { runCompetitorGapForBusiness } from "@/lib/competitors/gap-engine";
import { runAeoActionForBusiness, runAeoRecheckBatch } from "@/lib/ai-visibility/aeo-actions";
import { runCitationEngineForBusiness } from "@/lib/citations/engine";
import { discoverAndQualify, requalifyProspects, runAuthorityBatch, previewAuthorityOutreach } from "@/lib/authority/engine";
import { runSiteWatchdogForBusiness } from "@/lib/watchdog/site-watchdog";
import { autoConnectManagedSites } from "@/lib/site-publish/adapters";
import { runCanaryAssertions, runCanaryAssertionsBatch } from "@/lib/canary/assertions";
import { proofPointForFinding, prepareProofCandidates } from "@/lib/proof/sales";

export const maxDuration = 300;

function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!expected || !provided) return false;
  const a = createHmac("sha256", "acceptance2").update(provided).digest();
  const b = createHmac("sha256", "acceptance2").update(expected).digest();
  return timingSafeEqual(a, b);
}

async function run(engine: string, id: string) {
  switch (engine) {
    case "profile": {
      const p = await getCapabilityProfile(id);
      return { ...p, active: [...p.active] };
    }
    case "mode":
      return getOperatingMode(id);
    case "opportunities":
      return { next: await nextOpportunities(id, 10), blocked: await blockedByCapability(id, 10), byType: await summaryByType(id) };
    case "basic_seo":
      return runBasicSeoForBusiness(id);
    case "basic_seo_verify":
      return verifyBasicSeoActions(id);
    case "competitor":
      return runCompetitorGapForBusiness(id);
    case "aeo_act":
      return runAeoActionForBusiness(id);
    case "aeo_recheck":
      return runAeoRecheckBatch(4);
    case "citations":
      return runCitationEngineForBusiness(id);
    case "authority_discover":
      return discoverAndQualify(id);
    case "authority_requalify":
      return requalifyProspects(id);
    case "authority_preview":
      return previewAuthorityOutreach(id, 3);
    case "watchdog":
      return runSiteWatchdogForBusiness(id);
    case "connect_sites":
      return autoConnectManagedSites(20, id);
    case "canary":
      return runCanaryAssertions(id);
    case "canary_batch":
      return runCanaryAssertionsBatch();
    case "proof_match":
      return proofPointForFinding("fix-canonical-estimated-local-visibility", null);
    case "proof_candidates":
      return prepareProofCandidates(50);
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
  const q = async (label: string, text: string, params: unknown[] = []) => {
    try {
      return await sql.unsafe(text, params as never[]);
    } catch (e) {
      return [{ error: `${label}: ${e instanceof Error ? e.message : String(e)}` }];
    }
  };
  return Response.json({
    houseBusinesses: await q("hb", `select id, name, vertical, primary_category, plan_tier from businesses where account_type='house'`),
    opportunities: await q("op", `select b.name, g.opportunity_type, g.status, g.auto_eligible, count(*)::int n from growth_opportunities g join businesses b on b.id=g.business_id group by 1,2,3,4 order by 1,2`),
    proofLevels: await q("pl", `select business_id, proof_level, count(*)::int n from proof_ledger group by 1,2`),
    canaryRuns: await q("cr", `select b.name, j.status, j.created_at, left(j.payload::text,500) payload from jobs j join businesses b on b.id=j.business_id where j.type='canary_assertions_run' order by j.created_at desc limit 5`),
  });
}

import { timingSafeEqual, createHmac } from "node:crypto";
import { getSqlClient } from "@/lib/db";
import { runOrchestrator } from "@/lib/opportunities/orchestrator";
import { allOpenRanked, normalizeLegacyMeasuredResults } from "@/lib/opportunities/queue";
import { getLearnedWeights } from "@/lib/opportunities/learning";
import { discoverUnlinkedMentions, discoverBrokenLinkOpportunities } from "@/lib/authority/engine";
import { runCanaryAssertions } from "@/lib/canary/assertions";

export const maxDuration = 300;

function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!expected || !provided) return false;
  const a = createHmac("sha256", "acceptance6").update(provided).digest();
  const b = createHmac("sha256", "acceptance6").update(expected).digest();
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
    case "canary":
      return runCanaryAssertions(id);
    case "migrate":
      return normalizeLegacyMeasuredResults();
    case "learning":
      return [...(await getLearnedWeights()).entries()];
    default:
      return { error: "unknown_engine" };
  }
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const engine = url.searchParams.get("engine") ?? "";
  const which = (url.searchParams.get("biz") ?? "").toLowerCase();
  if (engine === "migrate" || engine === "learning") {
    try {
      return Response.json({ engine, result: await run(engine, "") });
    } catch (e) {
      return Response.json({ engine, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }
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
    proofLevels: await q("pl", `select b.name, p.proof_level, p.metric_name, p.verified_at from proof_ledger p join businesses b on b.id=p.business_id order by p.verified_at desc limit 20`),
    measurementPlans: await q("mp", `select b.name, g.opportunity_type, g.status, g.measurement_plan->>'metric' metric, g.measurement_plan->>'earliestEvaluationAt' due, g.measured_result->>'status' result from growth_opportunities g join businesses b on b.id=g.business_id where g.measurement_plan is not null order by 1,2`),
    ambiguousRows: await q("amb", `select count(*)::int n from growth_opportunities where measured_result is not null and measured_result->>'status' is null`),
    authorityTotals: await q("at", `select b.name, o.opportunity_kind, o.status, count(*)::int n from backlink_opportunities o join businesses b on b.id=o.business_id where b.account_type='house' group by 1,2,3 order by 1,2,3`),
  });
}

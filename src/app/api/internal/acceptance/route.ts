import { timingSafeEqual, createHmac } from "node:crypto";
import { getSqlClient } from "@/lib/db";
import { runOrchestrator } from "@/lib/opportunities/orchestrator";
import { runCanaryAssertions } from "@/lib/canary/assertions";

export const maxDuration = 300;

function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!expected || !provided) return false;
  const a = createHmac("sha256", "acceptance7").update(provided).digest();
  const b = createHmac("sha256", "acceptance7").update(expected).digest();
  return timingSafeEqual(a, b);
}

async function run(engine: string, id: string) {
  switch (engine) {
    case "orchestrate":
      return runOrchestrator(id, 8);
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
    proofLevels: await q("pl", `select proof_level, count(*)::int n from proof_ledger group by 1 order by 1`),
    activePlans: await q("ap", `select count(*)::int n from growth_opportunities where measurement_plan is not null and status='acted'`),
    queuedOpen: await q("qo", `select count(*)::int n from growth_opportunities where status='open' and auto_eligible='true'`),
    acquiredBacklinks: await q("ab", `select count(*)::int n from backlink_opportunities where status='acquired'`),
  });
}

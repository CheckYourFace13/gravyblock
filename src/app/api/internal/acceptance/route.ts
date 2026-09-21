import { timingSafeEqual, createHmac } from "node:crypto";
import { getSqlClient } from "@/lib/db";
import { refreshBusinessTruth, getBusinessTruth } from "@/lib/truth";
import { planTruthGroundedContent } from "@/lib/autopilot/content-planner";
import { executeContentPublishPath } from "@/lib/autopilot/executor";
import { fetchGscPageQuery, findOpportunities, getWordPressTarget } from "@/lib/seo/existing-pages";
import { runCompetitorGapForBusiness } from "@/lib/competitors/gap-engine";
import { runLlmProbesForBusiness } from "@/lib/ai-visibility/llm-probes";
import { runAeoActionForBusiness } from "@/lib/ai-visibility/aeo-actions";
import { runCitationEngineForBusiness } from "@/lib/citations/engine";
import { discoverAndQualify, previewAuthorityOutreach } from "@/lib/authority/engine";
import { runSiteWatchdogForBusiness } from "@/lib/watchdog/site-watchdog";
import { getConnectionReadiness, getNeedsYou } from "@/lib/onboarding/connection-readiness";
import { autoConnectManagedSites } from "@/lib/site-publish/adapters";
import { runBasicSeoForBusiness, verifyBasicSeoActions } from "@/lib/seo/basic-autopilot";
import { planTruthGroundedSocial } from "@/lib/social/truth-social";
import { prepareProofCandidates, generateCaseStudies, getProofAttribution } from "@/lib/proof/sales";

/** TEMPORARY, secret-gated production acceptance runner. Remove after use. Never sends outreach email. */
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!expected || !provided) return false;
  const a = createHmac("sha256", "acceptance").update(provided).digest();
  const b = createHmac("sha256", "acceptance").update(expected).digest();
  return timingSafeEqual(a, b);
}

async function rawProbe(model: string) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { model, error: "no_key" };
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Who is the most trusted marina in Chicago? Cite sources." }], max_tokens: 200 }),
      signal: AbortSignal.timeout(40000),
    });
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    const msg = (json?.choices as { message?: Record<string, unknown> }[] | undefined)?.[0]?.message;
    return {
      model,
      status: res.status,
      topLevelKeys: json ? Object.keys(json) : null,
      messageKeys: msg ? Object.keys(msg) : null,
      citations: Array.isArray(json?.citations) ? (json!.citations as unknown[]).slice(0, 3) : null,
      annotations: Array.isArray(msg?.annotations) ? (msg!.annotations as unknown[]).slice(0, 2) : null,
      errorBody: res.ok ? null : text.slice(0, 200),
      contentPreview: typeof msg?.content === "string" ? (msg.content as string).slice(0, 120) : null,
    };
  } catch (e) {
    return { model, error: e instanceof Error ? e.message : String(e) };
  }
}

async function run(engine: string, id: string) {
  switch (engine) {
    case "truth_light":
      return refreshBusinessTruth(id, "light");
    case "truth_deep":
      return refreshBusinessTruth(id, "deep");
    case "truth_read": {
      const t = await getBusinessTruth(id);
      return { sufficient: t.sufficient, reason: t.insufficientReason, verifiedCity: t.verifiedCity, services: t.services, description: t.description, factCount: t.facts.length, byKey: t.facts.reduce<Record<string, number>>((m, f) => ((m[f.key] = (m[f.key] ?? 0) + 1), m), {}), sample: t.facts.slice(0, 25).map((f) => ({ k: f.key, v: f.value.slice(0, 90), s: f.sourceSystem, exp: f.expiresAt })) };
    }
    case "content": {
      const plan = await planTruthGroundedContent({ businessId: id, maxItems: 2, maxLocationPages: 1 });
      const exec = await executeContentPublishPath(id);
      return { plan, exec };
    }
    case "seo": {
      const wp = await getWordPressTarget(id);
      const gsc = await fetchGscPageQuery(id);
      const opps = gsc.connected ? await findOpportunities(id) : [];
      return { wordpressTarget: Boolean(wp), gsc, opportunities: opps.length };
    }
    case "competitor":
      return runCompetitorGapForBusiness(id);
    case "aeo_probe":
      return runLlmProbesForBusiness(id);
    case "aeo_act":
      return runAeoActionForBusiness(id);
    case "aeo_raw":
      return [await rawProbe("perplexity/sonar"), await rawProbe("perplexity/llama-3.1-sonar-small-128k-online"), await rawProbe("openai/gpt-4o-mini:online")];
    case "citations":
      return runCitationEngineForBusiness(id);
    case "authority_discover":
      return discoverAndQualify(id);
    case "authority_preview":
      return previewAuthorityOutreach(id, 3);
    case "watchdog":
      return runSiteWatchdogForBusiness(id);
    case "readiness":
      return { readiness: await getConnectionReadiness(id, { freshTruth: true }), needsYou: await getNeedsYou(id) };
    case "proof_candidates":
      return prepareProofCandidates(200);
    case "case_studies":
      return generateCaseStudies(20);
    case "proof_attribution":
      return getProofAttribution();
    case "retract_bad_aeo": {
      const sql = getSqlClient()!;
      const a = await sql.unsafe(`update content_queue set status='skipped' where business_id=$1 and variant='aeo_action' and status in ('queued','awaiting_connection') and title not like 'How to choose%' returning id`, [id] as never[]);
      const b = await sql.unsafe(`update jobs set type='aeo_action_retracted', status='retracted_bad_title' where business_id=$1 and type='aeo_action' and status='queued' and payload->>'queuedTitle' is not null and payload->>'queuedTitle' not like 'How to choose%' returning id`, [id] as never[]);
      return { queueRetracted: a.length, jobsSuperseded: b.length };
    }
    case "connect_sites":
      return autoConnectManagedSites(20);
    case "basic_seo":
      return runBasicSeoForBusiness(id);
    case "basic_seo_verify":
      return verifyBasicSeoActions(id);
    case "social":
      return planTruthGroundedSocial(id);
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
    `select id, name from businesses where lower(name) like $1 and (name ilike '%league pour%' or name ilike '%boating chicago%') limit 1`,
    [`%${which}%`] as never[],
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

/** Read-only evidence: jobs, proof ledger, state tables for the canaries. */
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
  const ids = `(select id from businesses where name ilike '%league pour%' or name ilike '%boating chicago%')`;
  return Response.json({
    bizRows: await q("biz", `select id, name, account_type, plan_tier, vertical, primary_category, address, place_id, website, showcase_opt_in from businesses where id in ${ids}`),
    cfgRows: await q("cfg", `select business_id, source, target_scope, focus_area, left(service_description,80) sd from business_configs where business_id in ${ids}`),
    scanLoc: await q("scan", `select s.business_id, s.lookup_location, s.created_at from scans s where s.business_id in ${ids} order by s.created_at desc limit 6`),
    reportIds: await q("rep", `select public_id from reports order by created_at desc limit 2`),
    proofLedger: await q("proof", `select business_id, action_type, engine, proof_category, left(summary,160) summary, verified_at from proof_ledger order by verified_at desc limit 20`),
    jobs24h: await q("jobs", `select b.name, j.type, j.status, count(*)::int n, max(j.created_at) last_at from jobs j join businesses b on b.id=j.business_id where j.business_id in ${ids} and j.created_at > now() - interval '24 hours' group by 1,2,3 order by 1,2,3`),
    jobSamples: await q("samples", `select distinct on (b.name, j.type) b.name, j.type, j.status, left(j.payload::text, 420) payload from jobs j join businesses b on b.id=j.business_id where j.business_id in ${ids} and j.created_at > now() - interval '24 hours' order by b.name, j.type, j.created_at desc`),
    truthFacts: await q("facts", `select b.name, f.status, f.fact_key, count(*)::int n from business_facts f join businesses b on b.id=f.business_id where f.business_id in ${ids} group by 1,2,3 order by 1,2,3`),
    truthPages: await q("pages", `select b.name, count(*)::int pages, max(last_fetched_at) last_fetch from truth_pages t join businesses b on b.id=t.business_id where t.business_id in ${ids} group by 1`),
    citationListings: await q("cl", `select business_id, count(*)::int n from citation_listings group by 1`),
    aiChecks: await q("ai", `select b.name, a.engine, a.mention_found, (a.citation_url is not null) has_cit, count(*)::int n, max(a.created_at) last_at from ai_visibility_checks a join businesses b on b.id=a.business_id where a.business_id in ${ids} and a.created_at > now() - interval '24 hours' group by 1,2,3,4`),
    backlinks: await q("bl", `select b.name, o.status, o.contact_source, count(*)::int n from backlink_opportunities o join businesses b on b.id=o.business_id where o.business_id in ${ids} group by 1,2,3`),
    contentQueue: await q("cq", `select b.name, c.kind, c.status, c.variant, count(*)::int n from content_queue c join businesses b on b.id=c.business_id where c.business_id in ${ids} and c.created_at > now() - interval '2 days' group by 1,2,3,4`),
  });
}

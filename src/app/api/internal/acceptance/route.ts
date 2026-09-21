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
import { discoverAndQualify, previewAuthorityOutreach, requalifyProspects, runAuthorityBatch } from "@/lib/authority/engine";
import { classifyReply, handleAuthorityReply } from "@/lib/authority/replies";
import { getOperatingMode } from "@/lib/business-mode";
import { runSiteWatchdogForBusiness } from "@/lib/watchdog/site-watchdog";
import { getConnectionReadiness, getNeedsYou } from "@/lib/onboarding/connection-readiness";
import { ensureInboundReceiving } from "@/lib/authority/inbound-setup";
import { autoConnectManagedSites } from "@/lib/site-publish/adapters";
import { runBasicSeoForBusiness, verifyBasicSeoActions } from "@/lib/seo/basic-autopilot";
import { planTruthGroundedSocial } from "@/lib/social/truth-social";
import { proofPointForFinding, prepareProofCandidates, generateCaseStudies, getProofAttribution } from "@/lib/proof/sales";

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
      return autoConnectManagedSites(20, id);
    case "basic_seo":
      return runBasicSeoForBusiness(id);
    case "basic_seo_verify":
      return verifyBasicSeoActions(id);
    case "fix_proof_count": {
      const sql = getSqlClient()!;
      const r = await sql.unsafe(`update proof_ledger set summary = replace(summary, '12 live pages', '11 live pages'), metric_after = 11,
        before_evidence = jsonb_set(before_evidence, '{of}', '24'),
        after_evidence = jsonb_set(jsonb_set(jsonb_set(after_evidence, '{value}', '11'), '{livePagesConfirmed}', '11'), '{of}', '24') || jsonb_build_object('correction', 'Original count double-counted the home page (two URL spellings); corrected to distinct pages.')
        where business_id = $1 and action_type = 'seo_basic_no_social_image' and metric_after = 12 returning id`, [id] as never[]);
      return { corrected: r.length };
    }
    case "mode":
      return getOperatingMode(id);
    case "requalify":
      return requalifyProspects(id);
    case "authority_batch":
      return runAuthorityBatch({ maxBusinesses: 10 });
    case "classify_reply":
      return ["Thanks, happy to add it to our resources page", "Not interested, thank you", "Please remove me from your list", "Out of office until Monday", "Can you tell me more about what your site offers?"].map((t) => ({ t, c: classifyReply(t) }));
    case "resend_status": {
      const key = process.env.RESEND_API_KEY;
      if (!key) return { error: "no_key" };
      const h = { authorization: `Bearer ${key}` };
      const d = await fetch("https://api.resend.com/domains", { headers: h }).then((r) => r.json()).catch(() => null);
      const w = await fetch("https://api.resend.com/webhooks", { headers: h }).then((r) => r.json()).catch(() => null);
      const strip = (o: unknown) => JSON.parse(JSON.stringify(o ?? null, (k, v) => (k === "signing_secret" || k === "secret" ? undefined : v)));
      return { domains: strip(d), webhooks: strip(w) };
    }
    case "resend_add_receiving": {
      const key = process.env.RESEND_API_KEY;
      if (!key) return { error: "no_key" };
      const r = await fetch("https://api.resend.com/domains", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ name: "reply.gravyblock.com", capabilities: { sending: "disabled", receiving: "enabled" } }) });
      const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
      return { status: r.status, body: JSON.parse(JSON.stringify(j ?? null, (k, v) => (k === "signing_secret" ? undefined : v))) };
    }
    case "resend_verify": {
      const key = process.env.RESEND_API_KEY;
      if (!key) return { error: "no_key" };
      const h = { authorization: `Bearer ${key}`, "content-type": "application/json" };
      const list = (await fetch("https://api.resend.com/domains", { headers: h }).then((r) => r.json()).catch(() => null)) as { data?: { id: string; name: string }[] } | null;
      const d = list?.data?.find((x) => x.name === "reply.gravyblock.com");
      if (!d) return { error: "domain_not_found" };
      await fetch(`https://api.resend.com/domains/${d.id}/verify`, { method: "POST", headers: h }).catch(() => null);
      const g = await fetch(`https://api.resend.com/domains/${d.id}`, { headers: h }).then((r) => r.json()).catch(() => null);
      return g;
    }
    case "resend_webhook_event": {
      const key = process.env.RESEND_API_KEY;
      if (!key) return { error: "no_key" };
      const h = { authorization: `Bearer ${key}`, "content-type": "application/json" };
      const r = await fetch("https://api.resend.com/webhooks/a44910f0-4b13-49b5-aeec-44e9bef41955", { method: "PATCH", headers: h, body: JSON.stringify({ events: ["email.bounced", "email.clicked", "email.complained", "email.delivered", "email.opened", "email.received"] }) });
      return { status: r.status, body: await r.text().then((t) => t.slice(0, 300)) };
    }
    case "mark_inbound_ready": {
      const sql = getSqlClient()!;
      await sql.unsafe(`insert into jobs (type, status, payload) values ('inbound_domain_ready','completed','{"domain":"reply.gravyblock.com"}'::jsonb)`);
      return { ok: true };
    }
    case "proof_match": {
      const sql = getSqlClient()!;
      const rows = (await sql.unsafe(`select public_id, payload->'prioritizedFixes'->0->>'id' as fix_id from reports order by created_at desc limit 300`)) as unknown as { public_id: string; fix_id: string | null }[];
      const byFix = new Map<string, string>();
      for (const r of rows) if (r.fix_id && !byFix.has(r.fix_id)) byFix.set(r.fix_id, r.public_id);
      const out: { fixId: string; reportId: string; proof: unknown }[] = [];
      for (const [fixId, reportId] of byFix) out.push({ fixId, reportId, proof: await proofPointForFinding(fixId) });
      return out;
    }
    case "retract_managed_content": {
      const sql = getSqlClient()!;
      const a = await sql.unsafe(`update published_content set status='retracted' where business_id=$1 and channel='managed_feed' and status='published' returning id`, [id] as never[]);
      const b = await sql.unsafe(`delete from proof_ledger where business_id=$1 and action_type='content_published' returning id`, [id] as never[]);
      const c = await sql.unsafe(`update content_queue set status='skipped' where business_id=$1 and variant='primary_market' and status in ('queued','ready','awaiting_connection') returning id`, [id] as never[]);
      return { retracted: a.length, proofRowsRemoved: b.length, queueHeld: c.length };
    }
    case "inbound_ensure":
      return ensureInboundReceiving();
    case "reply_test_setup": {
      const sql = getSqlClient()!;
      const r = await sql.unsafe(`insert into backlink_opportunities (business_id, source_name, source_type, target_url, status, contact_email, contact_source, relevance_note, quality_score) values ($1,'GravyBlock reply-loop TEST','association','https://example.org','contacted','delivered@resend.dev','test','TEST row for reply-loop verification',50) returning id`, [id] as never[]);
      return r;
    }
    case "reply_test_send": {
      const key = process.env.RESEND_API_KEY;
      const sql = getSqlClient()!;
      const opp = (await sql.unsafe(`select id from backlink_opportunities where business_id=$1 and source_name='GravyBlock reply-loop TEST' order by created_at desc limit 1`, [id] as never[])) as unknown as { id: string }[];
      const from = (process.env.OUTREACH_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL ?? "").match(/<([^>]+)>/)?.[1] ?? process.env.RESEND_FROM_EMAIL ?? "";
      const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [`reply+${opp[0]!.id}@reply.gravyblock.com`], subject: "Re: A resource for TEST", text: "Thanks for reaching out. Can you tell me more about what your website offers?" }) });
      return { status: r.status, opp: opp[0]!.id, body: (await r.text()).slice(0, 200) };
    }
    case "reply_test_result": {
      const sql = getSqlClient()!;
      const opp = await sql.unsafe(`select id, status from backlink_opportunities where business_id=$1 and source_name='GravyBlock reply-loop TEST' order by created_at desc limit 1`, [id] as never[]);
      const ev = await sql.unsafe(`select type, status, left(payload::text,300) payload, created_at from jobs where business_id=$1 and type in ('authority_reply','authority_reply_sent','authority_needs_you') order by created_at desc limit 5`, [id] as never[]);
      return { opp, ev };
    }
    case "reply_test_cleanup": {
      const sql = getSqlClient()!;
      const b = await sql.unsafe(`delete from jobs where business_id=$1 and payload->>'opportunityId' in (select id::text from backlink_opportunities where business_id=$1 and source_name='GravyBlock reply-loop TEST') returning id`, [id] as never[]);
      const a = await sql.unsafe(`delete from backlink_opportunities where business_id=$1 and source_name='GravyBlock reply-loop TEST' returning id`, [id] as never[]);
      return { opps: a.length, jobs: b.length };
    }
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
    authoritySends: await q("as", `select b.name, b.account_type, j.type, j.created_at, j.payload->>'to' as to_addr, j.payload->>'subject' as subject, j.payload->>'resendEmailId' as rid from jobs j join businesses b on b.id=j.business_id where j.type in ('authority_outreach_sent','authority_followup_sent','authority_reply_sent') order by j.created_at desc limit 20`),
    authorityReplies: await q("ar", `select b.name, j.status, j.created_at, left(j.payload::text, 300) payload from jobs j join businesses b on b.id=j.business_id where j.type in ('authority_reply','authority_needs_you') order by j.created_at desc limit 10`),
    emailEvents: await q("ee", `select event_type, count(*)::int n from email_events where email_id in (select payload->>'resendEmailId' from jobs where type='authority_outreach_sent') group by 1`),
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

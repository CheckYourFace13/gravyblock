import type { Metadata } from "next";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { backlinkOpportunities, getDb, growthOpportunities, jobs, proofLedger } from "@/lib/db";
import { listHouseAccounts, HOUSE_JOB } from "@/lib/house";
import { allOpenRanked } from "@/lib/opportunities/queue";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "House fleet detail" };

/** Read-only evidence for every house account: the actual job rows, opportunity rows and proof rows the engines wrote. */
export default async function HouseFleetDetail() {
  const db = getDb();
  const accounts = db ? await listHouseAccounts() : [];
  const ids = accounts.map((a) => a.id);
  const rows = db && ids.length
    ? await db
        .select({ businessId: jobs.businessId, type: jobs.type, status: jobs.status, createdAt: jobs.createdAt, payload: jobs.payload })
        .from(jobs)
        .where(and(inArray(jobs.businessId, ids), inArray(jobs.type, ["truth_refresh", HOUSE_JOB.discovery, HOUSE_JOB.orchestrator, HOUSE_JOB.cycle, HOUSE_JOB.connectorCheck, "site_connector_connected", "connector_selftest"])))
        .orderBy(desc(jobs.createdAt))
        .limit(3000)
    : [];
  const proofs = db && ids.length ? await db.select().from(proofLedger).where(inArray(proofLedger.businessId, ids)).orderBy(desc(proofLedger.verifiedAt)).limit(200) : [];
  const measured = db && ids.length
    ? await db
        .select({ businessId: growthOpportunities.businessId, type: growthOpportunities.opportunityType, subtype: growthOpportunities.subtype, status: growthOpportunities.status, verification: growthOpportunities.verificationStatus, plan: growthOpportunities.measurementPlan, result: growthOpportunities.measuredResult, actedAt: growthOpportunities.actedAt })
        .from(growthOpportunities)
        .where(and(inArray(growthOpportunities.businessId, ids), sql`${growthOpportunities.status} in ('acted','verified','no_gain')`))
        .limit(200)
    : [];
  const sends = db && ids.length
    ? await db.select({ businessId: jobs.businessId, createdAt: jobs.createdAt }).from(jobs).where(and(inArray(jobs.businessId, ids), eq(jobs.type, "authority_outreach_sent"))).limit(2000)
    : [];
  const backlinkStatus = db && ids.length
    ? await db.select({ businessId: backlinkOpportunities.businessId, status: backlinkOpportunities.status, n: sql<number>`count(*)::int` }).from(backlinkOpportunities).where(inArray(backlinkOpportunities.businessId, ids)).groupBy(backlinkOpportunities.businessId, backlinkOpportunities.status)
    : [];
  const wd = db ? await db.select({ createdAt: jobs.createdAt, payload: jobs.payload }).from(jobs).where(eq(jobs.type, HOUSE_JOB.watchdog)).orderBy(desc(jobs.createdAt)).limit(1) : [];
  const withdrawn = db ? await db.select({ createdAt: jobs.createdAt, payload: jobs.payload }).from(jobs).where(eq(jobs.type, "house_site_writes_withdrawn_v1")).orderBy(desc(jobs.createdAt)).limit(1) : [];
  const evalRun = db ? await db.select({ createdAt: jobs.createdAt, payload: jobs.payload }).from(jobs).where(eq(jobs.type, "opportunity_measurement_eval")).orderBy(desc(jobs.createdAt)).limit(1) : [];
  const dueSoon = measured.filter((m) => {
    const plan = m.plan as { earliestEvaluationAt?: string } | null;
    return plan?.earliestEvaluationAt && new Date(plan.earliestEvaluationAt).getTime() <= Date.now() && !m.result;
  }).length;
  const evaluated = measured.filter((m) => m.result).length;
  const j = (v: unknown) => JSON.stringify(v);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 text-xs">
      <h1 className="text-xl font-semibold text-zinc-900">House fleet detail</h1>
      <p className="text-zinc-600">Last watchdog: {wd[0] ? `${wd[0].createdAt.toISOString()} ${j(wd[0].payload)}` : "never"}</p>
      <p className="text-zinc-600"><b>Policy: house sites are read-only.</b> GravyBlock-written overrides/articles withdrawn: {withdrawn[0] ? `${withdrawn[0].createdAt.toISOString()} ${j(withdrawn[0].payload)}` : "pending (runs on the next worker check)"}</p>
      <p className="text-zinc-600">Measurement: plans {measured.filter((m) => m.plan).length}, due now {dueSoon}, evaluated {evaluated}; evaluator last ran {evalRun[0] ? `${evalRun[0].createdAt.toISOString()} ${j(evalRun[0].payload)}` : "never"}</p>
      {await Promise.all(
        accounts.map(async (a) => {
          const mine = rows.filter((r) => r.businessId === a.id);
          const pick = (t: string, n: number) => mine.filter((r) => r.type === t).slice(0, n);
          const ranked = await allOpenRanked(a.id, 12);
          const myProof = proofs.filter((p) => p.businessId === a.id);
          const myMeasured = measured.filter((m) => m.businessId === a.id);
          return (
            <section key={a.id} className="space-y-1.5 rounded-xl border border-zinc-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-zinc-900">{a.name} <span className="font-normal text-zinc-500">{a.website} · plan {a.planTier} · {a.subscriptionStatus ?? "no subscription"}</span></h2>
              <p><b>truth_refresh</b></p>
              {pick("truth_refresh", 3).map((r, i) => <p key={i} className="font-mono">{r.createdAt.toISOString()} {r.status} {j(r.payload)}</p>)}
              <p><b>discovery</b></p>
              {pick(HOUSE_JOB.discovery, 2).map((r, i) => <p key={i} className="font-mono">{r.createdAt.toISOString()} {j(r.payload)}</p>)}
              <p><b>orchestrator</b></p>
              {pick(HOUSE_JOB.orchestrator, 2).map((r, i) => <p key={i} className="font-mono break-all">{r.createdAt.toISOString()} {j(r.payload)}</p>)}
              <p><b>cycles / connector</b></p>
              {[...pick(HOUSE_JOB.cycle, 2), ...pick(HOUSE_JOB.connectorCheck, 1), ...pick("site_connector_connected", 1), ...pick("connector_selftest", 2)].map((r, i) => <p key={i} className="font-mono break-all">{r.createdAt.toISOString()} {r.type} {r.status} {j(r.payload)}</p>)}
              <p><b>ranked open ({ranked.length})</b></p>
              {ranked.map((o) => <p key={o.id} className="font-mono">{Math.round(o.rankScore)} {o.opportunityType}:{o.subtype} {o.status} {o.eligibility} cap={o.requiredCapability ?? "-"} class={o.valueClass} mode={o.businessMode} impact={o.expectedImpact} conf={o.confidence} i*c={o.expectedImpact * o.confidence} (need 400) auto={o.autoEligible}</p>)}
              <p><b>acted / measuring ({myMeasured.length})</b></p>
              {myMeasured.map((m, i) => <p key={i} className="font-mono break-all">{m.type}:{m.subtype} {m.status} {m.verification} plan={j(m.plan)} result={j(m.result)}</p>)}
              <p><b>authority</b> sent 24h={sends.filter((x) => x.businessId === a.id && Date.now() - x.createdAt.getTime() < 86_400_000).length} 7d={sends.filter((x) => x.businessId === a.id && Date.now() - x.createdAt.getTime() < 7 * 86_400_000).length} prospects: {backlinkStatus.filter((x) => x.businessId === a.id).map((x) => `${x.status}=${x.n}`).join(" ") || "none"}</p>
              <p><b>proof ({myProof.length})</b></p>
              {myProof.map((p) => <p key={p.id} className="font-mono">L{p.proofLevel} {p.actionType} {p.verifiedAt.toISOString()} {p.summary.slice(0, 110)}</p>)}
            </section>
          );
        }),
      )}
    </div>
  );
}

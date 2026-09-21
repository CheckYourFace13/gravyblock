/**
 * Sales use of the Proof Ledger. Nothing here writes proof; it only reads verified
 * ledger rows and (a) selects an honest proof point for a prospect finding,
 * (b) prepares proof candidates for outreach sends WITHOUT touching email copy,
 * (c) drafts case studies from measured ledger rows, and (d) reports which proof
 * type is associated with which funnel step.
 */

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { businesses, getDb, jobs, proofLedger } from "@/lib/db";
import { getPublicProof, proofCategoriesForFinding, type ProofCategory } from "./ledger";

export type ProofPoint = { text: string; category: ProofCategory; ledgerId: string };

/** One concise, verifiable proof point for a prospect finding (industry-matched rows first), or null. */
export async function proofPointForFinding(findingId: string | null | undefined, industry?: string | null): Promise<ProofPoint | null> {
  const cats = proofCategoriesForFinding(findingId);
  const rows = await getPublicProof({ limit: 30, categories: cats });
  if (rows.length === 0) return null;
  const ind = industry?.toLowerCase() ?? "";
  const score = (r: (typeof rows)[number]) =>
    (r.findingType && findingId && findingId.includes(r.findingType) ? 4 : 0) +
    (r.metricBefore != null && r.metricAfter != null ? 2 : 0) +
    (ind && r.industry?.toLowerCase() === ind ? 1 : 0);
  const row = [...rows].sort((a, b) => score(b) - score(a))[0]!;
  const measured = row.metricBefore != null && row.metricAfter != null && row.metricName ? ` ${row.metricName} went from ${row.metricBefore} to ${row.metricAfter}.` : "";
  const what = row.summary.replace(/^GravyBlock\s+/i, "").replace(/^./, (c) => c.toLowerCase());
  return {
    text: `GravyBlock ${what} (${row.businessName}, verified ${row.verifiedAt.toISOString().slice(0, 10)}).${measured}`,
    category: row.proofCategory as ProofCategory,
    ledgerId: row.id,
  };
}

/**
 * For recent cold-outreach sends, store the candidate proof type against the send's
 * attribution token. Read-only with respect to sending: no email body, subject,
 * variant, allocation or eligibility is read or changed. Idempotent per send job.
 */
export async function prepareProofCandidates(limit = 200): Promise<{ prepared: number; withProof: number }> {
  const db = getDb();
  if (!db) return { prepared: 0, withProof: 0 };
  const since = new Date(Date.now() - 14 * 86_400_000);
  const sends = await db
    .select({ id: jobs.id, payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.type, "cold_outreach_sent"), gte(jobs.createdAt, since)))
    .orderBy(desc(jobs.createdAt))
    .limit(limit);
  if (sends.length === 0) return { prepared: 0, withProof: 0 };
  const done = await db
    .select({ payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.type, "proof_candidate"), gte(jobs.createdAt, since)));
  const doneIds = new Set(done.map((d) => (d.payload as { sendJobId?: string } | null)?.sendJobId));
  let prepared = 0;
  let withProof = 0;
  for (const s of sends) {
    if (doneIds.has(s.id)) continue;
    const p = (s.payload ?? {}) as { topFindingId?: string | null; industry?: string | null; attributionToken?: string; isNamed?: boolean; variant?: string };
    const point = await proofPointForFinding(p.topFindingId, p.industry);
    await db.insert(jobs).values({
      type: "proof_candidate",
      status: point ? "candidate" : "no_relevant_proof",
      payload: {
        sendJobId: s.id,
        attributionToken: p.attributionToken ?? null,
        findingId: p.topFindingId ?? null,
        vertical: p.industry ?? null,
        contactType: p.isNamed ? "named" : "generic",
        proofCategory: point?.category ?? null,
        ledgerId: point?.ledgerId ?? null,
        usedInEmail: false,
      },
    });
    prepared++;
    if (point) withProof++;
  }
  return { prepared, withProof };
}

/** Case-study drafts from ledger rows that have BOTH a before/after evidence trail and a measured result. */
export async function generateCaseStudies(limit = 20): Promise<{ created: number; published: number }> {
  const db = getDb();
  if (!db) return { created: 0, published: 0 };
  const rows = await db
    .select({ row: proofLedger, name: businesses.name, accountType: businesses.accountType, showcase: businesses.showcaseOptIn })
    .from(proofLedger)
    .innerJoin(businesses, eq(businesses.id, proofLedger.businessId))
    .where(sql`${proofLedger.metricBefore} is not null and ${proofLedger.metricAfter} is not null and ${proofLedger.beforeEvidence} is not null and ${proofLedger.afterEvidence} is not null`)
    .orderBy(desc(proofLedger.verifiedAt))
    .limit(limit);
  if (rows.length === 0) return { created: 0, published: 0 };
  const existing = await db
    .select({ payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.type, "case_study"), inArray(sql`${jobs.payload}->>'ledgerId'`, rows.map((r) => r.row.id))));
  const have = new Set(existing.map((e) => (e.payload as { ledgerId?: string }).ledgerId));
  let created = 0;
  let published = 0;
  for (const { row, name, accountType, showcase } of rows) {
    if (have.has(row.id)) continue;
    const consent = accountType === "house" || showcase === "true";
    const improved = (row.metricAfter ?? 0) !== (row.metricBefore ?? 0);
    if (!improved) continue; // execution without a changed result is not a case study
    const status = consent ? "published" : "draft_needs_consent";
    await db.insert(jobs).values({
      businessId: row.businessId,
      type: "case_study",
      status,
      payload: {
        ledgerId: row.id,
        title: `${name}: ${row.metricName ?? "result"} ${row.metricBefore} to ${row.metricAfter}`,
        business: consent ? name : "A GravyBlock customer",
        before: { metric: row.metricName, value: row.metricBefore, evidence: row.beforeEvidence },
        action: row.summary,
        destination: consent ? row.destination : null,
        verifiedAt: row.verifiedAt.toISOString(),
        after: { metric: row.metricName, value: row.metricAfter, evidence: row.afterEvidence },
        methodVersion: row.methodVersion,
        category: row.proofCategory,
      },
    });
    created++;
    if (consent) published++;
  }
  return { created, published };
}

export type CaseStudy = {
  title: string;
  business: string;
  action: string;
  before: { metric: string | null; value: number | null };
  after: { metric: string | null; value: number | null };
  verifiedAt: string;
  destination: string | null;
};

export async function getPublishedCaseStudies(limit = 6): Promise<CaseStudy[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select({ payload: jobs.payload }).from(jobs).where(and(eq(jobs.type, "case_study"), eq(jobs.status, "published"))).orderBy(desc(jobs.createdAt)).limit(limit);
  return rows.map((r) => r.payload as CaseStudy);
}

export type ProofAttributionRow = { proofType: string; reportVisits: number; pricingViews: number; unlocks: number; checkoutStarted: number; paid: number };

/**
 * Funnel steps grouped by the proof type shown on the prospect's report. Sessions are
 * tied to their landing event through the opaque attribution token (or, failing that,
 * the report id). proofType "none" is the baseline with no proof shown.
 */
export async function getProofAttribution(): Promise<ProofAttributionRow[]> {
  const db = getDb();
  if (!db) return [];
  const res = await db.execute(sql`
    with landed as (
      select distinct on (coalesce(metadata->>'attributionToken', report_public_id))
        coalesce(metadata->>'attributionToken', report_public_id) as k,
        coalesce(metadata->>'proofType', 'none') as proof_type,
        session_id
      from funnel_events
      where event_type = 'report_landed' and coalesce(metadata->>'attributionToken', report_public_id) is not null
      order by coalesce(metadata->>'attributionToken', report_public_id), created_at asc
    )
    select l.proof_type,
      count(distinct l.k)::int as report_visits,
      count(distinct e.session_id) filter (where e.event_type = 'pricing_viewed')::int as pricing_views,
      count(distinct e.session_id) filter (where e.event_type = 'report_unlocked')::int as unlocks,
      count(distinct e.session_id) filter (where e.event_type = 'checkout_started')::int as checkout_started,
      count(distinct e.session_id) filter (where e.event_type = 'checkout_completed')::int as paid
    from landed l
    left join funnel_events e on (e.metadata->>'attributionToken' = l.k or e.report_public_id = l.k)
    group by l.proof_type
    order by report_visits desc`);
  const rows = (res as unknown as { rows?: Record<string, unknown>[] }).rows ?? (res as unknown as Record<string, unknown>[]);
  return rows.map((r) => ({
    proofType: String(r.proof_type),
    reportVisits: Number(r.report_visits),
    pricingViews: Number(r.pricing_views),
    unlocks: Number(r.unlocks),
    checkoutStarted: Number(r.checkout_started),
    paid: Number(r.paid),
  }));
}

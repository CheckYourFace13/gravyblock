/**
 * Reusable canary assertions. Generic — takes any businessId, house account or not. Used to
 * prove new capabilities against a business BEFORE stronger public claims appear, and to catch
 * regressions (stale promotion, unverified proof, guessed contacts) automatically.
 */
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { backlinkOpportunities, businesses, getDb, jobs, proofLedger } from "@/lib/db";
import { getBusinessTruth } from "@/lib/truth";
import { nextOpportunities } from "@/lib/opportunities/queue";

export type AssertionResult = { id: string; label: string; pass: boolean; detail: string };

const GUESSED_CONTACT_SOURCES = new Set(["guessed", "pattern_guess", "invented"]);

export async function runCanaryAssertions(businessId: string): Promise<AssertionResult[]> {
  const db = getDb();
  const out: AssertionResult[] = [];
  if (!db) return [{ id: "db", label: "Database reachable", pass: false, detail: "no_db" }];

  // 1. Business Truth is current (refreshed within the last 3 days for a paid business).
  const truth = await getBusinessTruth(businessId);
  const truthAgeOk = truth.lastWebsiteCrawlAt ? Date.now() - truth.lastWebsiteCrawlAt.getTime() < 3 * 86_400_000 : false;
  out.push({ id: "truth_current", label: "Business Truth current", pass: truthAgeOk || truth.sufficient === false, detail: truth.lastWebsiteCrawlAt ? `last crawl ${truth.lastWebsiteCrawlAt.toISOString()}` : "no website crawl yet" });

  // 2. No stale promotion: no current offer/event fact past its own expiry is marked current.
  const staleOffers = truth.facts.filter((f) => (f.key === "offer" || f.key === "event") && f.expiresAt && f.expiresAt.getTime() < Date.now());
  out.push({ id: "no_stale_promotion", label: "No stale promotion surfaced as current", pass: staleOffers.length === 0, detail: `${staleOffers.length} expired offer/event facts still marked current` });

  // 3. Opportunity ranking runs (at least one open, ranked opportunity exists OR none were ever found — both are honest states; failure is a crash).
  let queueOk = true;
  let queueDetail = "ok";
  try {
    const ranked = await nextOpportunities(businessId, 5);
    queueDetail = `${ranked.length} ranked opportunities`;
  } catch (err) {
    queueOk = false;
    queueDetail = err instanceof Error ? err.message : "error";
  }
  out.push({ id: "opportunity_ranking_runs", label: "Opportunity ranking runs without error", pass: queueOk, detail: queueDetail });

  // 4. Proof Ledger only records verified actions: every row has a metricBefore/After pair or
  // an afterEvidence payload proving external verification (never a bare claim).
  const proofRows = await db.select({ id: proofLedger.id, afterEvidence: proofLedger.afterEvidence }).from(proofLedger).where(eq(proofLedger.businessId, businessId));
  const unverified = proofRows.filter((r) => !r.afterEvidence);
  out.push({ id: "proof_only_verified", label: "Proof Ledger rows all carry external evidence", pass: unverified.length === 0, detail: `${unverified.length} of ${proofRows.length} rows missing afterEvidence` });

  // 5. No unsafe outreach: every contacted/followed_up/replied prospect has a relevance note and a real contact source.
  const contacted = await db.select({ id: backlinkOpportunities.id, relevanceNote: backlinkOpportunities.relevanceNote, contactSource: backlinkOpportunities.contactSource }).from(backlinkOpportunities).where(and(eq(backlinkOpportunities.businessId, businessId), inArray(backlinkOpportunities.status, ["contacted", "followed_up", "replied", "acquired"])));
  const unsafe = contacted.filter((c) => !c.relevanceNote || !c.contactSource || GUESSED_CONTACT_SOURCES.has(c.contactSource));
  out.push({ id: "no_unsafe_outreach", label: "No outreach sent without a relevance note and real contact source", pass: unsafe.length === 0, detail: `${unsafe.length} of ${contacted.length} contacted prospects missing relevance/contact evidence` });

  // 6. No guessed contacts anywhere in the pipeline.
  const guessed = await db.select({ id: backlinkOpportunities.id }).from(backlinkOpportunities).where(and(eq(backlinkOpportunities.businessId, businessId), inArray(backlinkOpportunities.contactSource, [...GUESSED_CONTACT_SOURCES])));
  out.push({ id: "no_guessed_contacts", label: "No guessed contact addresses", pass: guessed.length === 0, detail: `${guessed.length} rows with a guessed contact source` });

  // 7. No placeholder content ever published (content_held_quality catches thin content before publish; check nothing published still contains obvious placeholder markers).
  const placeholderJobs = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.businessId, businessId), eq(jobs.type, "content_publish_verified"), sql`${jobs.payload}->>'title' ilike '%lorem ipsum%' or ${jobs.payload}->>'title' ilike '%placeholder%'`));
  out.push({ id: "no_placeholder_content", label: "No placeholder content published", pass: placeholderJobs.length === 0, detail: `${placeholderJobs.length} published items with placeholder-looking titles` });

  // 8. Actions verify externally: no seo_basic_action row stuck "applied" for over 72h without resolving to verified/reverted.
  const stuck = await db.select({ id: jobs.id, createdAt: jobs.createdAt }).from(jobs).where(and(eq(jobs.businessId, businessId), eq(jobs.type, "seo_basic_action"), eq(jobs.status, "applied"), lt(jobs.createdAt, new Date(Date.now() - 72 * 3_600_000))));
  out.push({ id: "actions_verify_externally", label: "Applied site changes resolve to verified/reverted within 72h", pass: stuck.length === 0, detail: `${stuck.length} actions stuck unresolved past 72h` });

  return out;
}

/**
 * Runs the assertions against every house account (accountType = 'house' — a generic account
 * flag, not a name check) and logs any failure so a regression is visible before it reaches a
 * public claim. Any business could be pointed at this the same way; house accounts run it daily
 * because they are the continuous test fixtures per product policy.
 */
export async function runCanaryAssertionsBatch(): Promise<{ businesses: number; failures: number }> {
  const db = getDb();
  if (!db) return { businesses: 0, failures: 0 };
  const houses = await db.select({ id: businesses.id, name: businesses.name }).from(businesses).where(eq(businesses.accountType, "house")).limit(50);
  let failures = 0;
  for (const h of houses) {
    const results = await runCanaryAssertions(h.id);
    const failed = results.filter((r) => !r.pass);
    if (failed.length) failures += failed.length;
    await db.insert(jobs).values({ businessId: h.id, type: "canary_assertions_run", status: failed.length ? "failures" : "completed", payload: { results, failedCount: failed.length } });
  }
  return { businesses: houses.length, failures };
}

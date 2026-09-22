/**
 * Cross-engine opportunity scan for GBP, social and reviews — the three engines that still ran
 * on their own weekly cadence rather than through the universal queue. This records what each
 * would do into growthOpportunities (generic, capability-gated, ranked alongside every other
 * engine's work) so the queue can answer "what's the best next action" across ALL engines, not
 * just SEO/competitor/AEO/citations/authority. Execution itself still runs on its existing
 * schedule (runGbpPostBatch / planTruthGroundedSocial / runReviewRequestSendBatch) — this only
 * makes that work visible and comparably ranked; it does not yet gate whether those engines run.
 */
import { and, desc, eq } from "drizzle-orm";
import { businessConfigs, businesses, getDb, jobs } from "@/lib/db";
import { getCapabilityProfile } from "@/lib/capability-profile";
import { getBusinessTruth, promotableContent, currentOffers } from "@/lib/truth";
import { recordOpportunity } from "./queue";

const DAY = 86_400_000;

export async function scanCrossEngineOpportunities(businessId: string): Promise<{ recorded: number }> {
  const db = getDb();
  if (!db) return { recorded: 0 };
  let recorded = 0;
  const profile = await getCapabilityProfile(businessId);
  const truth = await getBusinessTruth(businessId);

  // GBP: a connected profile with no post in the last 14 days is a live opportunity.
  const [lastGbpPost] = await db.select({ createdAt: jobs.createdAt }).from(jobs).where(and(eq(jobs.businessId, businessId), eq(jobs.type, "gbp_post_published"))).orderBy(desc(jobs.createdAt)).limit(1);
  const gbpStale = !lastGbpPost || Date.now() - lastGbpPost.createdAt.getTime() > 14 * DAY;
  if (gbpStale && truth.sufficient) {
    const r = await recordOpportunity({
      businessId,
      opportunityType: "gbp",
      subtype: "no_recent_post",
      engine: "gbp_scan",
      valueClass: "growth",
      evidence: { lastPostAt: lastGbpPost?.createdAt.toISOString() ?? null },
      expectedImpact: 55,
      confidence: 60,
      cost: 1,
      risk: 1,
      requiredCapability: "gbp",
      autoEligible: true,
      ttlDays: 14,
      dedupeKey: `gbp_stale:${businessId}:${new Date().toISOString().slice(0, 10)}`,
    });
    if (r.recorded) recorded++;
  }

  // Social: same freshness idea, driven by whether there's an unposted verified fact (mirrors truth-social.ts's own selection).
  const [cfg] = await db.select({ facebookPageId: businessConfigs.facebookPageId }).from(businessConfigs).where(eq(businessConfigs.businessId, businessId)).limit(1);
  if (cfg?.facebookPageId) {
    const freshFacts = [...currentOffers(truth.facts), ...promotableContent(truth.facts)];
    if (freshFacts.length > 0) {
      const r = await recordOpportunity({
        businessId,
        opportunityType: "social",
        subtype: "unposted_verified_fact",
        engine: "social_scan",
        valueClass: "growth",
        evidence: { candidateCount: freshFacts.length, newest: freshFacts[0]?.value ?? null },
        expectedImpact: 40,
        confidence: 55,
        cost: 1,
        risk: 1,
        requiredCapability: "social",
        autoEligible: true,
        ttlDays: 14,
        dedupeKey: `social_fact:${businessId}:${freshFacts[0]?.value?.slice(0, 60) ?? "none"}`,
      });
      if (r.recorded) recorded++;
    }
  }

  // Reviews: transaction feed connected but review count is thin relative to how long it's been connected.
  if (profile.reputation.transactionSourceConnected) {
    const [biz] = await db.select({ reviewCount: businesses.reviewCount }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
    const [firstSend] = await db.select({ createdAt: jobs.createdAt }).from(jobs).where(and(eq(jobs.businessId, businessId), eq(jobs.type, "review_request_customer_sent"))).orderBy(jobs.createdAt).limit(1);
    const connectedDays = firstSend ? (Date.now() - firstSend.createdAt.getTime()) / DAY : 0;
    if (connectedDays > 21 && (biz?.reviewCount ?? 0) < 5) {
      const r = await recordOpportunity({
        businessId,
        opportunityType: "review",
        subtype: "low_review_volume",
        engine: "review_scan",
        valueClass: "growth",
        evidence: { reviewCount: biz?.reviewCount ?? 0, connectedDays: Math.round(connectedDays) },
        expectedImpact: 60,
        confidence: 55,
        cost: 1,
        risk: 1,
        requiredCapability: "reviews",
        autoEligible: true,
        ttlDays: 30,
        dedupeKey: `review_volume:${businessId}:${new Date().toISOString().slice(0, 7)}`,
      });
      if (r.recorded) recorded++;
    }
  }

  return { recorded };
}

export async function scanCrossEngineOpportunitiesBatch(limit = 15): Promise<{ businesses: number; recorded: number }> {
  const db = getDb();
  if (!db) return { businesses: 0, recorded: 0 };
  const rows = await db.select({ id: businesses.id }).from(businesses).limit(500);
  let n = 0;
  let recorded = 0;
  for (const b of rows) {
    if (n >= limit) break;
    n++;
    try {
      const r = await scanCrossEngineOpportunities(b.id);
      recorded += r.recorded;
    } catch (err) {
      console.error("[opportunity-scan] failed", { businessId: b.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { businesses: n, recorded };
}

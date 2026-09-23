/**
 * Cross-engine opportunity OBSERVATION for GBP, social and reviews: turns each engine's own
 * eligibility signal (a connected capability + real due work) into a ranked growthOpportunities
 * row. The orchestrator (orchestrator.ts) is what actually EXECUTES review/GBP/social work now —
 * it dispatches to postGbpForBusiness / planTruthGroundedSocial / runReviewRequestSendBatch only
 * when the queue ranks that channel's opportunity as the best eligible next action for that
 * business. The batch schedules for these three engines still exist as a broader safety-net
 * sweep across all businesses (see worker/index.ts) independent of per-business ranking.
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { businessConfigs, businesses, getDb, jobs, reviewRequests } from "@/lib/db";
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

  // Reviews: a transaction feed is the one-time connection every review opportunity needs.
  // With one connected, real pending/due requests are the direct AUTO_ELIGIBLE signal; low
  // review volume over time is a secondary, lower-confidence signal when nothing is pending.
  if (profile.reputation.transactionSourceConnected) {
    const now = new Date();
    const pending = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(reviewRequests)
      .where(and(eq(reviewRequests.businessId, businessId), eq(reviewRequests.status, "pending"), lte(reviewRequests.completedAt, new Date(now.getTime() - 3_600_000)), gte(reviewRequests.completedAt, new Date(now.getTime() - 30 * DAY))));
    const dueFollowUp = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(reviewRequests)
      .where(and(eq(reviewRequests.businessId, businessId), eq(reviewRequests.status, "sent"), lte(reviewRequests.sentAt, new Date(now.getTime() - 7 * DAY))));
    const ready = (pending[0]?.n ?? 0) + (dueFollowUp[0]?.n ?? 0);
    if (ready > 0) {
      const r = await recordOpportunity({
        businessId,
        opportunityType: "review",
        subtype: "pending_review_requests",
        engine: "review_scan",
        valueClass: "growth",
        evidence: { pending: pending[0]?.n ?? 0, dueFollowUp: dueFollowUp[0]?.n ?? 0 },
        expectedImpact: 55,
        confidence: 75,
        cost: 1,
        risk: 1,
        requiredCapability: "reviews",
        autoEligible: true,
        ttlDays: 3, // requests are time-sensitive (30-day completedAt window, 7-day follow-up window)
        dedupeKey: `review_pending:${businessId}:${now.toISOString().slice(0, 10)}`,
      });
      if (r.recorded) recorded++;
    } else {
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
          expectedImpact: 40,
          confidence: 40,
          cost: 1,
          risk: 1,
          requiredCapability: "reviews",
          autoEligible: false, // informational — nothing pending to actually send right now
          ttlDays: 30,
          dedupeKey: `review_volume:${businessId}:${new Date().toISOString().slice(0, 7)}`,
        });
        if (r.recorded) recorded++;
      }
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

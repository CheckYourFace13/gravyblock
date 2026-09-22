/**
 * Business maturity signals, derived from existing data only (no vertical hand-coding). A
 * business with almost no reviews should have review opportunities weighted up regardless of
 * category; a business with no acquired backlinks should have authority weighted up; a business
 * with thin published content should have content weighted up. This composes with (not
 * replaces) the operating-mode strategy weights in strategy.ts.
 */
import { and, eq, sql } from "drizzle-orm";
import { backlinkOpportunities, businesses, getDb, publishedContent } from "@/lib/db";
import type { OpportunityType } from "./types";

export type MaturitySignals = {
  reviewMaturity: "low" | "medium" | "high";
  authorityMaturity: "low" | "medium" | "high";
  contentMaturity: "low" | "medium" | "high";
};

export async function getMaturitySignals(businessId: string): Promise<MaturitySignals> {
  const db = getDb();
  if (!db) return { reviewMaturity: "low", authorityMaturity: "low", contentMaturity: "low" };
  const [[biz], [{ n: contentCount } = { n: 0 }], [{ n: acquiredCount } = { n: 0 }]] = await Promise.all([
    db.select({ reviewCount: businesses.reviewCount }).from(businesses).where(eq(businesses.id, businessId)).limit(1),
    db.select({ n: sql<number>`count(*)::int` }).from(publishedContent).where(and(eq(publishedContent.businessId, businessId), eq(publishedContent.status, "published"))),
    db.select({ n: sql<number>`count(*)::int` }).from(backlinkOpportunities).where(and(eq(backlinkOpportunities.businessId, businessId), eq(backlinkOpportunities.status, "acquired"))),
  ]);
  const reviews = biz?.reviewCount ?? 0;
  return {
    reviewMaturity: reviews < 5 ? "low" : reviews < 25 ? "medium" : "high",
    authorityMaturity: acquiredCount < 2 ? "low" : acquiredCount < 8 ? "medium" : "high",
    contentMaturity: contentCount < 5 ? "low" : contentCount < 20 ? "medium" : "high",
  };
}

const BOOST: Partial<Record<OpportunityType, keyof MaturitySignals>> = {
  review: "reviewMaturity",
  backlink: "authorityMaturity",
  content_gap: "contentMaturity",
};

const MATURITY_MULTIPLIER: Record<"low" | "medium" | "high", number> = { low: 1.4, medium: 1, high: 0.7 };

export function maturityMultiplier(signals: MaturitySignals, type: OpportunityType): number {
  const key = BOOST[type];
  if (!key) return 1;
  return MATURITY_MULTIPLIER[signals[key]];
}

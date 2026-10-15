/**
 * One rule for "does this account receive full GravyBlock capabilities".
 *
 *   account_type = 'house'  -> full capabilities, independent of Stripe, billing status and plan
 *   otherwise               -> the paid plan decides (any non-free tier)
 *
 * House accounts are still excluded from customer counts, MRR, conversion and customer lifecycle
 * email (see lib/reporting/classification.ts and the email batches); entitlement and revenue
 * classification are separate questions.
 */
import { eq, notInArray, or } from "drizzle-orm";
import { businesses } from "@/lib/db";
import { normalizePlanTierFromDb, type PlanTier } from "@/lib/plans";

export const HOUSE_PLAN_TIER: PlanTier = "agency";

/** SQL predicate: businesses that get the full engine set (house accounts or any paid tier). */
export const fullAccessWhere = () => or(eq(businesses.accountType, "house"), notInArray(businesses.planTier, ["free"]));

export function hasFullAccess(b: { planTier?: string | null; accountType?: string | null }): boolean {
  return b.accountType === "house" || normalizePlanTierFromDb(b.planTier) !== "free";
}

/** The tier to use for feature gating and quotas. House accounts get the top tier without any plan or billing change. */
export function effectivePlanTier(b: { planTier?: string | null; accountType?: string | null }): PlanTier {
  return b.accountType === "house" ? HOUSE_PLAN_TIER : normalizePlanTierFromDb(b.planTier);
}

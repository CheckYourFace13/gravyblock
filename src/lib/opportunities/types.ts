export type OpportunityType =
  | "existing_page_seo"
  | "content_gap"
  | "internal_link"
  | "schema"
  | "ctr"
  | "technical"
  | "gbp"
  | "review"
  | "citation"
  | "backlink"
  | "social"
  | "competitor_gap"
  | "aeo"
  | "conversion";

export type OpportunityStatus = "open" | "acting" | "acted" | "verified" | "no_gain" | "blocked_missing_capability" | "rejected" | "expired";

/** Reported eligibility — distinct from the persisted `status`, computed fresh against the business's current capability profile and cooldown/dedupe state. */
export type EligibilityLabel = "AUTO_ELIGIBLE" | "BLOCKED_ONE_TIME_CONNECTION" | "BLOCKED_MEASUREMENT" | "COOLDOWN" | "UNSUPPORTED" | "NOT_WORTH_ACTING" | "ACTING" | "MEASURING";

/** Capability keys as produced by CapabilityProfile.active. */
export type RequiredCapability = "website_write" | "gsc" | "gbp" | "social" | "reviews" | "authority_contact" | null;

/** hygiene: mechanical/checklist-level, no evidence of real impact. growth: evidence points at real search/visibility/business impact. */
export type ValueClass = "hygiene" | "growth";

export type MeasurementPlan = {
  metric: string;
  baselineWindow: string;
  baselineValue: number | null;
  actionAt: string;
  earliestEvaluationAt: string;
  evaluationWindowDays: number;
};

/**
 * THE canonical persisted measurement-result shape. This is the ONLY shape ever written to
 * growthOpportunities.measuredResult — resolveOpportunity()/resolveOpportunityByDedupeKey()
 * (opportunity lifecycle status) do not accept a measuredResult argument at all, and
 * recordMeasurement()/recordMeasurementByDedupeKey() (this module) are the only writers, so the
 * two formats that previously drifted apart cannot recur.
 */
export type CanonicalMeasurement = {
  /** The measurement plan's own metric name (mirrors measurementPlan.metric). */
  metric: string;
  /** Baseline value at action time (mirrors measurementPlan.baselineValue), or null if none was captured. */
  baselineValue: number | null;
  /** ISO timestamp the action was taken (mirrors measurementPlan.actionAt). */
  actionAt: string;
  /** ISO timestamp this evaluation ran. */
  evaluatedAt: string;
  /** The value actually compared against baseline (may equal baselineValue for a before/after pair, or be the "before" reading for TOO_EARLY). */
  beforeValue: number | null;
  /** The after value, or null if not yet available (TOO_EARLY/INCONCLUSIVE). */
  afterValue: number | null;
  status: "TOO_EARLY" | "POSITIVE" | "NEGATIVE" | "NO_MATERIAL_CHANGE" | "INCONCLUSIVE";
  /** Raw supporting data (API response fragments, URLs, counts) — whatever proves the values above. */
  evidence: Record<string, unknown>;
  /** Free-text caveat, e.g. "no later probe available yet" — optional. */
  limitations?: string | null;
};

export type OpportunityCandidate = {
  businessId: string;
  opportunityType: OpportunityType;
  subtype?: string | null;
  engine: string;
  evidence: Record<string, unknown>;
  valueClass?: ValueClass;
  expectedImpact: number; // 0-100
  confidence: number; // 0-100
  cost: number; // 1-10
  risk: number; // 1-10
  requiredCapability: RequiredCapability;
  autoEligible: boolean;
  ttlDays?: number;
  /** Stable identity so the same finding is never queued twice. */
  dedupeKey: string;
};

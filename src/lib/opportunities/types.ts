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

export type MeasuredResultStatus = "too_early" | "no_material_change" | "positive" | "negative" | "inconclusive";

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

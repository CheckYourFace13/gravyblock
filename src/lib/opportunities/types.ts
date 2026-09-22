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

/** Capability keys as produced by CapabilityProfile.active. */
export type RequiredCapability = "website_write" | "gsc" | "gbp" | "social" | "reviews" | "authority_contact" | null;

export type OpportunityCandidate = {
  businessId: string;
  opportunityType: OpportunityType;
  engine: string;
  evidence: Record<string, unknown>;
  expectedImpact: number; // 0-100
  confidence: number; // 0-100
  cost: number; // 1-10
  risk: number; // 1-10
  requiredCapability: RequiredCapability;
  autoEligible: boolean;
  /** Stable identity so the same finding is never queued twice. */
  dedupeKey: string;
};

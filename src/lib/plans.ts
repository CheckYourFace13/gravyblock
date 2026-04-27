export const PLAN_TIERS = ["free", "starter", "growth", "pro", "agency"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

/** Map legacy DB values (base, managed, entry) to current tiers. */
export function normalizePlanTierFromDb(value: string | null | undefined): PlanTier {
  const v = (value ?? "free").toLowerCase();
  if (v === "entry" || v === "base") return "starter";
  if (v === "managed") return "pro";
  if ((PLAN_TIERS as readonly string[]).includes(v)) return v as PlanTier;
  return "free";
}

export const stripePlanMapping: Record<PlanTier, { stripeLookupKey: string | null; stripePriceIdEnv: string | null }> = {
  free:    { stripeLookupKey: null,                          stripePriceIdEnv: null },
  starter: { stripeLookupKey: "gravyblock_starter_monthly",  stripePriceIdEnv: "STRIPE_PRICE_STARTER_MONTHLY" },
  growth:  { stripeLookupKey: "gravyblock_growth_monthly",   stripePriceIdEnv: "STRIPE_PRICE_GROWTH_MONTHLY" },
  pro:     { stripeLookupKey: "gravyblock_pro_monthly",      stripePriceIdEnv: "STRIPE_PRICE_PRO_MONTHLY" },
  agency:  { stripeLookupKey: "gravyblock_agency_monthly",   stripePriceIdEnv: "STRIPE_PRICE_AGENCY_MONTHLY" },
};

export type PlanFeatures = {
  label: "Free" | "Starter" | "Growth" | "Pro" | "Agency";
  monthlyPrice: number;
  introPrice: number;
  refreshCadenceLabel: "On-demand" | "Monthly" | "Weekly" | "Daily";
  refreshIntervalDays: number | null;
  recurringRefresh: boolean;
  workspaceHistory: boolean;
  monthlySummaryEmail: boolean;
  weeklyUpsellEmail: boolean;
  contentIdeasPerMonth: number;
  contentDraftsPerMonth: number;
  publishingJobsPerMonth: number;
  localPagesPerMonth: number;
  citationTasksPerMonth: number;
  reviewTasksPerMonth: number;
  backlinkOppsPerMonth: number;
  aiVisibilityChecks: boolean;
  redditPosting: boolean;
  blogOutreach: boolean;
  multiStepOutreach: boolean;
  reviewManagement: boolean;
  programmaticSEO: boolean;
  gbpSync: boolean;
  multiLocationReady: boolean;
  coldOutreachEngine: boolean;
  whiteLabel: boolean;
  clientSeats: number;
};

export function planFeatures(tier: PlanTier): PlanFeatures {
  switch (tier) {
    case "starter":
      return {
        label: "Starter",
        monthlyPrice: 79.99,
        introPrice: 39.99,
        refreshCadenceLabel: "Monthly",
        refreshIntervalDays: 30,
        recurringRefresh: true,
        workspaceHistory: true,
        monthlySummaryEmail: true,
        weeklyUpsellEmail: true,
        contentIdeasPerMonth: 4,
        contentDraftsPerMonth: 0,
        publishingJobsPerMonth: 0,
        localPagesPerMonth: 0,
        citationTasksPerMonth: 4,
        reviewTasksPerMonth: 2,
        backlinkOppsPerMonth: 0,
        aiVisibilityChecks: true,
        redditPosting: false,
        blogOutreach: false,
        multiStepOutreach: false,
        reviewManagement: true,
        programmaticSEO: false,
        gbpSync: false,
        multiLocationReady: false,
        coldOutreachEngine: false,
        whiteLabel: false,
        clientSeats: 1,
      };
    case "growth":
      return {
        label: "Growth",
        monthlyPrice: 149.99,
        introPrice: 74.99,
        refreshCadenceLabel: "Weekly",
        refreshIntervalDays: 7,
        recurringRefresh: true,
        workspaceHistory: true,
        monthlySummaryEmail: true,
        weeklyUpsellEmail: true,
        contentIdeasPerMonth: 12,
        contentDraftsPerMonth: 4,
        publishingJobsPerMonth: 4,
        localPagesPerMonth: 2,
        citationTasksPerMonth: 8,
        reviewTasksPerMonth: 8,
        backlinkOppsPerMonth: 8,
        aiVisibilityChecks: true,
        redditPosting: true,
        blogOutreach: true,
        multiStepOutreach: true,
        reviewManagement: true,
        programmaticSEO: false,
        gbpSync: false,
        multiLocationReady: true,
        coldOutreachEngine: false,
        whiteLabel: false,
        clientSeats: 1,
      };
    case "pro":
      return {
        label: "Pro",
        monthlyPrice: 299.99,
        introPrice: 149.99,
        refreshCadenceLabel: "Weekly",
        refreshIntervalDays: 7,
        recurringRefresh: true,
        workspaceHistory: true,
        monthlySummaryEmail: true,
        weeklyUpsellEmail: false,
        contentIdeasPerMonth: 24,
        contentDraftsPerMonth: 12,
        publishingJobsPerMonth: 12,
        localPagesPerMonth: 8,
        citationTasksPerMonth: 20,
        reviewTasksPerMonth: 20,
        backlinkOppsPerMonth: 20,
        aiVisibilityChecks: true,
        redditPosting: true,
        blogOutreach: true,
        multiStepOutreach: true,
        reviewManagement: true,
        programmaticSEO: true,
        gbpSync: true,
        multiLocationReady: true,
        coldOutreachEngine: false,
        whiteLabel: false,
        clientSeats: 3,
      };
    case "agency":
      return {
        label: "Agency",
        monthlyPrice: 499.99,
        introPrice: 249.99,
        refreshCadenceLabel: "Daily",
        refreshIntervalDays: 1,
        recurringRefresh: true,
        workspaceHistory: true,
        monthlySummaryEmail: true,
        weeklyUpsellEmail: false,
        contentIdeasPerMonth: 999,
        contentDraftsPerMonth: 999,
        publishingJobsPerMonth: 999,
        localPagesPerMonth: 999,
        citationTasksPerMonth: 999,
        reviewTasksPerMonth: 999,
        backlinkOppsPerMonth: 999,
        aiVisibilityChecks: true,
        redditPosting: true,
        blogOutreach: true,
        multiStepOutreach: true,
        reviewManagement: true,
        programmaticSEO: true,
        gbpSync: true,
        multiLocationReady: true,
        coldOutreachEngine: true,
        whiteLabel: true,
        clientSeats: 10,
      };
    default:
      return {
        label: "Free",
        monthlyPrice: 0,
        introPrice: 0,
        refreshCadenceLabel: "On-demand",
        refreshIntervalDays: null,
        recurringRefresh: false,
        workspaceHistory: true,
        monthlySummaryEmail: false,
        weeklyUpsellEmail: false,
        contentIdeasPerMonth: 0,
        contentDraftsPerMonth: 0,
        publishingJobsPerMonth: 0,
        localPagesPerMonth: 0,
        citationTasksPerMonth: 0,
        reviewTasksPerMonth: 0,
        backlinkOppsPerMonth: 0,
        aiVisibilityChecks: false,
        redditPosting: false,
        blogOutreach: false,
        multiStepOutreach: false,
        reviewManagement: false,
        programmaticSEO: false,
        gbpSync: false,
        multiLocationReady: false,
        coldOutreachEngine: false,
        whiteLabel: false,
        clientSeats: 1,
      };
  }
}

export function isPlanTier(value: string): value is PlanTier {
  return (PLAN_TIERS as readonly string[]).includes(value);
}

/** True if tier unlocks automated content publishing (Growth+). */
export function canPublishContent(tier: PlanTier): boolean {
  return tier === "growth" || tier === "pro" || tier === "agency";
}

/** True if tier unlocks Reddit + blog outreach (Growth+). */
export function canDoExternalOutreach(tier: PlanTier): boolean {
  return tier === "growth" || tier === "pro" || tier === "agency";
}

/** True if tier is a paid subscription. */
export function isPaid(tier: PlanTier): boolean {
  return tier !== "free";
}

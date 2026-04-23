export const PLAN_TIERS = ["free", "entry", "pro", "managed"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const stripePlanMapping = {
  free: { stripeLookupKey: null, stripePriceIdEnv: null },
  entry: { stripeLookupKey: "gravyblock_entry_monthly", stripePriceIdEnv: "STRIPE_PRICE_ENTRY_MONTHLY" },
  pro: { stripeLookupKey: "gravyblock_pro_monthly", stripePriceIdEnv: "STRIPE_PRICE_PRO_MONTHLY" },
  managed: { stripeLookupKey: "gravyblock_pro_monthly", stripePriceIdEnv: "STRIPE_PRICE_PRO_MONTHLY" },
} as const;

export type PlanFeatures = {
  label: "Free" | "Entry" | "Pro";
  monthlyPrice: number | 0;
  launchPrice: number | 0;
  refreshCadenceLabel: "On-demand" | "Monthly" | "Weekly";
  refreshIntervalDays: number | null;
  recurringRefresh: boolean;
  workspaceHistory: boolean;
  monthlySummaryEmail: boolean;
  monthlyContentIdeas: boolean;
  aiVisibilitySummary: boolean;
  contentQueue: boolean;
  publishingQueue: boolean;
  localPageQueue: boolean;
  citationQueue: boolean;
  reviewQueue: boolean;
  multiLocationReady: boolean;
  /** Owner-authenticated Google Business Profile API — not shipped; listing data uses public Places in scan. */
  gbpSync: boolean;
};

export function planFeatures(tier: PlanTier): PlanFeatures {
  switch (tier) {
    case "entry":
      return {
        label: "Entry",
        monthlyPrice: 29.99,
        launchPrice: 19.99,
        refreshCadenceLabel: "Monthly",
        refreshIntervalDays: 30,
        recurringRefresh: true,
        workspaceHistory: true,
        monthlySummaryEmail: true,
        monthlyContentIdeas: true,
        aiVisibilitySummary: true,
        contentQueue: false,
        publishingQueue: false,
        localPageQueue: false,
        citationQueue: true,
        reviewQueue: true,
        multiLocationReady: false,
        gbpSync: false,
      };
    case "managed":
    case "pro":
      return {
        label: "Pro",
        monthlyPrice: 59.99,
        launchPrice: 39.99,
        refreshCadenceLabel: "Weekly",
        refreshIntervalDays: 7,
        recurringRefresh: true,
        workspaceHistory: true,
        monthlySummaryEmail: true,
        monthlyContentIdeas: true,
        aiVisibilitySummary: true,
        contentQueue: true,
        publishingQueue: true,
        localPageQueue: true,
        citationQueue: true,
        reviewQueue: true,
        multiLocationReady: true,
        gbpSync: false,
      };
    default:
      return {
        label: "Free",
        monthlyPrice: 0,
        launchPrice: 0,
        refreshCadenceLabel: "On-demand",
        refreshIntervalDays: null,
        recurringRefresh: false,
        workspaceHistory: true,
        monthlySummaryEmail: false,
        monthlyContentIdeas: false,
        aiVisibilitySummary: false,
        contentQueue: false,
        publishingQueue: false,
        localPageQueue: false,
        citationQueue: false,
        reviewQueue: false,
        multiLocationReady: false,
        gbpSync: false,
      };
  }
}

export function isPlanTier(value: string): value is PlanTier {
  return (PLAN_TIERS as readonly string[]).includes(value);
}

export const PLAN_TIERS = ["free", "pro", "managed"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export type PlanFeatures = {
  recurringDashboard: boolean;
  scanHistoryTrends: boolean;
  contentIdeasQueue: boolean;
  automatedMonitoring: boolean;
  gbpSync: boolean;
  managedPlaybooks: boolean;
};

export function planFeatures(tier: PlanTier): PlanFeatures {
  switch (tier) {
    case "managed":
      return {
        recurringDashboard: true,
        scanHistoryTrends: true,
        contentIdeasQueue: true,
        automatedMonitoring: true,
        gbpSync: true,
        managedPlaybooks: true,
      };
    case "pro":
      return {
        recurringDashboard: true,
        scanHistoryTrends: true,
        contentIdeasQueue: true,
        automatedMonitoring: true,
        gbpSync: true,
        managedPlaybooks: false,
      };
    default:
      return {
        recurringDashboard: true,
        scanHistoryTrends: true,
        contentIdeasQueue: false,
        automatedMonitoring: false,
        gbpSync: false,
        managedPlaybooks: false,
      };
  }
}

export function isPlanTier(value: string): value is PlanTier {
  return (PLAN_TIERS as readonly string[]).includes(value);
}

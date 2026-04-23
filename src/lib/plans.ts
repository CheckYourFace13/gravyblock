export const PLAN_TIERS = ["free", "pro", "managed"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export type PlanFeatures = {
  recurringDashboard: boolean;
  scanHistoryTrends: boolean;
  contentIdeasQueue: boolean;
  /** Recurring snapshot jobs + synthetic AI visibility checks (see autopilot executor). */
  automatedMonitoring: boolean;
  /** Owner-authenticated Google Business Profile API — not shipped; listing data uses public Places in scan. */
  gbpSync: boolean;
  /** Reserved; no separate playbook product surface today. */
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
        gbpSync: false,
        managedPlaybooks: false,
      };
    case "pro":
      return {
        recurringDashboard: true,
        scanHistoryTrends: true,
        contentIdeasQueue: true,
        automatedMonitoring: true,
        gbpSync: false,
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

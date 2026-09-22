/**
 * Proof levels. LEVEL 1 (execution) never implies LEVEL 2 or 3 — the ledger and every
 * public surface must keep them visibly distinct.
 *   1 EXECUTION: an externally verified action was completed. No outcome claimed.
 *   2 SEARCH/VISIBILITY RESULT: a measured before/after in impressions, clicks, position,
 *     local-pack rank, or AI-mention rate.
 *   3 BUSINESS RESULT: a measured before/after in leads, calls, bookings, conversions or revenue.
 */
export type ProofLevel = 1 | 2 | 3;

const LEVEL3 = /\b(lead|call|booking|conversion|signup|revenue|sale|purchase|appointment)/i;
const LEVEL2 = /\b(impression|click|ctr|position|rank|visibility|mention|citation)/i;

export function classifyProofLevel(metricName: string | null | undefined, metricBefore: number | null | undefined, metricAfter: number | null | undefined): ProofLevel {
  if (metricBefore == null || metricAfter == null || !metricName) return 1;
  if (LEVEL3.test(metricName)) return 3;
  if (LEVEL2.test(metricName)) return 2;
  return 1;
}

export const PROOF_LEVEL_LABEL: Record<ProofLevel, string> = {
  1: "Execution — verified action completed",
  2: "Search/visibility result — measured movement",
  3: "Business result — measured lead/conversion movement",
};

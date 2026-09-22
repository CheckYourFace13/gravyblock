/**
 * Hygiene vs growth classification. Mechanical/checklist-level findings (a title a few
 * characters over the usual guideline, a missing canonical) are HYGIENE — low weight, so they
 * never crowd out real opportunity. Findings backed by actual evidence of search/visibility
 * impact (real impressions at a weak position, a page with real inbound demand and no CTA,
 * a verified competitor gap) are GROWTH — weighted up. This is generic: it looks at the
 * evidence any engine attaches, never at which business it belongs to.
 */
import type { ValueClass } from "./types";

export type ImpactEvidence = {
  /** Real Search Console/keyword demand signal available for this specific opportunity (impressions, position, etc.), if any. */
  hasSearchDemandEvidence?: boolean;
  /** Search position is in the "easy win" band (roughly 4-20) with real impressions. */
  isWeakPositionWithDemand?: boolean;
  /** The defect concerns indexability, canonical routing, or a broken conversion path — high downside if left alone. */
  isStructuralOrConversion?: boolean;
  /** Competitor/AEO evidence shows a real, verified gap (not just "shorter than average"). */
  isVerifiedCompetitiveGap?: boolean;
};

export function classifyValue(e: ImpactEvidence): ValueClass {
  if (e.isStructuralOrConversion || e.isWeakPositionWithDemand || e.isVerifiedCompetitiveGap || e.hasSearchDemandEvidence) return "growth";
  return "hygiene";
}

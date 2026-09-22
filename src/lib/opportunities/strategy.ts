/**
 * Marketing-strategy weights by operating mode. This is the ONE place that decides a local
 * HVAC company and a national SaaS company get different priorities — every engine and the
 * opportunity ranker read from here rather than hard-coding a strategy per business.
 */

import type { OperatingMode } from "@/lib/business-mode";
import type { OpportunityType } from "./types";

/** Relative weight (0-2, 1 = neutral) applied to an opportunity's expected impact for this mode. */
export const STRATEGY_WEIGHTS: Record<OperatingMode, Partial<Record<OpportunityType, number>>> = {
  local: {
    gbp: 1.6,
    review: 1.5,
    citation: 1.4,
    backlink: 1.1,
    existing_page_seo: 1.2,
    content_gap: 1.0,
    competitor_gap: 1.1,
    aeo: 0.9,
    social: 1.0,
    technical: 1.0,
    schema: 1.0,
    internal_link: 0.9,
    ctr: 1.0,
    conversion: 1.2,
  },
  regional: {
    gbp: 1.2,
    review: 1.2,
    citation: 1.1,
    backlink: 1.2,
    existing_page_seo: 1.2,
    content_gap: 1.1,
    competitor_gap: 1.2,
    aeo: 1.0,
    social: 1.0,
    technical: 1.0,
    schema: 1.0,
    internal_link: 1.0,
    ctr: 1.0,
    conversion: 1.1,
  },
  national: {
    gbp: 0.5,
    review: 0.7,
    citation: 0.5,
    backlink: 1.5,
    existing_page_seo: 1.3,
    content_gap: 1.4,
    competitor_gap: 1.4,
    aeo: 1.3,
    social: 1.0,
    technical: 1.1,
    schema: 1.1,
    internal_link: 1.1,
    ctr: 1.1,
    conversion: 1.2,
  },
  online: {
    gbp: 0.3,
    review: 0.6,
    citation: 0.4,
    backlink: 1.5,
    existing_page_seo: 1.3,
    content_gap: 1.4,
    competitor_gap: 1.3,
    aeo: 1.4,
    social: 1.2,
    technical: 1.1,
    schema: 1.1,
    internal_link: 1.1,
    ctr: 1.1,
    conversion: 1.3,
  },
};

export function strategyWeight(mode: OperatingMode, type: OpportunityType): number {
  return STRATEGY_WEIGHTS[mode]?.[type] ?? 1;
}

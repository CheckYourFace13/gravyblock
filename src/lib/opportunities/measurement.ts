/**
 * Generic measurement-plan builder and evaluator. An action's measurement plan is attached at
 * act-time and evaluated automatically by the worker when its window arrives — no client
 * monitoring, no manual "check back later." An opportunity type with no realistically
 * measurable causal metric (most technical fixes) gets no plan and stays Level-1 execution
 * proof, honestly, rather than a fabricated "measurement."
 */
import type { MeasurementPlan, MeasuredResultStatus } from "./types";
import type { OpportunityType } from "./types";

const DAY = 86_400_000;

/** Which opportunity types have a realistically measurable causal metric, and how to measure it. */
const PLAN_TEMPLATE: Partial<Record<OpportunityType, { metric: string; evaluationWindowDays: number }>> = {
  existing_page_seo: { metric: "gsc_impressions_clicks", evaluationWindowDays: 28 },
  ctr: { metric: "gsc_ctr", evaluationWindowDays: 28 },
  content_gap: { metric: "gsc_impressions_clicks", evaluationWindowDays: 28 },
  aeo: { metric: "ai_mention_rate", evaluationWindowDays: 30 },
  backlink: { metric: "referring_domain_live", evaluationWindowDays: 14 },
  competitor_gap: { metric: "gsc_impressions_clicks", evaluationWindowDays: 28 },
  gbp: { metric: "gbp_profile_activity", evaluationWindowDays: 21 },
  review: { metric: "review_count_rating", evaluationWindowDays: 21 },
};

export function buildMeasurementPlan(type: OpportunityType, baselineValue: number | null, baselineWindow: string): MeasurementPlan | null {
  const t = PLAN_TEMPLATE[type];
  if (!t) return null;
  const now = new Date();
  return {
    metric: t.metric,
    baselineWindow,
    baselineValue,
    actionAt: now.toISOString(),
    earliestEvaluationAt: new Date(now.getTime() + t.evaluationWindowDays * DAY).toISOString(),
    evaluationWindowDays: t.evaluationWindowDays,
  };
}

/** Compares before/after with a simple, honest threshold — never claims a result on noise. */
export function evaluateChange(before: number | null, after: number | null, minRelativeChange = 0.1, minAbsolute = 1): MeasuredResultStatus {
  if (before == null || after == null) return "inconclusive";
  if (before === 0) return after >= minAbsolute ? "positive" : "no_material_change";
  const rel = (after - before) / before;
  if (Math.abs(after - before) < minAbsolute) return "no_material_change";
  if (rel >= minRelativeChange) return "positive";
  if (rel <= -minRelativeChange) return "negative";
  return "no_material_change";
}

/**
 * Minimal marketing-outcome learning. Deterministic and statistical only — no LLM opinion, no
 * per-vertical hand-coding. Groups completed measurement results by (opportunityType,
 * businessMode) across ALL businesses (small samples per single business would be meaningless),
 * computes a bounded, explainable multiplier, and requires a minimum sample size before it
 * moves away from neutral. This is intentionally small: it nudges ranking, it does not decide it.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, growthOpportunities } from "@/lib/db";
import type { OpportunityType } from "./types";

const MIN_SAMPLE = 5;
const MAX_SWING = 0.3; // multiplier stays within [0.7, 1.3]

export type LearnedWeight = { multiplier: number; sampleSize: number; positiveRate: number | null; reason: string };

/** One row per (opportunityType, businessMode) with a large-enough sample of resolved measurements. */
export async function getLearnedWeights(): Promise<Map<string, LearnedWeight>> {
  const db = getDb();
  const map = new Map<string, LearnedWeight>();
  if (!db) return map;
  // Only rows with an actual measured outcome (not bare execution) count as evidence here —
  // "the action ran" is not "the tactic worked."
  const rows = await db
    .select({ type: growthOpportunities.opportunityType, mode: growthOpportunities.businessMode, result: sql<string>`${growthOpportunities.measuredResult}->>'status'`, n: sql<number>`count(*)::int` })
    .from(growthOpportunities)
    .where(and(sql`${growthOpportunities.measuredResult} is not null`, sql`${growthOpportunities.measuredResult}->>'status' is not null`, gte(growthOpportunities.createdAt, new Date(Date.now() - 180 * 86_400_000))))
    .groupBy(growthOpportunities.opportunityType, growthOpportunities.businessMode, sql`${growthOpportunities.measuredResult}->>'status'`);

  const byKey = new Map<string, { positive: number; negative: number; neutral: number }>();
  for (const r of rows) {
    const key = `${r.type}|${r.mode ?? "unknown"}`;
    const e = byKey.get(key) ?? { positive: 0, negative: 0, neutral: 0 };
    // Canonical status values are uppercase (see types.ts CanonicalMeasurement); any row that
    // doesn't match one of these three isn't a canonical measurement and is excluded — this is
    // also what keeps a legacy/ambiguous measuredResult shape from silently becoming evidence.
    if (r.result === "POSITIVE") e.positive += r.n;
    else if (r.result === "NEGATIVE") e.negative += r.n;
    else if (r.result === "NO_MATERIAL_CHANGE") e.neutral += r.n;
    // "TOO_EARLY" / "INCONCLUSIVE" are excluded from the sample — they are not evidence either way.
    byKey.set(key, e);
  }

  for (const [key, e] of byKey) {
    const sampleSize = e.positive + e.negative + e.neutral;
    if (sampleSize < MIN_SAMPLE) continue; // stays absent from the map -> caller treats as neutral (1x)
    const positiveRate = e.positive / sampleSize;
    // Centered on 0.5 (coin-flip baseline), scaled and clamped — gradual, not a cliff.
    const swing = Math.max(-MAX_SWING, Math.min(MAX_SWING, (positiveRate - 0.5) * (MAX_SWING / 0.5)));
    map.set(key, {
      multiplier: 1 + swing,
      sampleSize,
      positiveRate,
      reason: `${e.positive}/${sampleSize} positive (${Math.round(positiveRate * 100)}%) across ${sampleSize} measured ${key.split("|")[0]} actions in ${key.split("|")[1]} businesses over 180d`,
    });
  }
  return map;
}

export function learnedMultiplier(weights: Map<string, LearnedWeight>, type: OpportunityType, mode: string | null): number {
  return weights.get(`${type}|${mode ?? "unknown"}`)?.multiplier ?? 1;
}

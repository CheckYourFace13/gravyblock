/**
 * GravyBlock Visibility Score — v2.
 *
 * DEFINITION (this is the contract every input below must serve): the
 * Visibility Score estimates how discoverable and credible a business
 * currently appears across local search, its own website's search presence,
 * and supported AI discovery surfaces — based only on measurements
 * GravyBlock can actually observe today. It answers "is this business being
 * found," not "is this business's setup good" (that's Optimization Health,
 * see computeOptimizationHealthScore below) and not "how much work has
 * GravyBlock done for this business" (that's Automation Activity — plain
 * counters, never a score input, tracked wherever publishedContentCount /
 * outreachDraftsSent / auditsRun are already surfaced).
 *
 * Why this file exists: the score previously shipped (computeRealVisibilityScore
 * in src/lib/autopilot/executor.ts, and separately the content-count factor in
 * aeo-score.ts) mechanically added points for automation activity — e.g. every
 * additional published article added +2 to a "visibility" number regardless of
 * whether the article was ever indexed, seen, or cited. That conflated "we did
 * work" with "the business is more discoverable," which is not something
 * GravyBlock can claim without a measured effect (indexing, impressions,
 * clicks, ranking movement, AI citation). This module replaces both call
 * sites with ONE versioned formula whose only inputs are real, externally
 * observed signals.
 *
 * THREE-WAY SEPARATION (do not blend these):
 *   A. Visibility        — this file. Observed discoverability only.
 *   B. Optimization Health — computeOptimizationHealthScore below. Technical/
 *      entity/on-page readiness. A perfect score here means "well set up,"
 *      not "actually being found" — a brand-new business can max this out
 *      with zero search presence.
 *   C. Automation Activity — NOT a score. Plain counts (articles published,
 *      outreach drafts sent, audits run, issues resolved). Never feeds A or B.
 *
 * MISSING DATA: any component whose real input doesn't exist yet returns
 * `measured: false` and is excluded from the weighted average — never
 * defaulted to a fabricated midpoint. The composite discloses coverage
 * ("measured 2 of 4 components") rather than silently redistributing weight
 * to look more precise than the underlying data supports. If zero components
 * are measured, the composite score itself is `null` ("Not measured yet"),
 * never a guessed 50.
 */

export const SCORE_METHOD_VERSION = "visibility-v2";

/**
 * Method version for the INITIAL scan formula (src/lib/report/generator.ts's
 * buildSections/weightedScore — used by the public /scan flow, cold-outreach
 * prospect pre-scan, and paid-onboarding's first baseline scan). This is a
 * genuinely different, older formula from visibility-v2 above — a section-
 * averaged score over businessSnapshot/googlePresence/websiteConversionHealth/
 * searchVisibility/localRankingSignals/socialPresence, each built from real
 * rating/review/crawl/search-console/rank-estimate/social-discovery signals.
 * Verified clean of the activity-inflation pattern removed elsewhere this
 * session: none of those six sections reference published-content count or
 * any other automation-activity signal — inputs are all independently
 * observed. Tagging it explicitly (rather than leaving new rows untagged/
 * "legacy") means a same-formula trend comparison is still possible between
 * two baseline-v1 snapshots, while a baseline-v1-to-visibility-v2 comparison
 * correctly falls back to "Baseline established" rather than a fabricated
 * delta across two different formulas.
 */
export const BASELINE_SCORE_METHOD_VERSION = "baseline-v1";

export type ScoreComponent = {
  key: string;
  label: string;
  weight: number; // relative weight among MEASURED components only
  measured: boolean;
  points: number | null; // 0-100, null if not measured
  input: string; // human-readable description of what was actually observed
  whyItBelongs: string;
};

export type CompositeScoreResult = {
  score: number | null; // 0-100, null if nothing measured
  measuredCount: number;
  totalCount: number;
  coverageLabel: string; // e.g. "Measured 3 of 4 components"
  components: ScoreComponent[];
  methodVersion: string;
};

function weightedAverage(components: ScoreComponent[]): { score: number | null; measuredCount: number } {
  const measured = components.filter((c) => c.measured && c.points !== null);
  if (measured.length === 0) return { score: null, measuredCount: 0 };
  const totalWeight = measured.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight <= 0) return { score: null, measuredCount: 0 };
  const weightedSum = measured.reduce((sum, c) => sum + c.weight * (c.points ?? 0), 0);
  return { score: Math.round(weightedSum / totalWeight), measuredCount: measured.length };
}

function buildResult(components: ScoreComponent[]): CompositeScoreResult {
  const { score, measuredCount } = weightedAverage(components);
  return {
    score,
    measuredCount,
    totalCount: components.length,
    coverageLabel:
      measuredCount === components.length
        ? `Measured ${measuredCount} of ${components.length} components`
        : measuredCount === 0
          ? "Not measured yet — no real signals available"
          : `Measured ${measuredCount} of ${components.length} components (rest not yet available)`,
    components,
    methodVersion: SCORE_METHOD_VERSION,
  };
}

/**
 * Normalizes a Google rating/review-count pair with Bayesian shrinkage toward
 * a neutral prior, so a thin sample of perfect reviews cannot mechanically
 * outrank a large sample of slightly-lower ones.
 *
 * INPUT: Google Place `rating` (1-5) and `reviewCount`.
 * FORMULA: adjustedRating = (reviewCount*rating + PRIOR_WEIGHT*PRIOR_MEAN) /
 *   (reviewCount + PRIOR_WEIGHT); points = clamp01((adjustedRating-1)/4)*100.
 * NORMALIZATION: PRIOR_WEIGHT=25 acts as ~25 "phantom" average-rated reviews
 *   pulling small samples toward the prior mean (3.5/5) — verified against
 *   the two named pathological cases: 5.0★/4 reviews → adjusted ≈3.71 (modest
 *   credit, not full); 4.6★/2,000 reviews → adjusted ≈4.59 (near-full credit,
 *   and correctly outranks a thin 4.8★/10-review listing at ≈3.87).
 * MISSING-DATA RULE: rating === null → not measured.
 * RANGE: 0-100.
 * WHY IT BELONGS TO VISIBILITY: rating and review volume are exactly what
 *   Google itself surfaces next to this business in Maps/local search — a
 *   direct, real credibility-and-discoverability signal, not an internal
 *   readiness metric.
 */
export function normalizeRatingSignal(rating: number | null, reviewCount: number | null): { points: number | null; adjustedRating: number | null } {
  if (rating === null) return { points: null, adjustedRating: null };
  const PRIOR_MEAN = 3.5;
  const PRIOR_WEIGHT = 25;
  const n = Math.max(0, reviewCount ?? 0);
  const adjustedRating = (n * rating + PRIOR_WEIGHT * PRIOR_MEAN) / (n + PRIOR_WEIGHT);
  const points = Math.round(Math.min(100, Math.max(0, ((adjustedRating - 1) / 4) * 100)));
  return { points, adjustedRating: Math.round(adjustedRating * 100) / 100 };
}

export type VisibilityScoreInput = {
  placeRating: number | null;
  placeReviewCount: number | null;
  /** From search-console/rank-estimate pipeline (searchVisibility section) — 0-100 or null if never measured. */
  searchVisibilityPoints: number | null;
  searchVisibilitySource: "search_console_verified" | "estimated_rank" | null;
  /** From localRankingSignals / rankingChecks (map-pack position estimates) — 0-100 or null. */
  localRankingPoints: number | null;
  /** From getGeoAuditScore — real AI-mention-rate/confidence probe result, or null if zero probes ever run. */
  aiDiscoveryPoints: number | null;
  aiDiscoveryProbeCount: number;
};

/**
 * Composite Visibility Score. See file header for the full definition and
 * the three-way separation this depends on. Weights below only apply among
 * components that are actually measured for a given business — a business
 * with no AI probes yet is scored on the remaining real components, clearly
 * labeled as partial coverage, never backfilled with a guess.
 */
export function computeVisibilityScore(input: VisibilityScoreInput): CompositeScoreResult {
  const rating = normalizeRatingSignal(input.placeRating, input.placeReviewCount);

  const components: ScoreComponent[] = [
    {
      key: "local_search_presence",
      label: "Local search presence (rating & reviews)",
      weight: 30,
      measured: rating.points !== null,
      points: rating.points,
      input:
        input.placeRating !== null
          ? `${input.placeRating}★ from ${input.placeReviewCount ?? 0} Google reviews (Bayesian-adjusted to ${rating.adjustedRating}★)`
          : "No Google Place rating on file",
      whyItBelongs: "Rating and review volume are the credibility signal Google itself shows next to this business in Maps/local search.",
    },
    {
      key: "search_visibility",
      label: "Organic search visibility",
      weight: 25,
      measured: input.searchVisibilityPoints !== null,
      points: input.searchVisibilityPoints,
      input:
        input.searchVisibilityPoints === null
          ? "No Search Console connection or rank estimate available"
          : input.searchVisibilitySource === "search_console_verified"
            ? "Verified Google Search Console performance"
            : "Estimated from sampled local-intent query positions",
      whyItBelongs: "Directly measures whether the business's own website shows up in organic search results.",
    },
    {
      key: "local_ranking",
      label: "Local / map-pack ranking",
      weight: 20,
      measured: input.localRankingPoints !== null,
      points: input.localRankingPoints,
      input: input.localRankingPoints === null ? "No local ranking checks recorded" : "Modeled from repeated localized query sampling",
      whyItBelongs: "Map-pack position is literally whether the business appears when someone nearby searches for this service.",
    },
    {
      key: "ai_discovery",
      label: "AI discovery visibility (GEO)",
      weight: 25,
      measured: input.aiDiscoveryPoints !== null,
      points: input.aiDiscoveryPoints,
      input:
        input.aiDiscoveryProbeCount > 0
          ? `${input.aiDiscoveryProbeCount} real AI-assistant probes run`
          : "No AI visibility probes run yet",
      whyItBelongs: "Directly measures whether AI assistants (ChatGPT, Perplexity, etc.) surface this business when asked — a supported AI discovery surface, per the score's own definition.",
    },
  ];

  return buildResult(components);
}

export type OptimizationHealthInput = {
  /** 0-100 crawl-audit score (severity-weighted technical findings), or null if no crawl has ever completed. */
  websiteTechnicalPoints: number | null;
  /** 0-100 from computeAeoScore (technical/on-page AEO readiness — no content-volume factor). */
  aeoReadinessPoints: number | null;
  /** 0-100 from computeEntityScore (NAP/social/citation completeness). */
  entityCompletenessPoints: number | null;
};

/**
 * Optimization Health / Readiness Score — how well-prepared the business's
 * technical, on-page, and entity footprint is. Explicitly NOT a visibility
 * claim: a business can max this out with zero real search presence (see
 * pathological example "brand-new business, perfect website, zero search
 * presence" — Visibility stays low/Not-measured while this stays high).
 */
export function computeOptimizationHealthScore(input: OptimizationHealthInput): CompositeScoreResult {
  const components: ScoreComponent[] = [
    {
      key: "website_technical",
      label: "Website technical health",
      weight: 35,
      measured: input.websiteTechnicalPoints !== null,
      points: input.websiteTechnicalPoints,
      input: input.websiteTechnicalPoints === null ? "No site crawl completed yet" : "Severity-weighted site-crawl audit findings",
      whyItBelongs: "Technical cleanliness is a readiness signal, not a visibility one — absence of errors doesn't mean the business is actually being found.",
    },
    {
      key: "aeo_readiness",
      label: "On-page AEO readiness",
      weight: 30,
      measured: input.aeoReadinessPoints !== null,
      points: input.aeoReadinessPoints,
      input: input.aeoReadinessPoints === null ? "Not evaluated" : "Structured data, meta/title/H1, schema markup presence",
      whyItBelongs: "Measures how easy the site is for an AI assistant to parse — readiness for citation, not evidence of being cited yet.",
    },
    {
      key: "entity_completeness",
      label: "Entity completeness",
      weight: 35,
      measured: input.entityCompletenessPoints !== null,
      points: input.entityCompletenessPoints,
      input: input.entityCompletenessPoints === null ? "Not evaluated" : "NAP consistency, social profiles, citation coverage",
      whyItBelongs: "Directory/citation/social completeness is entity readiness, not broad visibility — being listed correctly isn't the same as being found.",
    },
  ];

  return buildResult(components);
}

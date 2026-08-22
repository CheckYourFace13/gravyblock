import type { WebsiteAuditSummary } from "@/lib/report/types";

export type AeoScoreResult = {
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  factors: { label: string; points: number; earned: boolean }[];
  topRecommendation: string;
};

export function getGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 45) return "C";
  if (score >= 25) return "D";
  return "F";
}

/**
 * AEO ("answer engine optimization") readiness — purely technical/on-page
 * signals that make a site easier for an AI assistant to parse and cite.
 * Deliberately excludes published-article COUNT: how many articles exist is
 * automation activity, not a measured readiness or visibility signal, and
 * mechanically rewarding volume here was the exact "activity feeds the score"
 * pattern flagged for removal — see computeVisibilityScore in
 * src/lib/scoring/visibility-score.ts for where real, measured content
 * effects (once GravyBlock can observe indexing/impressions/citations) will
 * belong instead. `hasSchemaMarkup` stays: it's a real boolean technical fact
 * (GravyBlock injects JSON-LD schema into every article it publishes), not a
 * volume count.
 */
export function computeAeoScore(input: {
  websiteAudit: WebsiteAuditSummary | null;
  hasSchemaMarkup: boolean;
  reviewCount: number;
}): AeoScoreResult {
  const { websiteAudit, hasSchemaMarkup, reviewCount } = input;

  const signals = websiteAudit?.signals ?? null;

  const hasStructuredData = signals?.hasStructuredData ?? false;
  const hasMetaDescription = signals?.hasMetaDescription ?? false;
  const hasTitle = signals?.hasTitle ?? false;
  const hasH1 = signals?.hasH1 ?? false;
  const hasReviews = reviewCount >= 10;

  const factors: { label: string; points: number; earned: boolean }[] = [
    { label: "Structured data on website", points: 30, earned: hasStructuredData },
    { label: "Schema markup via GravyBlock", points: 20, earned: hasSchemaMarkup },
    { label: "Meta description present", points: 15, earned: hasMetaDescription },
    { label: "Page title present", points: 10, earned: hasTitle },
    { label: "H1 heading present", points: 10, earned: hasH1 },
    { label: "10+ reviews (citeable proof)", points: 15, earned: hasReviews },
  ];

  let score = 0;
  for (const f of factors) {
    if (f.earned) score += f.points;
  }
  score = Math.min(100, Math.max(0, score));

  // Top recommendation: first unmet factor in priority order
  let topRecommendation: string;
  if (!hasStructuredData) {
    topRecommendation =
      "Add schema markup to your website so Google and AI tools can understand your business type and services.";
  } else if (!hasMetaDescription) {
    topRecommendation =
      "Add a descriptive meta description to your homepage so AI search tools can summarize your business accurately.";
  } else if (!hasReviews) {
    topRecommendation =
      "Build toward 10+ reviews — AI assistants weigh review volume as evidence a business is real and active.";
  } else {
    topRecommendation =
      "Your AEO technical signals are solid. Publishing content helps AI assistants find things to cite, but only measured pickup (citations, indexing) moves this further — not volume alone.";
  }

  return {
    score,
    grade: getGrade(score),
    factors,
    topRecommendation,
  };
}

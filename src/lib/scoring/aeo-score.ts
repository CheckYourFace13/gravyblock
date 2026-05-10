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

export function computeAeoScore(input: {
  websiteAudit: WebsiteAuditSummary | null;
  publishedContentCount: number;
  hasSchemaMarkup: boolean;
  reviewCount: number;
}): AeoScoreResult {
  const { websiteAudit, publishedContentCount, hasSchemaMarkup, reviewCount } = input;

  const signals = websiteAudit?.signals ?? null;

  const hasStructuredData = signals?.hasStructuredData ?? false;
  const hasMetaDescription = signals?.hasMetaDescription ?? false;
  const hasTitle = signals?.hasTitle ?? false;
  const hasH1 = signals?.hasH1 ?? false;

  // Content gets partial credit at >=1, full at >=3
  const hasContent1 = publishedContentCount >= 1;
  const hasContent3 = publishedContentCount >= 3;
  const hasReviews = reviewCount >= 10;

  const factors: { label: string; points: number; earned: boolean }[] = [
    { label: "Structured data on website", points: 25, earned: hasStructuredData },
    { label: "Schema markup via GravyBlock", points: 15, earned: hasSchemaMarkup },
    { label: "Meta description present", points: 15, earned: hasMetaDescription },
    { label: "Page title present", points: 10, earned: hasTitle },
    { label: "H1 heading present", points: 10, earned: hasH1 },
    // Content: 15 for >=3, 10 for >=1 (not stacked — pick highest)
    { label: "3+ articles published", points: 15, earned: hasContent3 },
    { label: "At least 1 article published", points: 10, earned: hasContent1 && !hasContent3 },
    { label: "10+ reviews (citeable proof)", points: 10, earned: hasReviews },
  ];

  // Score: sum earned points. For content, award the highest earned tier.
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
  } else if (!hasContent3) {
    topRecommendation =
      "Publish at least 3 articles so AI assistants have citeable content about your business.";
  } else {
    topRecommendation =
      "Your AEO signals are solid. Keep publishing content and collecting reviews to maintain high answer engine visibility.";
  }

  return {
    score,
    grade: getGrade(score),
    factors,
    topRecommendation,
  };
}

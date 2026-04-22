import { nanoid } from "nanoid";
import { runSiteCrawlAudit } from "@/lib/audit/site-crawl";
import { getGooglePlaceDetails } from "@/lib/integrations/google-places";
import { pullSearchConsoleMetrics } from "@/lib/integrations/google-search-console";
import { estimateLocalRankings } from "@/lib/ranking/local-rank-estimator";
import type { BusinessProfile, ReportFix, ReportIssue, ReportPayload, ReportSection, Vertical } from "@/lib/report/types";

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function opportunityFromScore(score: number): ReportPayload["opportunityLevel"] {
  if (score >= 78) return "low";
  if (score >= 60) return "medium";
  return "high";
}

function verdict(score: number) {
  if (score >= 82) return "Strong foundation — refine your conversion edge to capture even more local intent.";
  if (score >= 68) return "Good foundation — a few focused fixes can lift near-me conversion and repeat visibility.";
  if (score >= 50) return "Mixed visibility — improve profile trust + website clarity to stop leaking high-intent traffic.";
  return "High upside — core local discovery and conversion signals need immediate attention.";
}

export function createPublicId() {
  return nanoid(12);
}

function issuesToFixes(issues: ReportIssue[]): ReportFix[] {
  return issues.map((issue) => ({
    id: `fix-${issue.id}`,
    title: issue.title,
    detail: issue.detail,
    impact: issue.severity === "high" ? "high" : issue.severity === "medium" ? "medium" : "low",
  }));
}

function buildSections(input: {
  place: Awaited<ReturnType<typeof getGooglePlaceDetails>>;
  crawl: Awaited<ReturnType<typeof runSiteCrawlAudit>>;
  rankings: Awaited<ReturnType<typeof estimateLocalRankings>>;
  visibility: Awaited<ReturnType<typeof pullSearchConsoleMetrics>>;
}): ReportSection[] {
  const placeIssues: ReportIssue[] = [];
  if (!input.place.rating) {
    placeIssues.push({
      id: "place-rating-missing",
      title: "Google rating unavailable",
      detail: "Missing ratings reduce trust in map comparisons.",
      severity: "medium",
    });
  } else if (input.place.rating < 4.2) {
    placeIssues.push({
      id: "place-rating-low",
      title: "Google rating is below 4.2",
      detail: "Lower ratings can suppress click-through when nearby alternatives are stronger.",
      severity: "high",
    });
  }

  if ((input.place.reviewCount ?? 0) < 40) {
    placeIssues.push({
      id: "place-review-volume",
      title: "Review volume is lighter than local competitors",
      detail: "Steady review velocity is a strong local ranking and trust signal.",
      severity: "medium",
    });
  }

  const avgEstimatedRank = input.rankings.length
    ? input.rankings.reduce((sum, r) => sum + (r.estimatedPosition ?? 15), 0) / input.rankings.length
    : 15;

  const visibilityIssues: ReportIssue[] = [];
  if (input.visibility.verified) {
    const avgPos = input.visibility.aggregate?.averagePosition ?? 0;
    if (avgPos > 8) {
      visibilityIssues.push({
        id: "gsc-position",
        title: "Average organic position is beyond page one",
        detail: "Prioritize pages and queries where demand exists but rank depth is too low.",
        severity: "high",
      });
    }
  } else if (avgEstimatedRank > 6) {
    visibilityIssues.push({
      id: "estimated-rank-low",
      title: "Estimated local ranking is weak for tracked queries",
      detail: "Your venue appears inconsistently in top map and local intent results.",
      severity: "high",
    });
  }

  const crawlIssues: ReportIssue[] = input.crawl.findings.map((f) => ({
    id: `crawl-${f.key}`,
    title: f.title,
    detail: f.detail,
    severity: f.severity,
  }));

  const sections: ReportSection[] = [
    {
      key: "businessSnapshot",
      title: "Business Snapshot",
      score: clamp(70 + (input.place.rating ? 8 : -6) + Math.min(10, Math.floor((input.place.reviewCount ?? 0) / 40))),
      summary: "Identity confidence, profile completeness, and trust markers from Google Place data.",
      issues: placeIssues,
      fixes: issuesToFixes(placeIssues),
    },
    {
      key: "googlePresence",
      title: "Google Presence",
      score: clamp(68 + (input.place.rating ? 8 : 0) + ((input.place.reviewCount ?? 0) > 100 ? 8 : 0) - placeIssues.length * 6),
      summary: "How strong and credible the Google profile appears in local comparison moments.",
      issues: placeIssues,
      fixes: issuesToFixes(placeIssues),
    },
    {
      key: "websiteConversionHealth",
      title: "Website Conversion Health",
      score: input.crawl.score,
      summary: "On-site readiness for turning searchers into calls, reservations, and visits.",
      issues: crawlIssues,
      fixes: issuesToFixes(crawlIssues),
    },
    {
      key: "searchVisibility",
      title: "Search Visibility",
      score: clamp(
        input.visibility.verified
          ? 72 + (input.visibility.aggregate ? Math.max(-30, 12 - input.visibility.aggregate.averagePosition * 2) : -6)
          : 62 + Math.max(-25, 16 - avgEstimatedRank * 2),
      ),
      summary: input.visibility.verified
        ? "Verified Google Search Console performance metrics."
        : "Estimated visibility model based on tracked local intent queries.",
      issues: visibilityIssues,
      fixes: issuesToFixes(visibilityIssues),
    },
    {
      key: "localRankingSignals",
      title: "Local Ranking Signals",
      score: clamp(64 + Math.max(-30, 14 - avgEstimatedRank * 2)),
      summary: "Estimated map/local pack presence across tracked local-intent queries.",
      issues: visibilityIssues,
      fixes: issuesToFixes(visibilityIssues),
    },
  ];

  return sections;
}

export async function generateReportFromPlace(input: {
  placeId: string;
  vertical: Vertical;
  query: string;
  locationHint: string;
  searchConsolePropertyUrl?: string;
  candidateConfidence?: number;
}) {
  const place = await getGooglePlaceDetails(input.placeId);
  const profile: BusinessProfile = {
    name: place.displayName,
    vertical: input.vertical,
    placeId: place.placeId,
    address: place.formattedAddress,
    website: place.website,
    phone: place.phone,
    rating: place.rating?.toString(),
    reviewCount: place.reviewCount?.toString(),
    googleMapsUri: place.mapsUri,
    primaryCategory: place.primaryCategory,
    types: place.types,
    latitude: place.latitude,
    longitude: place.longitude,
    businessStatus: place.businessStatus,
    openNow: place.openNow,
  };

  const [crawl, searchVisibility, rankings] = await Promise.all([
    runSiteCrawlAudit(place.website),
    pullSearchConsoleMetrics({ propertyUrl: input.searchConsolePropertyUrl, days: 28 }),
    estimateLocalRankings({
      placeId: place.placeId,
      businessName: place.displayName,
      vertical: input.vertical,
      cityHint: input.locationHint,
    }),
  ]);

  const sections = buildSections({
    place,
    crawl,
    rankings,
    visibility: searchVisibility,
  });
  const weightedScore =
    sections.reduce((sum, s) => sum + s.score, 0) / (sections.length || 1);
  const score = clamp(weightedScore);

  const fixes = sections
    .flatMap((s) => s.fixes)
    .sort((a, b) => (a.impact === "high" ? 3 : a.impact === "medium" ? 2 : 1) - (b.impact === "high" ? 3 : b.impact === "medium" ? 2 : 1))
    .reverse()
    .slice(0, 8);

  const payload: ReportPayload = {
    brand: "GravyBlock",
    generatedAt: new Date().toISOString(),
    summary: {
      title: `${place.displayName} — local growth scan`,
      score,
      verdict: verdict(score),
    },
    business: {
      placeId: place.placeId,
      name: place.displayName,
      address: place.formattedAddress,
      website: place.website,
      phone: place.phone,
      rating: place.rating?.toString(),
      reviewCount: place.reviewCount,
      googleMapsUri: place.mapsUri,
      primaryCategory: place.primaryCategory,
      types: place.types,
      latitude: place.latitude,
      longitude: place.longitude,
      businessStatus: place.businessStatus,
      openNow: place.openNow,
    },
    sourceAttribution: [
      {
        source: "google_places",
        mode: "verified",
        used: true,
        note: "Business identity and profile snapshot from Google Places Text Search + Place Details.",
      },
      {
        source: "google_business_profile",
        mode: "verified",
        used: false,
        note: "Available only for owner-authorized enrichment flows.",
      },
      {
        source: "google_search_console",
        mode: "verified",
        used: searchVisibility.verified,
        note: searchVisibility.note,
      },
      {
        source: "site_crawl",
        mode: "verified",
        used: true,
        note: "Direct homepage fetch + parse for conversion and technical signals.",
      },
      {
        source: "estimated_local_rank",
        mode: "estimated",
        used: rankings.length > 0,
        note: "Tracked query set modeled via repeated localized Places searches.",
      },
    ],
    googlePresence: {
      confidence: input.candidateConfidence ?? 80,
      placeId: place.placeId,
      displayName: place.displayName,
      address: place.formattedAddress,
      category: place.primaryCategory,
      mapsUri: place.mapsUri,
      rating: place.rating,
      reviewCount: place.reviewCount,
      businessStatus: place.businessStatus,
      openNow: place.openNow,
      coordinates:
        place.latitude !== undefined && place.longitude !== undefined
          ? { lat: place.latitude, lng: place.longitude }
          : undefined,
    },
    websiteConversionHealth: crawl,
    searchVisibility,
    localRankingSignals: {
      checks: rankings,
      note:
        "Estimated local ranking uses tracked local-intent queries and should be treated as monitored directional data, not an official Google rank number.",
    },
    sections,
    prioritizedFixes: fixes,
    opportunityLevel: opportunityFromScore(score),
  };

  return {
    profile,
    payload,
    rankings,
    crawlFindings: crawl.findings,
    competitorSnapshots: rankings.flatMap((check) =>
      check.competitors.map((c) => ({
        query: check.query,
        competitorName: c.name,
        competitorPlaceId: c.placeId,
        rating: c.rating?.toString(),
        reviewCount: c.reviewCount,
        estimatedPosition: c.position,
      })),
    ),
  };
}

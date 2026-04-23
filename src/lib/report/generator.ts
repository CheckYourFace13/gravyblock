import { nanoid } from "nanoid";
import { runSiteCrawlAudit } from "@/lib/audit/site-crawl";
import { getGooglePlaceDetails } from "@/lib/integrations/google-places";
import { pullSearchConsoleMetrics } from "@/lib/integrations/google-search-console";
import { estimateLocalRankings } from "@/lib/ranking/local-rank-estimator";
import { buildSocialPresence } from "@/lib/social/discover";
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
  if (score >= 82) return "Strong foundation — tighten conversion paths so high-intent local traffic does not leak.";
  if (score >= 68) return "Solid base — a focused pass on visibility, trust, and site clarity usually unlocks the next tier.";
  if (score >= 50) return "Mixed signals — discovery and on-site clarity need alignment before spend on ads or content scales.";
  return "High upside — core local discovery, trust, and conversion cues need attention first.";
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

function dedupeFixesByTitle(fixes: ReportFix[]): ReportFix[] {
  const seen = new Set<string>();
  const out: ReportFix[] = [];
  for (const f of fixes) {
    const k = f.title.trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

function buildSections(input: {
  place: Awaited<ReturnType<typeof getGooglePlaceDetails>>;
  crawl: Awaited<ReturnType<typeof runSiteCrawlAudit>>["audit"];
  rankings: Awaited<ReturnType<typeof estimateLocalRankings>>;
  visibility: Awaited<ReturnType<typeof pullSearchConsoleMetrics>>;
  social: ReturnType<typeof buildSocialPresence>;
}): ReportSection[] {
  const placeIdentityIssues: ReportIssue[] = [];
  if (!input.place.rating) {
    placeIdentityIssues.push({
      id: "place-rating-missing",
      title: "Google rating not shown on listing",
      detail: "Listings without visible ratings can look newer or less battle-tested next to alternatives.",
      severity: "medium",
    });
  } else if (input.place.rating < 4.2) {
    placeIdentityIssues.push({
      id: "place-rating-low",
      title: "Google rating is below 4.2",
      detail: "In side-by-side comparisons, higher-rated neighbors often win the click.",
      severity: "high",
    });
  }

  if ((input.place.reviewCount ?? 0) < 40) {
    placeIdentityIssues.push({
      id: "place-review-volume",
      title: "Review volume is lighter than strong local peers",
      detail: "Steady, recent reviews reinforce trust for both people and ranking systems.",
      severity: "medium",
    });
  }

  const googleSurfaceIssues: ReportIssue[] = [];
  if (!input.place.types?.length || input.place.types.length < 2) {
    googleSurfaceIssues.push({
      id: "gp-types-thin",
      title: "Google categories look minimal",
      detail: "Richer primary/secondary categories help Google map you to the right intents.",
      severity: "low",
    });
  }

  const avgEstimatedRank = input.rankings.length
    ? input.rankings.reduce((sum, r) => sum + (r.estimatedPosition ?? 15), 0) / input.rankings.length
    : 15;

  const gscOnlyIssues: ReportIssue[] = [];
  if (input.visibility.verified) {
    const avgPos = input.visibility.aggregate?.averagePosition ?? 0;
    if (avgPos > 8) {
      gscOnlyIssues.push({
        id: "gsc-position",
        title: "Average organic position is beyond page one",
        detail: "Prioritize pages and queries where demand exists but rank depth is too low.",
        severity: "high",
      });
    }
  }

  let canonicalEstimatedVisibilityIssue: ReportIssue | null = null;
  if (!input.visibility.verified && avgEstimatedRank > 6) {
    canonicalEstimatedVisibilityIssue = {
      id: "canonical-estimated-local-visibility",
      title: "Estimated map & local-query visibility is soft",
      detail:
        "Across sampled local-intent queries your listing is not consistently near the top of map-style results. This is modeled directional data — improve relevance, reviews, website/NAP clarity, and categories rather than chasing a single vanity number.",
      severity: "high",
    };
  }

  const searchVisibilityIssues: ReportIssue[] = [...gscOnlyIssues];
  if (canonicalEstimatedVisibilityIssue) searchVisibilityIssues.push(canonicalEstimatedVisibilityIssue);

  const localRankingIssues: ReportIssue[] = [];
  if (canonicalEstimatedVisibilityIssue) {
    localRankingIssues.push({
      id: "lr-cross-ref-estimated-visibility",
      title: "Per-query checks (same estimation model)",
      detail:
        "These rows expand the same estimated visibility story as Search Visibility — one issue, multiple queries. Use them for prioritization, not as duplicate problems.",
      severity: "low",
    });
  }

  const crawlIssues: ReportIssue[] = input.crawl.findings.map((f) => ({
    id: `crawl-${f.key}`,
    title: f.title,
    detail: f.detail,
    severity: f.severity,
  }));

  const socialIssues: ReportIssue[] = [];
  const distinctPlatforms = new Set(input.social.profiles.map((p) => p.platform)).size;
  if (input.social.profiles.length === 0) {
    socialIssues.push({
      id: "social-none-found",
      title: "No major social URLs detected on the fetched homepage",
      detail:
        "We only scan public homepage HTML. Profiles may exist but are linked from interior pages or different domains.",
      severity: "medium",
    });
  } else if (distinctPlatforms < 2) {
    socialIssues.push({
      id: "social-single-channel",
      title: "Social footprint looks narrow",
      detail:
        "Multiple consistent channels usually reinforce trust for comparison shoppers. Expand where your customers already spend time.",
      severity: "medium",
    });
  }

  return [
    {
      key: "businessSnapshot",
      title: "Business snapshot",
      score: clamp(70 + (input.place.rating ? 8 : -6) + Math.min(10, Math.floor((input.place.reviewCount ?? 0) / 40))),
      summary: "Identity, ratings, and review signals from the live Google listing.",
      issues: placeIdentityIssues,
      fixes: issuesToFixes(placeIdentityIssues),
    },
    {
      key: "googlePresence",
      title: "Google presence",
      score: clamp(68 + (input.place.rating ? 8 : 0) + ((input.place.reviewCount ?? 0) > 100 ? 8 : 0) - googleSurfaceIssues.length * 4),
      summary: "How complete and credible the public Google listing appears.",
      issues: googleSurfaceIssues,
      fixes: issuesToFixes(googleSurfaceIssues),
    },
    {
      key: "websiteConversionHealth",
      title: "Website conversion health",
      score: input.crawl.score,
      summary: "Homepage signals for turning search traffic into calls, visits, or booked work.",
      issues: crawlIssues,
      fixes: issuesToFixes(crawlIssues),
    },
    {
      key: "searchVisibility",
      title: "Search visibility",
      score: clamp(
        input.visibility.verified
          ? 72 + (input.visibility.aggregate ? Math.max(-30, 12 - input.visibility.aggregate.averagePosition * 2) : -6)
          : 62 + Math.max(-25, 16 - avgEstimatedRank * 2),
      ),
      summary: input.visibility.verified
        ? "Verified Search Console performance where connected."
        : "Estimated visibility from sampled local-intent queries (no owner Search Console token in this scan).",
      issues: searchVisibilityIssues,
      fixes: issuesToFixes(searchVisibilityIssues),
    },
    {
      key: "localRankingSignals",
      title: "Local ranking signals",
      score: clamp(64 + Math.max(-30, 14 - avgEstimatedRank * 2)),
      summary: "Per-query map-style estimates — read together with Search visibility above.",
      issues: localRankingIssues,
      fixes: issuesToFixes(localRankingIssues),
    },
    {
      key: "socialPresence",
      title: "Social presence",
      score: clamp(input.social.score),
      summary:
        "Publicly observable social URLs from your homepage HTML and structured data — not private engagement metrics.",
      issues: socialIssues,
      fixes: issuesToFixes(socialIssues),
    },
  ];
}

export async function generateReportFromPlace(input: {
  placeId: string;
  vertical: Vertical;
  query: string;
  locationHint: string;
  /** Reserved for authenticated / admin flows; public scan does not pass this. */
  searchConsolePropertyUrl?: string;
  candidateConfidence?: number;
}) {
  const place = await getGooglePlaceDetails(input.placeId);

  const [crawlBundle, searchVisibility, rankings] = await Promise.all([
    runSiteCrawlAudit(place.website),
    pullSearchConsoleMetrics({ propertyUrl: input.searchConsolePropertyUrl, days: 28 }),
    estimateLocalRankings({
      placeId: place.placeId,
      businessName: place.displayName,
      vertical: input.vertical,
      cityHint: input.locationHint,
    }),
  ]);

  const crawl = crawlBundle.audit;
  let resolvedWebsite = place.website;
  if (!resolvedWebsite?.trim() && crawlBundle.homepage?.finalUrl) {
    try {
      const u = new URL(crawlBundle.homepage.finalUrl);
      resolvedWebsite = `${u.protocol}//${u.host}`;
    } catch {
      resolvedWebsite = place.website;
    }
  }

  const socialPresence = buildSocialPresence({
    primaryWebsite: resolvedWebsite,
    html: crawlBundle.homepage?.html,
    finalUrl: crawlBundle.homepage?.finalUrl,
    fetchNotes: crawlBundle.homepage ? undefined : crawl.findings.find((f) => f.key === "crawl-error" || f.key === "crawl-no-website")?.detail,
  });

  const profile: BusinessProfile = {
    name: place.displayName,
    vertical: input.vertical,
    placeId: place.placeId,
    address: place.formattedAddress,
    website: resolvedWebsite,
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

  const sections = buildSections({
    place,
    crawl,
    rankings,
    visibility: searchVisibility,
    social: socialPresence,
  });
  const weightedScore = sections.reduce((sum, s) => sum + s.score, 0) / (sections.length || 1);
  const score = clamp(weightedScore);

  const rawFixes = sections
    .flatMap((s) => s.fixes)
    .sort(
      (a, b) =>
        (a.impact === "high" ? 3 : a.impact === "medium" ? 2 : 1) - (b.impact === "high" ? 3 : b.impact === "medium" ? 2 : 1),
    )
    .reverse();
  const fixes = dedupeFixesByTitle(rawFixes).slice(0, 8);

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
      website: resolvedWebsite,
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
        note: "Business identity and listing snapshot from Google Places (details).",
      },
      {
        source: "google_business_profile",
        mode: "verified",
        used: false,
        note: "Owner-authorized Business Profile APIs are reserved for future authenticated enrichment.",
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
        used: Boolean(crawlBundle.homepage),
        note: "Single homepage fetch for conversion/technical checks (and social link discovery).",
      },
      {
        source: "estimated_local_rank",
        mode: "estimated",
        used: rankings.length > 0,
        note: "Local-intent query set modeled via localized Places sampling — directional, not an official rank.",
      },
      {
        source: "social_public_discovery",
        mode: "estimated",
        used: socialPresence.profiles.length > 0,
        note: socialPresence.methodology,
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
      note: "Estimated positions from repeated localized sampling. Treat as monitoring direction, not a guaranteed Google rank.",
    },
    socialPresence,
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

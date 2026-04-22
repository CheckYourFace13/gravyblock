import { randomUUID } from "node:crypto";
import { brands, getDb, locations, organizations } from "@/lib/db";
import { recordScanRun } from "@/lib/report/repository";
import type { ReportPayload, Vertical } from "@/lib/report/types";

function samplePayload(input: { name: string; website: string; city: string; placeId: string }): ReportPayload {
  const generatedAt = new Date().toISOString();
  return {
    brand: "GravyBlock",
    generatedAt,
    summary: {
      title: `${input.name} local growth baseline`,
      score: 68,
      verdict: `Baseline scan for ${input.name} in ${input.city}.`,
    },
    business: {
      name: input.name,
      placeId: input.placeId,
      address: `${input.city}`,
      website: input.website,
      phone: "(555) 010-2000",
      rating: "4.4",
      reviewCount: 132,
      googleMapsUri: `https://maps.google.com/?q=${encodeURIComponent(input.name)}`,
      primaryCategory: "Business",
      types: ["point_of_interest"],
      latitude: 39.7392,
      longitude: -104.9903,
      businessStatus: "OPERATIONAL",
      openNow: true,
    },
    sourceAttribution: [
      { source: "google_places", mode: "verified", used: true, note: "Public place profile lookup." },
      { source: "site_crawl", mode: "verified", used: true, note: "Homepage crawl findings." },
      { source: "google_search_console", mode: "verified", used: false, note: "No property token linked in this seed." },
      { source: "estimated_local_rank", mode: "estimated", used: true, note: "Directional local-intent estimate." },
      { source: "google_business_profile", mode: "estimated", used: false, note: "Owner-auth flow not connected." },
    ],
    googlePresence: {
      confidence: 90,
      placeId: input.placeId,
      displayName: input.name,
      address: input.city,
      category: "Business",
      mapsUri: `https://maps.google.com/?q=${encodeURIComponent(input.name)}`,
      rating: 4.4,
      reviewCount: 132,
      businessStatus: "OPERATIONAL",
      openNow: true,
      coordinates: { lat: 39.7392, lng: -104.9903 },
    },
    websiteConversionHealth: {
      score: 66,
      findings: [
        {
          key: "cta-clarity",
          title: "Primary CTA can be clearer",
          detail: "Strengthen buying intent path for local visitors.",
          severity: "medium",
          source: "site_crawl",
          estimated: false,
        },
      ],
      signals: {
        finalUrl: input.website,
        statusCode: 200,
        hasTitle: true,
        hasMetaDescription: true,
        hasH1: true,
        hasViewport: true,
        hasStructuredData: false,
        hasClickToCall: false,
        locationClarity: true,
        hoursClarity: false,
        ctaClarity: true,
        speedHook: "not_tested",
      },
    },
    searchVisibility: {
      verified: false,
      propertyUrl: undefined,
      topQueries: [],
      topPages: [],
      note: "Search Console not connected in seed mode.",
    },
    localRankingSignals: {
      checks: [
        {
          query: `${input.name} near me`,
          estimatedPosition: 4,
          inTop3: false,
          inMapPack: false,
          confidence: 72,
          source: "estimated_local_rank",
          competitors: [],
        },
      ],
      note: "Estimated local-intent baseline.",
    },
    sections: [
      {
        key: "visibility",
        title: "Visibility",
        score: 69,
        summary: "Local visibility is present but can improve.",
        issues: [],
        fixes: [{ id: "fix-vis", title: "Expand location signals", detail: "Add stronger locality coverage.", impact: "high" }],
      },
      {
        key: "conversion",
        title: "Conversion",
        score: 67,
        summary: "Conversion paths are functional but not optimized.",
        issues: [],
        fixes: [{ id: "fix-conv", title: "Tighten CTA path", detail: "Clarify offer and reduce friction.", impact: "medium" }],
      },
    ],
    prioritizedFixes: [
      { id: "p1", title: "Launch local trust page", detail: "Create a geo-relevant trust and proof page.", impact: "high" },
      { id: "p2", title: "Publish intent content", detail: "Ship a weekly local-intent content cadence.", impact: "medium" },
    ],
    opportunityLevel: "medium",
  };
}

export async function POST() {
  const db = getDb();
  if (!db) {
    return Response.json({ error: "DATABASE_URL is required" }, { status: 500 });
  }

  const organizationId = randomUUID();
  const brandId = randomUUID();
  const locA = randomUUID();
  const locB = randomUUID();

  await db.insert(organizations).values({
    id: organizationId,
    name: "Demo Growth Group",
    accountType: "multi_location",
    planTier: "pro",
  });

  await db.insert(brands).values({
    id: brandId,
    organizationId,
    name: "NorthStar Home Services",
    website: "https://northstar.example",
    websiteNormalized: "northstar.example",
    businessModel: "multi_location",
  });

  await db.insert(locations).values([
    {
      id: locA,
      organizationId,
      brandId,
      name: "NorthStar Denver",
      locationType: "service_area",
      city: "Denver",
      stateRegion: "CO",
      country: "US",
      website: "https://northstar.example/denver",
      websitePath: "/denver",
      placeId: "demo-place-denver",
    },
    {
      id: locB,
      organizationId,
      brandId,
      name: "NorthStar Austin",
      locationType: "service_area",
      city: "Austin",
      stateRegion: "TX",
      country: "US",
      website: "https://northstar.example/austin",
      websitePath: "/austin",
      placeId: "demo-place-austin",
    },
  ]);

  const seedVertical: Vertical = "home_services";
  const reportA = randomUUID().slice(0, 12);
  const reportB = randomUUID().slice(0, 12);

  const runA = await recordScanRun({
    publicId: reportA,
    query: "NorthStar Denver",
    locationHint: "Denver CO",
    selectedPlaceId: "demo-place-denver",
    candidateConfidence: 92,
    organizationId,
    brandId,
    locationId: locA,
    businessModel: "multi_location",
    profile: {
      name: "NorthStar Denver",
      vertical: seedVertical,
      placeId: "demo-place-denver",
      address: "Denver, CO",
      website: "https://northstar.example/denver",
      phone: "(555) 010-1001",
      rating: "4.5",
      reviewCount: "150",
      googleMapsUri: "https://maps.google.com/?q=NorthStar+Denver",
      primaryCategory: "Home services",
      types: ["home_services"],
      latitude: 39.7392,
      longitude: -104.9903,
      businessStatus: "OPERATIONAL",
      openNow: true,
    },
    payload: samplePayload({
      name: "NorthStar Denver",
      website: "https://northstar.example/denver",
      city: "Denver, CO",
      placeId: "demo-place-denver",
    }),
    rankingChecks: [
      {
        query: "home services denver",
        estimatedPosition: 4,
        inTop3: false,
        inMapPack: false,
        confidence: 72,
        source: "estimated_local_rank",
        competitors: [],
      },
    ],
    auditFindings: [
      {
        key: "cta",
        title: "CTA can be stronger",
        detail: "Add clearer local service intent CTA.",
        severity: "medium",
        source: "site_crawl",
        estimated: false,
      },
    ],
    competitorSnapshots: [{ query: "home services denver", competitorName: "Demo Competitor", estimatedPosition: 1 }],
    vertical: seedVertical,
    leadCapture: { name: "Morgan Ops", email: "morgan@northstar.example", source: "scan_form" },
  });

  const runB = await recordScanRun({
    publicId: reportB,
    query: "NorthStar Austin",
    locationHint: "Austin TX",
    selectedPlaceId: "demo-place-austin",
    candidateConfidence: 90,
    organizationId,
    brandId,
    locationId: locB,
    businessModel: "multi_location",
    profile: {
      name: "NorthStar Austin",
      vertical: seedVertical,
      placeId: "demo-place-austin",
      address: "Austin, TX",
      website: "https://northstar.example/austin",
      phone: "(555) 010-1002",
      rating: "4.3",
      reviewCount: "121",
      googleMapsUri: "https://maps.google.com/?q=NorthStar+Austin",
      primaryCategory: "Home services",
      types: ["home_services"],
      latitude: 30.2672,
      longitude: -97.7431,
      businessStatus: "OPERATIONAL",
      openNow: true,
    },
    payload: samplePayload({
      name: "NorthStar Austin",
      website: "https://northstar.example/austin",
      city: "Austin, TX",
      placeId: "demo-place-austin",
    }),
    rankingChecks: [
      {
        query: "home services austin",
        estimatedPosition: 5,
        inTop3: false,
        inMapPack: false,
        confidence: 68,
        source: "estimated_local_rank",
        competitors: [],
      },
    ],
    auditFindings: [
      {
        key: "schema",
        title: "Schema data missing",
        detail: "Add structured data for local relevance.",
        severity: "medium",
        source: "site_crawl",
        estimated: false,
      },
    ],
    competitorSnapshots: [{ query: "home services austin", competitorName: "Austin Demo Co", estimatedPosition: 2 }],
    vertical: seedVertical,
    leadCapture: { name: "Morgan Ops", email: "morgan@northstar.example", source: "scan_form" },
  });

  return Response.json({
    organizationId,
    brandId,
    locationIds: [locA, locB],
    businessIds: [runA.businessId, runB.businessId],
    reportPublicIds: [reportA, reportB],
  });
}

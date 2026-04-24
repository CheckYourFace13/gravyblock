import { randomUUID } from "node:crypto";
import type { LocalRankingCheck, ReportPayload, WebsiteAuditFinding } from "@/lib/report/types";
import type { BusinessProfile, Vertical } from "@/lib/report/types";
import { buildContentOpportunitySeeds } from "@/lib/growth/content-opportunities";
import { buildRoadmapRows, sectionScoresFromPayload } from "@/lib/growth/roadmap";
import { normalizeWebsiteForLookup } from "@/lib/business/normalize";

type MemBusiness = {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  vertical: string | null;
  placeId: string | null;
  primaryCategory: string | null;
  address: string | null;
  website: string | null;
  websiteNormalized: string | null;
  phone: string | null;
  googleMapsUri: string | null;
  rating: string | null;
  reviewCount: number | null;
  latitude: number | null;
  longitude: number | null;
  businessStatus: string | null;
  brandNotes: string | null;
  planTier: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
  billingEmail: string | null;
  currentPeriodEnd: string | null;
};

type MemScan = {
  id: string;
  businessId: string;
  source: string;
  lookupQuery: string;
  lookupLocation: string;
  selectedPlaceId: string;
  placeConfidence: number;
  sourcesUsed: unknown;
  createdAt: string;
};

type MemReport = {
  id: string;
  publicId: string;
  scanId: string;
  businessId: string;
  payload: ReportPayload;
  overallScore: number;
  opportunityLevel: string;
  createdAt: string;
};

type MemLead = {
  id: string;
  createdAt: string;
  firstSeenAt: string;
  lastSeenAt: string;
  businessId: string | null;
  reportPublicId: string | null;
  name: string;
  email: string;
  emailNormalized: string;
  website?: string | null;
  websiteNormalized?: string | null;
  placeId?: string | null;
  phone?: string;
  message?: string;
  vertical?: string;
  source: string;
  sources: string[];
  pipelineStatus: string;
};

const businesses = new Map<string, MemBusiness>();
const websiteIndex = new Map<string, string>();
const scans = new Map<string, MemScan>();
const reportsByPublicId = new Map<string, MemReport>();
const leads: MemLead[] = [];
const leadEmailIndex = new Map<string, string>();
const customerMagicLinks: Array<{
  id: string;
  emailNormalized: string;
  tokenHash: string;
  redirectTo: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}> = [];
const customerSessions = new Map<string, {
  id: string;
  emailNormalized: string;
  businessIds: string[];
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}>();
const recommendations: Array<{
  id: string;
  businessId: string;
  lane: string;
  category: string;
  title: string;
  detail: string;
  impact: string;
  status: string;
  sortOrder: number;
  createdAt: string;
}> = [];
const snapshots: Array<{
  id: string;
  businessId: string;
  overallScore: number;
  opportunityLevel: string;
  sectionScores: Record<string, number>;
  source: string;
  createdAt: string;
}> = [];
const contentIdeas: Array<{
  id: string;
  businessId: string;
  angle: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
}> = [];
const rankingChecks: Array<{
  id: string;
  businessId: string;
  scanId: string;
  query: string;
  source: string;
  metricType: string;
  estimatedPosition: number | null;
  averagePosition: number | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  inTop3: string;
  mapPack: string;
  confidence: number | null;
  details: unknown;
  createdAt: string;
}> = [];
const auditFindings: Array<{
  id: string;
  businessId: string;
  scanId: string;
  category: string;
  severity: string;
  title: string;
  detail: string;
  source: string;
  estimated: string;
  createdAt: string;
}> = [];
const competitorSnapshots: Array<{
  id: string;
  businessId: string;
  scanId: string;
  query: string;
  competitorName: string;
  competitorPlaceId: string | null;
  rating: string | null;
  reviewCount: number | null;
  estimatedPosition: number | null;
  source: string;
  createdAt: string;
}> = [];
const searchConsoleConnections: Array<{
  id: string;
  businessId: string;
  propertyUri: string;
  status: string;
  createdAt: string;
}> = [];
const placeProfiles: Array<{
  id: string;
  businessId: string;
  scanId: string;
  source: string;
  placeId: string;
  displayName: string;
  formattedAddress: string | null;
  internationalPhoneNumber: string | null;
  websiteUri: string | null;
  mapsUri: string | null;
  rating: string | null;
  reviewCount: number | null;
  primaryType: string | null;
  types: unknown;
  businessStatus: string | null;
  openNow: string | null;
  latitude: number | null;
  longitude: number | null;
  raw: unknown;
  createdAt: string;
}> = [];
const socialProfilesMem: Array<{
  id: string;
  businessId: string;
  scanId: string;
  platform: string;
  url: string;
  handle: string | null;
  discoverySource: string;
  confidence: number;
  activityHint: string;
  notes: string | null;
  createdAt: string;
}> = [];

function now() {
  return new Date().toISOString();
}

function upsertBusiness(profile: BusinessProfile, vertical: Vertical): MemBusiness {
  const websiteNormalized = normalizeWebsiteForLookup(profile.website);
  const existingId = (profile.placeId ? [...businesses.values()].find((b) => b.placeId === profile.placeId)?.id : undefined) ??
    (websiteNormalized ? websiteIndex.get(websiteNormalized) : undefined);

  if (existingId) {
    const prev = businesses.get(existingId)!;
    const next: MemBusiness = {
      ...prev,
      updatedAt: now(),
      name: profile.name || prev.name,
      vertical: vertical ?? prev.vertical,
      placeId: profile.placeId ?? prev.placeId,
      primaryCategory: profile.primaryCategory ?? prev.primaryCategory,
      address: profile.address ?? prev.address,
      website: profile.website ?? prev.website,
      websiteNormalized: websiteNormalized ?? prev.websiteNormalized,
      phone: profile.phone ?? prev.phone,
      googleMapsUri: profile.googleMapsUri ?? prev.googleMapsUri,
      rating: profile.rating ?? prev.rating,
      reviewCount: profile.reviewCount ? Number.parseInt(profile.reviewCount.replace(/\D/g, ""), 10) || prev.reviewCount : prev.reviewCount,
      latitude: profile.latitude ?? prev.latitude,
      longitude: profile.longitude ?? prev.longitude,
      businessStatus: profile.businessStatus ?? prev.businessStatus,
    };
    businesses.set(existingId, next);
    if (next.websiteNormalized) websiteIndex.set(next.websiteNormalized, existingId);
    return next;
  }

  const id = randomUUID();
  const created: MemBusiness = {
    id,
    createdAt: now(),
    updatedAt: now(),
    name: profile.name,
    vertical,
    placeId: profile.placeId ?? null,
    primaryCategory: profile.primaryCategory ?? null,
    address: profile.address ?? null,
    website: profile.website ?? null,
    websiteNormalized,
    phone: profile.phone ?? null,
    googleMapsUri: profile.googleMapsUri ?? null,
    rating: profile.rating ?? null,
    reviewCount: profile.reviewCount ? Number.parseInt(profile.reviewCount.replace(/\D/g, ""), 10) || null : null,
    latitude: profile.latitude ?? null,
    longitude: profile.longitude ?? null,
    businessStatus: profile.businessStatus ?? null,
    brandNotes: null,
    planTier: "free",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      billingEmail: null,
      currentPeriodEnd: null,
  };
  businesses.set(id, created);
  if (websiteNormalized) websiteIndex.set(websiteNormalized, id);
  return created;
}

export const memoryStore = {
  recordScanRun(input: {
    publicId: string;
    query: string;
    locationHint: string;
    selectedPlaceId: string;
    candidateConfidence: number;
    profile: BusinessProfile;
    payload: ReportPayload;
    vertical: Vertical;
    rankingChecksInput: LocalRankingCheck[];
    auditFindingsInput: WebsiteAuditFinding[];
    competitorSnapshotsInput: Array<{
      query: string;
      competitorName: string;
      competitorPlaceId?: string;
      rating?: string;
      reviewCount?: number;
      estimatedPosition?: number;
    }>;
    socialProfilesInput?: Array<{
      platform: string;
      url: string;
      handle: string | null;
      discoverySource: string;
      confidence: number;
      activityHint: string;
      notes: string | null;
    }>;
    leadCapture?: {
      name: string;
      email: string;
      source: string;
      phone?: string;
      message?: string;
    };
  }) {
    const business = upsertBusiness(input.profile, input.vertical);
    const scanId = randomUUID();
    const createdAt = input.payload.generatedAt;
    const scan: MemScan = {
      id: scanId,
      businessId: business.id,
      source: "free_scan",
      lookupQuery: input.query,
      lookupLocation: input.locationHint,
      selectedPlaceId: input.selectedPlaceId,
      placeConfidence: input.candidateConfidence,
      sourcesUsed: input.payload.sourceAttribution,
      createdAt,
    };
    scans.set(scanId, scan);

    const reportId = randomUUID();
    reportsByPublicId.set(input.publicId, {
      id: reportId,
      publicId: input.publicId,
      scanId,
      businessId: business.id,
      payload: input.payload,
      overallScore: input.payload.summary.score,
      opportunityLevel: input.payload.opportunityLevel,
      createdAt,
    });

    placeProfiles.push({
      id: randomUUID(),
      businessId: business.id,
      scanId,
      source: "google_places",
      placeId: input.profile.placeId ?? input.selectedPlaceId,
      displayName: input.profile.name,
      formattedAddress: input.profile.address ?? null,
      internationalPhoneNumber: input.profile.phone ?? null,
      websiteUri: input.profile.website ?? null,
      mapsUri: input.profile.googleMapsUri ?? null,
      rating: input.profile.rating ?? null,
      reviewCount: input.profile.reviewCount ? Number.parseInt(input.profile.reviewCount.replace(/\D/g, ""), 10) || null : null,
      primaryType: input.profile.primaryCategory ?? null,
      types: input.profile.types ?? [],
      businessStatus: input.profile.businessStatus ?? null,
      openNow: typeof input.profile.openNow === "boolean" ? String(input.profile.openNow) : null,
      latitude: input.profile.latitude ?? null,
      longitude: input.profile.longitude ?? null,
      raw: input.payload.googlePresence,
      createdAt,
    });

    for (const p of input.socialProfilesInput ?? []) {
      socialProfilesMem.push({
        id: randomUUID(),
        businessId: business.id,
        scanId,
        platform: p.platform,
        url: p.url,
        handle: p.handle,
        discoverySource: p.discoverySource,
        confidence: p.confidence,
        activityHint: p.activityHint,
        notes: p.notes,
        createdAt,
      });
    }

    snapshots.push({
      id: randomUUID(),
      businessId: business.id,
      overallScore: input.payload.summary.score,
      opportunityLevel: input.payload.opportunityLevel,
      sectionScores: sectionScoresFromPayload(input.payload),
      source: "scan",
      createdAt,
    });

    const roadmap = buildRoadmapRows(input.payload);
    roadmap.forEach((row, idx) => {
      recommendations.push({
        id: randomUUID(),
        businessId: business.id,
        lane: row.lane,
        category: row.category,
        title: row.title,
        detail: row.detail,
        impact: row.impact,
        status: "open",
        sortOrder: idx,
        createdAt,
      });
    });

    const seeds = buildContentOpportunitySeeds(input.profile, input.payload);
    seeds.forEach((seed) => {
      contentIdeas.push({
        id: randomUUID(),
        businessId: business.id,
        angle: seed.angle,
        title: seed.title,
        body: seed.body,
        status: "open",
        createdAt,
      });
    });

    input.rankingChecksInput.forEach((check) => {
      rankingChecks.push({
        id: randomUUID(),
        businessId: business.id,
        scanId,
        query: check.query,
        source: check.source,
        metricType: "estimated_local_rank",
        estimatedPosition: check.estimatedPosition,
        averagePosition: null,
        impressions: null,
        clicks: null,
        ctr: null,
        inTop3: String(check.inTop3),
        mapPack: String(check.inMapPack),
        confidence: check.confidence,
        details: check,
        createdAt,
      });
    });

    input.auditFindingsInput.forEach((finding) => {
      auditFindings.push({
        id: randomUUID(),
        businessId: business.id,
        scanId,
        category: "website_conversion",
        severity: finding.severity,
        title: finding.title,
        detail: finding.detail,
        source: finding.source,
        estimated: String(finding.estimated),
        createdAt,
      });
    });

    input.competitorSnapshotsInput.forEach((snap) => {
      competitorSnapshots.push({
        id: randomUUID(),
        businessId: business.id,
        scanId,
        query: snap.query,
        competitorName: snap.competitorName,
        competitorPlaceId: snap.competitorPlaceId ?? null,
        rating: snap.rating ?? null,
        reviewCount: snap.reviewCount ?? null,
        estimatedPosition: snap.estimatedPosition ?? null,
        source: "estimated_local_rank",
        createdAt,
      });
    });

    if (input.payload.searchVisibility.propertyUrl) {
      searchConsoleConnections.push({
        id: randomUUID(),
        businessId: business.id,
        propertyUri: input.payload.searchVisibility.propertyUrl,
        status: input.payload.searchVisibility.verified ? "connected" : "pending",
        createdAt,
      });
    }

    if (input.leadCapture?.email) {
      this.saveLead({
        businessId: business.id,
        reportPublicId: input.publicId,
        name: input.leadCapture.name,
        email: input.leadCapture.email,
        emailNormalized: input.leadCapture.email.trim().toLowerCase(),
        phone: input.leadCapture.phone,
        message: input.leadCapture.message,
        vertical: input.vertical,
        website: input.profile.website ?? null,
        websiteNormalized: normalizeWebsiteForLookup(input.profile.website),
        placeId: input.profile.placeId ?? input.selectedPlaceId,
        source: input.leadCapture.source,
      });
    }

    return { businessId: business.id, scanId, reportId };
  },

  saveLead(
    input: Omit<MemLead, "id" | "createdAt" | "firstSeenAt" | "lastSeenAt" | "pipelineStatus" | "sources">,
  ) {
    const existingId = leadEmailIndex.get(input.emailNormalized);
    const timestamp = now();
    if (existingId) {
      const index = leads.findIndex((lead) => lead.id === existingId);
      if (index >= 0) {
        const prev = leads[index];
        const nextSources = prev.sources.includes(input.source) ? prev.sources : [...prev.sources, input.source];
        leads[index] = {
          ...prev,
          lastSeenAt: timestamp,
          businessId: input.businessId ?? prev.businessId,
          reportPublicId: input.reportPublicId ?? prev.reportPublicId,
          name: input.name || prev.name,
          email: input.email || prev.email,
          phone: input.phone ?? prev.phone,
          message: input.message ?? prev.message,
          vertical: input.vertical ?? prev.vertical,
          source: input.source,
          sources: nextSources,
          website: input.website ?? prev.website,
          websiteNormalized: input.websiteNormalized ?? prev.websiteNormalized,
          placeId: input.placeId ?? prev.placeId,
        };
      }
      return { leadId: existingId, created: false };
    }

    const id = randomUUID();
    leads.unshift({
      id,
      createdAt: timestamp,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
      pipelineStatus: "new",
      sources: [input.source],
      ...input,
    });
    leadEmailIndex.set(input.emailNormalized, id);
    return { leadId: id, created: true };
  },

  listLeads() {
    return [...leads];
  },

  listLeadsForBusiness(businessId: string) {
    return leads
      .filter((lead) => lead.businessId === businessId)
      .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
  },

  saveCustomerMagicLink(input: {
    emailNormalized: string;
    tokenHash: string;
    redirectTo?: string | null;
    expiresAt: string;
  }) {
    customerMagicLinks.push({
      id: randomUUID(),
      emailNormalized: input.emailNormalized,
      tokenHash: input.tokenHash,
      redirectTo: input.redirectTo ?? null,
      createdAt: now(),
      expiresAt: input.expiresAt,
      usedAt: null,
    });
  },

  consumeCustomerMagicLink(tokenHash: string) {
    const entry = customerMagicLinks.find((item) => item.tokenHash === tokenHash);
    if (!entry) return null;
    if (entry.usedAt) return null;
    if (new Date(entry.expiresAt).getTime() < Date.now()) return null;
    entry.usedAt = now();
    return {
      emailNormalized: entry.emailNormalized,
      redirectTo: entry.redirectTo,
    };
  },

  saveCustomerSession(input: {
    id: string;
    emailNormalized: string;
    businessIds: string[];
    expiresAt: string;
  }) {
    const timestamp = now();
    customerSessions.set(input.id, {
      id: input.id,
      emailNormalized: input.emailNormalized,
      businessIds: [...new Set(input.businessIds)],
      createdAt: timestamp,
      lastSeenAt: timestamp,
      expiresAt: input.expiresAt,
    });
  },

  getCustomerSession(id: string) {
    const session = customerSessions.get(id);
    if (!session) return null;
    session.lastSeenAt = now();
    return session;
  },

  deleteCustomerSession(id: string) {
    customerSessions.delete(id);
  },

  listCustomerBusinessAccess(emailNormalized: string) {
    const ids = new Set<string>();
    for (const lead of leads) {
      if (lead.emailNormalized !== emailNormalized) continue;
      if (lead.businessId) ids.add(lead.businessId);
      if (!lead.businessId && lead.reportPublicId) {
        const report = reportsByPublicId.get(lead.reportPublicId);
        if (report?.businessId) ids.add(report.businessId);
      }
    }
    for (const business of businesses.values()) {
      if (business.billingEmail?.trim().toLowerCase() === emailNormalized) ids.add(business.id);
    }
    const reportsByBusiness = new Map<string, { publicId: string; createdAt: string }>();
    for (const report of reportsByPublicId.values()) {
      const prev = reportsByBusiness.get(report.businessId);
      if (!prev || new Date(report.createdAt).getTime() > new Date(prev.createdAt).getTime()) {
        reportsByBusiness.set(report.businessId, {
          publicId: report.publicId,
          createdAt: report.createdAt,
        });
      }
    }
    return [...ids]
      .map((id) => {
        const business = businesses.get(id);
        if (!business) return null;
        return {
          id: business.id,
          name: business.name,
          planTier: business.planTier,
          latestReportAt: reportsByBusiness.get(id)?.createdAt ?? null,
          latestReportPublicId: reportsByBusiness.get(id)?.publicId ?? null,
          billingEmail: business.billingEmail,
          subscriptionStatus: business.subscriptionStatus,
        };
      })
      .filter((v): v is NonNullable<typeof v> => !!v);
  },

  updateBusinessBilling(input: {
    businessId: string;
    planTier?: string;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    subscriptionStatus?: string | null;
    billingEmail?: string | null;
    currentPeriodEnd?: string | null;
  }) {
    const b = businesses.get(input.businessId);
    if (!b) return;
    const next: MemBusiness = {
      ...b,
      updatedAt: now(),
      planTier: input.planTier !== undefined ? input.planTier : b.planTier,
      stripeCustomerId: input.stripeCustomerId !== undefined ? input.stripeCustomerId : b.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId !== undefined ? input.stripeSubscriptionId : b.stripeSubscriptionId,
      subscriptionStatus: input.subscriptionStatus !== undefined ? input.subscriptionStatus : b.subscriptionStatus,
      billingEmail: input.billingEmail !== undefined ? input.billingEmail : b.billingEmail,
      currentPeriodEnd: input.currentPeriodEnd !== undefined ? input.currentPeriodEnd : b.currentPeriodEnd,
    };
    businesses.set(input.businessId, next);
  },

  getReport(publicId: string) {
    return reportsByPublicId.get(publicId) ?? null;
  },

  listReports() {
    return [...reportsByPublicId.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  },

  listBusinesses() {
    return [...businesses.values()].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  },

  getBusiness(id: string) {
    return businesses.get(id) ?? null;
  },

  listWorkspaceByBusiness(businessId: string) {
    return {
      snapshots: snapshots.filter((s) => s.businessId === businessId),
      recommendations: recommendations.filter((r) => r.businessId === businessId),
      content: contentIdeas.filter((c) => c.businessId === businessId),
      reports: this.listReports()
        .filter((r) => r.businessId === businessId)
        .map((r) => ({
          publicId: r.publicId,
          score: r.overallScore,
          opportunityLevel: r.opportunityLevel,
          createdAt: r.createdAt,
        })),
      rankingChecks: rankingChecks.filter((r) => r.businessId === businessId),
      auditFindings: auditFindings.filter((a) => a.businessId === businessId),
      placeProfiles: placeProfiles.filter((p) => p.businessId === businessId),
      socialProfiles: socialProfilesMem.filter((s) => s.businessId === businessId),
      searchConsoleConnections: searchConsoleConnections.filter((s) => s.businessId === businessId),
    };
  },
};

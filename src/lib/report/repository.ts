import { randomUUID } from "node:crypto";
import { desc, eq, or } from "drizzle-orm";
import {
  aiVisibilityChecks,
  auditFindings,
  backlinkOpportunities,
  businesses,
  citationMonitors,
  competitorSnapshots,
  contentQueue,
  contentStrategies,
  contentOpportunities,
  assertMemoryFallbackAllowed,
  getDb,
  getSqlClient,
  growthPrograms,
  leads,
  operatorTasks,
  placeProfiles,
  publishingJobs,
  publishingTargets,
  rankingChecks,
  recommendations,
  reports,
  scans,
  searchConsolePropertyConnections,
  socialProfiles,
  visibilitySnapshots,
  websiteDomains,
} from "@/lib/db";
import { memoryStore } from "@/lib/db/memory-store";
import { normalizeEmail, normalizeWebsiteForLookup } from "@/lib/business/normalize";
import { buildContentOpportunitySeeds } from "@/lib/growth/content-opportunities";
import { buildRoadmapRows, sectionScoresFromPayload } from "@/lib/growth/roadmap";
import type { BusinessProfile, LocalRankingCheck, ReportPayload, Vertical, WebsiteAuditFinding } from "@/lib/report/types";
import type { LeadFormInput } from "@/lib/validation/lead";

type LeadSource = NonNullable<LeadFormInput["source"]>;
type DbLike = {
  select: NonNullable<ReturnType<typeof getDb>>["select"];
  update: NonNullable<ReturnType<typeof getDb>>["update"];
  insert: NonNullable<ReturnType<typeof getDb>>["insert"];
};

export type ReportContext = {
  publicId: string;
  payload: ReportPayload;
  overallScore: number;
  opportunityLevel: string;
  createdAt: string;
  businessId: string;
  scanId: string;
  reportId: string;
};

function parseReviewCount(raw?: string) {
  if (!raw) return null;
  const n = Number.parseInt(raw.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

async function upsertBusinessDb(
  tx: {
    select: NonNullable<ReturnType<typeof getDb>>["select"];
    update: NonNullable<ReturnType<typeof getDb>>["update"];
    insert: NonNullable<ReturnType<typeof getDb>>["insert"];
  },
  input: {
  profile: BusinessProfile;
  businessModel?: "single_location" | "multi_location" | "service_area" | "online_only" | "hybrid" | "franchise";
  organizationId?: string | null;
  brandId?: string | null;
  locationId?: string | null;
  vertical: Vertical;
}) {
  const websiteNormalized = normalizeWebsiteForLookup(input.profile.website);
  const placeId = input.profile.placeId ?? null;
  const conditions = [
    placeId ? eq(businesses.placeId, placeId) : null,
    websiteNormalized ? eq(businesses.websiteNormalized, websiteNormalized) : null,
  ].filter(Boolean);

  const existing = conditions.length
    ? await tx
        .select({ id: businesses.id })
        .from(businesses)
        .where(conditions.length === 1 ? conditions[0]! : or(conditions[0]!, conditions[1]!))
        .limit(1)
    : [];

  const values = {
    updatedAt: new Date(),
    name: input.profile.name,
    vertical: input.vertical,
    organizationId: input.organizationId ?? null,
    brandId: input.brandId ?? null,
    locationId: input.locationId ?? null,
    businessModel: input.businessModel ?? "single_location",
    ownershipModel: input.businessModel === "franchise" ? "franchise" : "independent",
    placeId,
    primaryCategory: input.profile.primaryCategory ?? null,
    address: input.profile.address ?? null,
    website: input.profile.website ?? null,
    websiteNormalized,
    phone: input.profile.phone ?? null,
    googleMapsUri: input.profile.googleMapsUri ?? null,
    rating: input.profile.rating ?? null,
    reviewCount: parseReviewCount(input.profile.reviewCount),
    latitude: input.profile.latitude ?? null,
    longitude: input.profile.longitude ?? null,
    businessStatus: input.profile.businessStatus ?? null,
  };

  if (existing[0]) {
    await tx.update(businesses).set(values).where(eq(businesses.id, existing[0].id));
    return existing[0].id;
  }

  const [created] = await tx
    .insert(businesses)
    .values({
      ...values,
      planTier: "free",
      brandNotes: null,
    })
    .returning({ id: businesses.id });
  return created.id;
}

async function resolveBusinessIdForLeadDb(
  db: DbLike,
  input: {
    businessId?: string;
    reportPublicId?: string;
    placeId?: string;
    websiteNormalized?: string | null;
  },
) {
  if (input.businessId) return input.businessId;

  if (input.reportPublicId) {
    const [viaReport] = await db
      .select({ businessId: scans.businessId })
      .from(reports)
      .innerJoin(scans, eq(reports.scanId, scans.id))
      .where(eq(reports.publicId, input.reportPublicId))
      .limit(1);
    if (viaReport?.businessId) return viaReport.businessId;
  }

  const conditions = [
    input.placeId ? eq(businesses.placeId, input.placeId) : null,
    input.websiteNormalized ? eq(businesses.websiteNormalized, input.websiteNormalized) : null,
  ].filter(Boolean);

  if (!conditions.length) return null;
  const [viaBusiness] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(conditions.length === 1 ? conditions[0]! : or(conditions[0]!, conditions[1]!))
    .limit(1);
  return viaBusiness?.id ?? null;
}

async function upsertLeadDb(
  db: DbLike,
  input: LeadFormInput,
  overrides?: { businessId?: string | null; reportPublicId?: string | null },
) {
  const emailNormalized = normalizeEmail(input.email);
  if (!emailNormalized) {
    throw new Error("Valid email required");
  }

  const websiteNormalized = normalizeWebsiteForLookup(input.website);
  const resolvedBusinessId =
    overrides?.businessId ??
    (await resolveBusinessIdForLeadDb(db, {
      businessId: input.businessId,
      reportPublicId: overrides?.reportPublicId ?? input.reportPublicId,
      placeId: input.placeId,
      websiteNormalized,
    }));
  const reportPublicId = overrides?.reportPublicId ?? input.reportPublicId ?? null;
  const now = new Date();

  const [existing] = await db
    .select()
    .from(leads)
    .where(eq(leads.emailNormalized, emailNormalized))
    .limit(1);

  if (existing) {
    const priorSources = Array.isArray(existing.sources) ? (existing.sources as string[]) : [];
    const mergedSources = priorSources.includes(input.source) ? priorSources : [...priorSources, input.source];
    await db
      .update(leads)
      .set({
        lastSeenAt: now,
        organizationId: input.organizationId ?? existing.organizationId,
        brandId: input.brandId ?? existing.brandId,
        locationId: input.locationId ?? existing.locationId,
        businessId: resolvedBusinessId ?? existing.businessId,
        reportPublicId: reportPublicId ?? existing.reportPublicId,
        name: input.name,
        email: input.email,
        phone: input.phone ?? existing.phone,
        message: input.message ?? existing.message,
        vertical: input.vertical ?? existing.vertical,
        source: input.source,
        sources: mergedSources,
        website: input.website ?? existing.website,
        websiteNormalized: websiteNormalized ?? existing.websiteNormalized,
        placeId: input.placeId ?? existing.placeId,
      })
      .where(eq(leads.id, existing.id));
    return {
      created: false,
      leadId: existing.id,
      businessId: resolvedBusinessId ?? existing.businessId,
    };
  }

  const leadId = randomUUID();
  await db.insert(leads).values({
    id: leadId,
    businessId: resolvedBusinessId,
    organizationId: input.organizationId,
    brandId: input.brandId,
    locationId: input.locationId,
    reportPublicId,
    name: input.name,
    email: input.email,
    emailNormalized,
    phone: input.phone,
    message: input.message,
    vertical: input.vertical,
    source: input.source,
    sources: [input.source],
    website: input.website,
    websiteNormalized,
    placeId: input.placeId,
    pipelineStatus: "new",
    firstSeenAt: now,
    lastSeenAt: now,
  });
  return { created: true, leadId, businessId: resolvedBusinessId };
}

export async function recordScanRun(input: {
  publicId: string;
  query: string;
  locationHint: string;
  selectedPlaceId: string;
  candidateConfidence?: number;
  profile: BusinessProfile;
  payload: ReportPayload;
  rankingChecks: LocalRankingCheck[];
  auditFindings: WebsiteAuditFinding[];
  competitorSnapshots: Array<{
    query: string;
    competitorName: string;
    competitorPlaceId?: string;
    rating?: string;
    reviewCount?: number;
    estimatedPosition?: number;
  }>;
  organizationId?: string;
  brandId?: string;
  locationId?: string;
  businessModel?: "single_location" | "multi_location" | "service_area" | "online_only" | "hybrid" | "franchise";
  vertical: Vertical;
  leadCapture?: {
    name: string;
    email: string;
    source: LeadSource;
    phone?: string;
    message?: string;
  };
}) {
  const db = getDb();
  if (!db) {
    assertMemoryFallbackAllowed();
    return memoryStore.recordScanRun({
      publicId: input.publicId,
      query: input.query,
      locationHint: input.locationHint,
      selectedPlaceId: input.selectedPlaceId,
      candidateConfidence: input.candidateConfidence ?? 0,
      profile: input.profile,
      payload: input.payload,
      vertical: input.vertical,
      rankingChecksInput: input.rankingChecks,
      auditFindingsInput: input.auditFindings,
      competitorSnapshotsInput: input.competitorSnapshots,
      leadCapture: input.leadCapture,
    });
  }

  return db.transaction(async (tx) => {
    const businessId = await upsertBusinessDb(tx, {
      profile: input.profile,
      businessModel: input.businessModel,
      organizationId: input.organizationId,
      brandId: input.brandId,
      locationId: input.locationId,
      vertical: input.vertical,
    });
    const [scan] = await tx
      .insert(scans)
      .values({
        businessId,
        source: "free_scan",
        lookupQuery: input.query,
        lookupLocation: input.locationHint,
        selectedPlaceId: input.selectedPlaceId,
        placeConfidence: input.candidateConfidence ?? null,
        sourcesUsed: input.payload.sourceAttribution,
      })
      .returning({ id: scans.id });

    const [report] = await tx
      .insert(reports)
      .values({
        publicId: input.publicId,
        scanId: scan.id,
        payload: input.payload,
        overallScore: input.payload.summary.score,
        opportunityLevel: input.payload.opportunityLevel,
        sourceAttribution: input.payload.sourceAttribution,
      })
      .returning({ id: reports.id });

    await tx.insert(placeProfiles).values({
      businessId,
      scanId: scan.id,
      source: "google_places",
      placeId: input.profile.placeId ?? input.selectedPlaceId,
      displayName: input.profile.name,
      formattedAddress: input.profile.address ?? null,
      internationalPhoneNumber: input.profile.phone ?? null,
      websiteUri: input.profile.website ?? null,
      mapsUri: input.profile.googleMapsUri ?? null,
      rating: input.profile.rating ?? null,
      reviewCount: parseReviewCount(input.profile.reviewCount),
      primaryType: input.profile.primaryCategory ?? null,
      types: input.profile.types ?? [],
      businessStatus: input.profile.businessStatus ?? null,
      openNow: typeof input.profile.openNow === "boolean" ? String(input.profile.openNow) : null,
      latitude: input.profile.latitude ?? null,
      longitude: input.profile.longitude ?? null,
      raw: input.payload.googlePresence,
    });

    await tx.insert(visibilitySnapshots).values({
      businessId,
      reportId: report.id,
      overallScore: input.payload.summary.score,
      opportunityLevel: input.payload.opportunityLevel,
      sectionScores: sectionScoresFromPayload(input.payload),
      source: "scan",
    });

    const roadmap = buildRoadmapRows(input.payload);
    if (roadmap.length) {
      await tx.insert(recommendations).values(
        roadmap.map((r, idx) => ({
          businessId,
          reportId: report.id,
          lane: r.lane,
          category: r.category,
          title: r.title,
          detail: r.detail,
          impact: r.impact,
          status: "open",
          sortOrder: idx,
        })),
      );
    }

    const content = buildContentOpportunitySeeds(input.profile, input.payload);
    if (content.length) {
      await tx.insert(contentOpportunities).values(
        content.map((c) => ({
          businessId,
          reportId: report.id,
          angle: c.angle,
          title: c.title,
          body: c.body,
          status: "open",
        })),
      );
    }

    await tx.insert(growthPrograms).values({
      businessId,
      name: "Autopilot growth core",
      goal: "Increase discoverability, trust, and conversion from local-intent traffic.",
      cadence: "monthly",
      status: "active",
      automationMode: "assisted",
    });

    const [strategy] = await tx
      .insert(contentStrategies)
      .values({
        businessId,
        strategyWindowDays: 30,
        audience: "Local-intent and comparison shoppers",
        notes: "Auto-seeded from scan results. Move to full generation pipeline via scheduled jobs.",
      })
      .returning({ id: contentStrategies.id });

    await tx.insert(contentQueue).values([
      {
        businessId,
        strategyId: strategy.id,
        kind: "article",
        title: `${input.profile.name}: local trust + conversion page refresh`,
        targetKeyword: `${input.profile.name} local trusted`,
        targetUrl: input.profile.website ?? null,
        variant: "primary_market",
        status: "queued",
      },
      {
        businessId,
        strategyId: strategy.id,
        kind: "location_page",
        title: `${input.profile.name} service-area landing page`,
        targetKeyword: `${input.query} ${input.locationHint}`,
        targetUrl: input.profile.website ?? null,
        variant: "geo_variant",
        status: "queued",
      },
    ]);

    const [manualTarget] = await tx
      .insert(publishingTargets)
      .values({
        businessId,
        label: "Primary website publisher",
        adapter: "manual",
        config: { note: "Replace with CMS adapter credentials for autopublish." },
        active: "true",
      })
      .returning({ id: publishingTargets.id });

    const queuedContent = await tx
      .select({ id: contentQueue.id })
      .from(contentQueue)
      .where(eq(contentQueue.businessId, businessId))
      .orderBy(desc(contentQueue.createdAt))
      .limit(2);
    if (queuedContent.length) {
      await tx.insert(publishingJobs).values(
        queuedContent.map((q) => ({
          queueId: q.id,
          targetId: manualTarget.id,
          status: "pending",
          responseLog: "Awaiting approval/autopublish mode.",
        })),
      );
    }

    await tx.insert(backlinkOpportunities).values([
      {
        businessId,
        sourceName: "Local business association",
        sourceType: "directory",
        targetUrl: input.profile.website ?? null,
        relevanceNote: "High local relevance and trust signals.",
        qualityScore: 74,
        status: "prospecting",
      },
      {
        businessId,
        sourceName: "Regional partner roundup",
        sourceType: "partner",
        targetUrl: input.profile.website ?? null,
        relevanceNote: "Contextual referral potential for nearby intent.",
        qualityScore: 66,
        status: "outreach_queued",
      },
    ]);

    await tx.insert(aiVisibilityChecks).values({
      businessId,
      prompt: `${input.query} best option in ${input.locationHint}`,
      engine: "synthetic",
      mentionFound: "false",
      sentiment: "neutral",
      confidence: 42,
    });

    await tx.insert(citationMonitors).values({
      businessId,
      sourceName: "Google profile vs site consistency",
      listingUrl: input.profile.googleMapsUri ?? null,
      status: "pending",
      mismatchNote: "Initial baseline pending first recurring monitor run.",
    });

    await tx.insert(operatorTasks).values([
      {
        businessId,
        title: "Approve first 30-day content queue",
        detail: "Review queued assets and set publish cadence.",
        queue: "content_ops",
        status: "queued",
      },
      {
        businessId,
        title: "Launch backlink outreach wave 1",
        detail: "Validate quality targets and start outreach.",
        queue: "authority_ops",
        status: "queued",
      },
    ]);

    if (input.rankingChecks.length) {
      await tx.insert(rankingChecks).values(
        input.rankingChecks.map((check) => ({
          businessId,
          scanId: scan.id,
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
        })),
      );
    }

    if (input.auditFindings.length) {
      await tx.insert(auditFindings).values(
        input.auditFindings.map((finding) => ({
          businessId,
          scanId: scan.id,
          category: "website_conversion",
          severity: finding.severity,
          title: finding.title,
          detail: finding.detail,
          source: finding.source,
          estimated: String(finding.estimated),
        })),
      );
    }

    if (input.competitorSnapshots.length) {
      await tx.insert(competitorSnapshots).values(
        input.competitorSnapshots.map((snap) => ({
          businessId,
          scanId: scan.id,
          query: snap.query,
          competitorName: snap.competitorName,
          competitorPlaceId: snap.competitorPlaceId ?? null,
          rating: snap.rating ?? null,
          reviewCount: snap.reviewCount ?? null,
          estimatedPosition: snap.estimatedPosition ?? null,
          source: "estimated_local_rank",
        })),
      );
    }

    if (input.payload.searchVisibility.propertyUrl) {
      await tx.insert(searchConsolePropertyConnections).values({
        businessId,
        propertyUri: input.payload.searchVisibility.propertyUrl,
        status: input.payload.searchVisibility.verified ? "connected" : "pending",
      });
    }

    const socialRows = input.payload.socialPresence?.profiles ?? [];
    if (socialRows.length) {
      await tx.insert(socialProfiles).values(
        socialRows.map((p) => ({
          businessId,
          scanId: scan.id,
          platform: p.platform,
          url: p.url,
          handle: p.handle ?? null,
          discoverySource: p.discoverySource,
          confidence: Math.round(p.confidence),
          activityHint: p.activityHint,
          notes: p.notes ?? null,
        })),
      );
    }

    const primaryDomain = normalizeWebsiteForLookup(input.profile.website) ?? input.profile.website;
    if (primaryDomain) {
      await tx.insert(websiteDomains).values({
        domain: primaryDomain,
        role: "primary",
        cmsTarget: "manual",
      });
    }

    if (input.leadCapture?.email) {
      await upsertLeadDb(tx, {
        name: input.leadCapture.name,
        email: input.leadCapture.email,
        phone: input.leadCapture.phone,
        message: input.leadCapture.message,
        source: input.leadCapture.source,
        organizationId: input.organizationId,
        brandId: input.brandId,
        locationId: input.locationId,
        reportPublicId: input.publicId,
        businessId,
        vertical: input.vertical,
        website: input.profile.website ?? undefined,
        placeId: input.profile.placeId ?? input.selectedPlaceId,
      });
    }

    return { businessId, scanId: scan.id, reportId: report.id };
  });
}

export async function getReportWithContext(publicId: string): Promise<ReportContext | null> {
  const db = getDb();
  if (!db) {
    assertMemoryFallbackAllowed();
    const row = memoryStore.getReport(publicId);
    if (!row) return null;
    return {
      publicId: row.publicId,
      payload: row.payload,
      overallScore: row.overallScore,
      opportunityLevel: row.opportunityLevel,
      createdAt: row.createdAt,
      businessId: row.businessId,
      scanId: row.scanId,
      reportId: row.id,
    };
  }

  const [row] = await db
    .select({
      publicId: reports.publicId,
      payload: reports.payload,
      overallScore: reports.overallScore,
      opportunityLevel: reports.opportunityLevel,
      createdAt: reports.createdAt,
      businessId: scans.businessId,
      scanId: scans.id,
      reportId: reports.id,
    })
    .from(reports)
    .innerJoin(scans, eq(reports.scanId, scans.id))
    .where(eq(reports.publicId, publicId))
    .limit(1);

  if (!row) return null;
  return {
    publicId: row.publicId,
    payload: row.payload as ReportPayload,
    overallScore: row.overallScore,
    opportunityLevel: row.opportunityLevel,
    createdAt: row.createdAt.toISOString(),
    businessId: row.businessId,
    scanId: row.scanId,
    reportId: row.reportId,
  };
}

export async function getReportRecord(publicId: string) {
  return getReportWithContext(publicId);
}

export async function listReportSummaries() {
  const db = getDb();
  if (!db) {
    assertMemoryFallbackAllowed();
    return memoryStore.listReports().map((r) => ({
      publicId: r.publicId,
      businessName: r.payload.business.name,
      score: r.overallScore,
      opportunityLevel: r.opportunityLevel,
      createdAt: r.createdAt,
      businessId: r.businessId,
    }));
  }

  const rows = await db
    .select({
      publicId: reports.publicId,
      payload: reports.payload,
      overallScore: reports.overallScore,
      opportunityLevel: reports.opportunityLevel,
      createdAt: reports.createdAt,
      businessId: scans.businessId,
    })
    .from(reports)
    .innerJoin(scans, eq(reports.scanId, scans.id))
    .orderBy(desc(reports.createdAt))
    .limit(200);

  return rows.map((r) => ({
    publicId: r.publicId,
    businessName: (r.payload as ReportPayload).business.name,
    score: r.overallScore,
    opportunityLevel: r.opportunityLevel,
    createdAt: r.createdAt.toISOString(),
    businessId: r.businessId,
  }));
}

export async function listBusinessSummaries() {
  const db = getDb();
  if (!db) {
    assertMemoryFallbackAllowed();
    return memoryStore.listBusinesses().map((b) => ({
      id: b.id,
      name: b.name,
      vertical: b.vertical,
      planTier: b.planTier,
      website: b.website,
      updatedAt: b.updatedAt,
    }));
  }

  const rows = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      vertical: businesses.vertical,
      planTier: businesses.planTier,
      website: businesses.website,
      updatedAt: businesses.updatedAt,
    })
    .from(businesses)
    .orderBy(desc(businesses.updatedAt))
    .limit(200);

  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    vertical: b.vertical,
    planTier: b.planTier,
    website: b.website,
    updatedAt: b.updatedAt.toISOString(),
  }));
}

export async function getWorkspaceBundle(businessId: string) {
  const toIso = (value: Date | string | null | undefined) => {
    if (!value) return new Date(0).toISOString();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
  };
  const db = getDb();
  if (!db) {
    assertMemoryFallbackAllowed();
    const business = memoryStore.getBusiness(businessId);
    if (!business) return null;
    const workspace = memoryStore.listWorkspaceByBusiness(businessId);
    return {
      business,
      ...workspace,
    };
  }

  const sql = getSqlClient();
  const safeBusinessId = /^[0-9a-f-]{36}$/i.test(businessId) ? businessId : null;
  if (sql && !safeBusinessId) return null;
  const businessRows = sql
    ? await sql.unsafe(
        `select id,name,vertical,plan_tier as "planTier",website,phone,address,google_maps_uri as "googleMapsUri",brand_notes as "brandNotes",created_at as "createdAt",updated_at as "updatedAt" from businesses where id='${safeBusinessId}' limit 1`,
      )
    : await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  const business = businessRows[0] as
    | {
        id: string;
        name: string;
        vertical?: string | null;
        planTier?: string | null;
        website?: string | null;
        phone?: string | null;
        address?: string | null;
        googleMapsUri?: string | null;
        brandNotes?: string | null;
        createdAt: Date | string;
        updatedAt: Date | string;
      }
    | undefined;
  if (!business) return null;

  const [snapRows, recRows, contentRows, reportRows, rankRows, auditRows, scRows, placeRows, socialRows] = sql
    ? await Promise.all([
        sql.unsafe(
          `select id,overall_score as "overallScore",opportunity_level as "opportunityLevel",created_at as "createdAt" from visibility_snapshots where business_id='${safeBusinessId}' order by created_at desc limit 20`,
        ),
        sql.unsafe(
          `select id,lane,category,title,detail,impact,status,created_at as "createdAt" from recommendations where business_id='${safeBusinessId}' order by created_at desc limit 60`,
        ),
        sql.unsafe(
          `select id,angle,title,body,status,created_at as "createdAt" from content_opportunities where business_id='${safeBusinessId}' order by created_at desc limit 40`,
        ),
        sql.unsafe(
          `select r.public_id as "publicId",r.overall_score as "overallScore",r.opportunity_level as "opportunityLevel",r.created_at as "createdAt" from reports r inner join scans s on r.scan_id = s.id where s.business_id='${safeBusinessId}' order by r.created_at desc limit 20`,
        ),
        sql.unsafe(
          `select id,query,source,metric_type as "metricType",estimated_position as "estimatedPosition",average_position as "averagePosition",impressions,clicks,ctr,in_top3 as "inTop3",map_pack as "mapPack",confidence,created_at as "createdAt" from ranking_checks where business_id='${safeBusinessId}' order by created_at desc limit 80`,
        ),
        sql.unsafe(
          `select id,category,severity,title,detail,source,estimated,created_at as "createdAt" from audit_findings where business_id='${safeBusinessId}' order by created_at desc limit 80`,
        ),
        sql.unsafe(
          `select id,property_uri as "propertyUri",status,created_at as "createdAt" from search_console_property_connections where business_id='${safeBusinessId}' order by created_at desc limit 10`,
        ),
        sql.unsafe(
          `select id,place_id as "placeId",display_name as "displayName",formatted_address as "formattedAddress",maps_uri as "mapsUri",rating,review_count as "reviewCount",primary_type as "primaryType",business_status as "businessStatus",created_at as "createdAt" from place_profiles where business_id='${safeBusinessId}' order by created_at desc limit 10`,
        ),
        sql.unsafe(
          `select id,platform,url,handle,discovery_source as "discoverySource",confidence,activity_hint as "activityHint",notes,created_at as "createdAt" from social_profiles where business_id='${safeBusinessId}' order by created_at desc limit 80`,
        ),
      ])
    : await Promise.all([
        db
          .select({
            id: visibilitySnapshots.id,
            overallScore: visibilitySnapshots.overallScore,
            opportunityLevel: visibilitySnapshots.opportunityLevel,
            createdAt: visibilitySnapshots.createdAt,
          })
          .from(visibilitySnapshots)
          .where(eq(visibilitySnapshots.businessId, businessId))
          .orderBy(desc(visibilitySnapshots.createdAt))
          .limit(20),
        db.select().from(recommendations).where(eq(recommendations.businessId, businessId)).orderBy(desc(recommendations.createdAt)).limit(60),
        db.select().from(contentOpportunities).where(eq(contentOpportunities.businessId, businessId)).orderBy(desc(contentOpportunities.createdAt)).limit(40),
        db
          .select({
            publicId: reports.publicId,
            overallScore: reports.overallScore,
            opportunityLevel: reports.opportunityLevel,
            createdAt: reports.createdAt,
          })
          .from(reports)
          .innerJoin(scans, eq(reports.scanId, scans.id))
          .where(eq(scans.businessId, businessId))
          .orderBy(desc(reports.createdAt))
          .limit(20),
        db
          .select({
            id: rankingChecks.id,
            query: rankingChecks.query,
            source: rankingChecks.source,
            metricType: rankingChecks.metricType,
            estimatedPosition: rankingChecks.estimatedPosition,
            averagePosition: rankingChecks.averagePosition,
            impressions: rankingChecks.impressions,
            clicks: rankingChecks.clicks,
            ctr: rankingChecks.ctr,
            inTop3: rankingChecks.inTop3,
            mapPack: rankingChecks.mapPack,
            confidence: rankingChecks.confidence,
            createdAt: rankingChecks.createdAt,
          })
          .from(rankingChecks)
          .where(eq(rankingChecks.businessId, businessId))
          .orderBy(desc(rankingChecks.createdAt))
          .limit(80),
        db.select().from(auditFindings).where(eq(auditFindings.businessId, businessId)).orderBy(desc(auditFindings.createdAt)).limit(80),
        db.select().from(searchConsolePropertyConnections).where(eq(searchConsolePropertyConnections.businessId, businessId)).orderBy(desc(searchConsolePropertyConnections.createdAt)).limit(10),
        db
          .select({
            id: placeProfiles.id,
            placeId: placeProfiles.placeId,
            displayName: placeProfiles.displayName,
            formattedAddress: placeProfiles.formattedAddress,
            mapsUri: placeProfiles.mapsUri,
            rating: placeProfiles.rating,
            reviewCount: placeProfiles.reviewCount,
            primaryType: placeProfiles.primaryType,
            businessStatus: placeProfiles.businessStatus,
            createdAt: placeProfiles.createdAt,
          })
          .from(placeProfiles)
          .where(eq(placeProfiles.businessId, businessId))
          .orderBy(desc(placeProfiles.createdAt))
          .limit(10),
        db
          .select({
            id: socialProfiles.id,
            platform: socialProfiles.platform,
            url: socialProfiles.url,
            handle: socialProfiles.handle,
            discoverySource: socialProfiles.discoverySource,
            confidence: socialProfiles.confidence,
            activityHint: socialProfiles.activityHint,
            notes: socialProfiles.notes,
            createdAt: socialProfiles.createdAt,
          })
          .from(socialProfiles)
          .where(eq(socialProfiles.businessId, businessId))
          .orderBy(desc(socialProfiles.createdAt))
          .limit(80),
      ]);

  return {
    business: {
      id: business.id,
      name: business.name,
      vertical: business.vertical ?? null,
      planTier: business.planTier ?? "free",
      website: business.website ?? null,
      phone: business.phone ?? null,
      address: business.address ?? null,
      googleMapsUri: business.googleMapsUri ?? null,
      brandNotes: business.brandNotes ?? null,
      createdAt: toIso(business.createdAt),
      updatedAt: toIso(business.updatedAt),
    },
    snapshots: snapRows.map((s) => ({
      id: s.id,
      overallScore: s.overallScore,
      opportunityLevel: s.opportunityLevel,
      sectionScores: {},
      createdAt: toIso(s.createdAt),
    })),
    recommendations: recRows.map((r) => ({
      id: r.id,
      lane: r.lane,
      category: r.category,
      title: r.title,
      detail: r.detail,
      impact: r.impact,
      status: r.status,
      createdAt: toIso(r.createdAt),
    })),
    content: contentRows.map((c) => ({
      id: c.id,
      angle: c.angle,
      title: c.title,
      body: c.body,
      status: c.status,
      createdAt: toIso(c.createdAt),
    })),
    reports: reportRows.map((r) => ({
      publicId: r.publicId,
      score: r.overallScore,
      opportunityLevel: r.opportunityLevel,
      createdAt: toIso(r.createdAt),
    })),
    rankingChecks: rankRows.map((r) => ({
      id: r.id,
      query: r.query,
      source: r.source,
      metricType: r.metricType,
      estimatedPosition: r.estimatedPosition,
      averagePosition: r.averagePosition,
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: r.ctr,
      inTop3: r.inTop3,
      mapPack: r.mapPack,
      confidence: r.confidence,
      details: null,
      createdAt: toIso(r.createdAt),
    })),
    auditFindings: auditRows.map((a) => ({
      id: a.id,
      category: a.category,
      severity: a.severity,
      title: a.title,
      detail: a.detail,
      source: a.source,
      estimated: a.estimated,
      createdAt: toIso(a.createdAt),
    })),
    searchConsoleConnections: scRows.map((sc) => ({
      id: sc.id,
      propertyUri: sc.propertyUri,
      status: sc.status,
      createdAt: toIso(sc.createdAt),
    })),
    placeProfiles: placeRows.map((p) => ({
      id: p.id,
      placeId: p.placeId,
      displayName: p.displayName,
      formattedAddress: p.formattedAddress,
      mapsUri: p.mapsUri,
      rating: p.rating,
      reviewCount: p.reviewCount,
      primaryType: p.primaryType,
      businessStatus: p.businessStatus,
      createdAt: toIso(p.createdAt),
    })),
    socialProfiles: socialRows.map((s) => ({
      id: s.id,
      platform: s.platform,
      url: s.url,
      handle: s.handle ?? null,
      discoverySource: s.discoverySource,
      confidence: s.confidence,
      activityHint: s.activityHint,
      notes: s.notes ?? null,
      createdAt: toIso(s.createdAt),
    })),
  };
}

export async function saveLeadRecord(input: LeadFormInput) {
  const db = getDb();
  if (!db) {
    assertMemoryFallbackAllowed();
    const emailNormalized = normalizeEmail(input.email);
    if (!emailNormalized) throw new Error("Valid email required");
    const businessId =
      input.businessId ??
      (input.reportPublicId ? memoryStore.getReport(input.reportPublicId)?.businessId ?? null : null) ??
      null;
    const saved = memoryStore.saveLead({
      businessId,
      reportPublicId: input.reportPublicId ?? null,
      name: input.name,
      email: input.email,
      emailNormalized,
      phone: input.phone,
      message: input.message,
      vertical: input.vertical,
      website: input.website ?? null,
      websiteNormalized: normalizeWebsiteForLookup(input.website),
      placeId: input.placeId ?? null,
      source: input.source,
    });
    return { ...saved, businessId };
  }

  return upsertLeadDb(db, input);
}

export async function listLeads(filters?: {
  source?: "all" | string;
  pipelineStatus?: string | "all";
  linked?: "all" | "linked" | "unlinked";
}) {
  const db = getDb();
  if (!db) {
    assertMemoryFallbackAllowed();
    return memoryStore
      .listLeads()
      .filter((lead) => {
        if (filters?.source && filters.source !== "all" && lead.source !== filters.source) return false;
        if (filters?.pipelineStatus && filters.pipelineStatus !== "all" && lead.pipelineStatus !== filters.pipelineStatus)
          return false;
        if (filters?.linked === "linked" && !lead.businessId) return false;
        if (filters?.linked === "unlinked" && lead.businessId) return false;
        return true;
      })
      .map((row) => ({
        ...row,
        sources: row.sources ?? [],
      }));
  }

  const rows = await db.select().from(leads).orderBy(desc(leads.lastSeenAt)).limit(500);
  return rows
    .filter((lead) => {
      if (filters?.source && filters.source !== "all" && lead.source !== filters.source) return false;
      if (filters?.pipelineStatus && filters.pipelineStatus !== "all" && lead.pipelineStatus !== filters.pipelineStatus)
        return false;
      if (filters?.linked === "linked" && !lead.businessId) return false;
      if (filters?.linked === "unlinked" && lead.businessId) return false;
      return true;
    })
    .map((row) => ({
      ...row,
      sources: Array.isArray(row.sources) ? (row.sources as string[]) : [],
      createdAt: row.createdAt.toISOString(),
      firstSeenAt: row.firstSeenAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
    }));
}

export async function listLeadsForBusiness(businessId: string) {
  const db = getDb();
  if (!db) {
    assertMemoryFallbackAllowed();
    return memoryStore.listLeadsForBusiness(businessId);
  }
  const rows = await db
    .select()
    .from(leads)
    .where(eq(leads.businessId, businessId))
    .orderBy(desc(leads.createdAt))
    .limit(100);
  return rows.map((row) => ({
    ...row,
    sources: Array.isArray(row.sources) ? (row.sources as string[]) : [],
    createdAt: row.createdAt.toISOString(),
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  }));
}

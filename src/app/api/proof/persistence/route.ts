import { eq } from "drizzle-orm";
import {
  aiVisibilityChecks,
  auditFindings,
  backlinkOpportunities,
  brands,
  businesses,
  contentQueue,
  contentStrategies,
  getDb,
  leads,
  locations,
  organizations,
  placeProfiles,
  publishedContent,
  publishingJobs,
  recommendations,
  reports,
  scans,
  visibilitySnapshots,
  rankingChecks,
  jobs,
} from "@/lib/db";

export async function GET(req: Request) {
  const db = getDb();
  if (!db) return Response.json({ error: "DATABASE_URL is required" }, { status: 500 });

  try {
    const url = new URL(req.url);
    const businessId = url.searchParams.get("businessId");
    const brandId = url.searchParams.get("brandId");
    const organizationId = url.searchParams.get("organizationId");

    const orgRows = organizationId
      ? await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1)
      : await db.select().from(organizations).orderBy(organizations.createdAt).limit(3);
    const brandRows = brandId
      ? await db.select().from(brands).where(eq(brands.id, brandId)).limit(5)
      : await db.select().from(brands).orderBy(brands.createdAt).limit(5);
    const locationRows = brandId
      ? await db.select().from(locations).where(eq(locations.brandId, brandId)).limit(20)
      : await db.select().from(locations).orderBy(locations.createdAt).limit(20);
    const businessRows = businessId
      ? await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(10)
      : await db.select().from(businesses).orderBy(businesses.createdAt).limit(20);

    const scopedBusinessId = businessId ?? businessRows[0]?.id;

    const [profileRows, scanRows, reportRows, snapshotRows, rankRows, auditRows, recRows, contentStrategyRows, contentRows, leadRows, publishRows, artifactRows, aiRows, backlinkRows, jobRows] =
      scopedBusinessId
        ? await Promise.all([
          db
            .select({
              id: placeProfiles.id,
              businessId: placeProfiles.businessId,
              placeId: placeProfiles.placeId,
              displayName: placeProfiles.displayName,
              createdAt: placeProfiles.createdAt,
            })
            .from(placeProfiles)
            .where(eq(placeProfiles.businessId, scopedBusinessId))
            .limit(20),
          db
            .select({
              id: scans.id,
              businessId: scans.businessId,
              selectedPlaceId: scans.selectedPlaceId,
              createdAt: scans.createdAt,
            })
            .from(scans)
            .where(eq(scans.businessId, scopedBusinessId))
            .limit(20),
          db
            .select({
              id: reports.id,
              publicId: reports.publicId,
              scanId: reports.scanId,
              overallScore: reports.overallScore,
              createdAt: reports.createdAt,
            })
            .from(reports)
            .limit(20),
          db
            .select({
              id: visibilitySnapshots.id,
              businessId: visibilitySnapshots.businessId,
              overallScore: visibilitySnapshots.overallScore,
              source: visibilitySnapshots.source,
              createdAt: visibilitySnapshots.createdAt,
            })
            .from(visibilitySnapshots)
            .where(eq(visibilitySnapshots.businessId, scopedBusinessId))
            .limit(20),
          db
            .select({
              id: rankingChecks.id,
              businessId: rankingChecks.businessId,
              query: rankingChecks.query,
              estimatedPosition: rankingChecks.estimatedPosition,
              createdAt: rankingChecks.createdAt,
            })
            .from(rankingChecks)
            .where(eq(rankingChecks.businessId, scopedBusinessId))
            .limit(20),
          db
            .select({
              id: auditFindings.id,
              businessId: auditFindings.businessId,
              title: auditFindings.title,
              severity: auditFindings.severity,
              createdAt: auditFindings.createdAt,
            })
            .from(auditFindings)
            .where(eq(auditFindings.businessId, scopedBusinessId))
            .limit(20),
          db
            .select({
              id: recommendations.id,
              businessId: recommendations.businessId,
              title: recommendations.title,
              status: recommendations.status,
              createdAt: recommendations.createdAt,
            })
            .from(recommendations)
            .where(eq(recommendations.businessId, scopedBusinessId))
            .limit(20),
          db
            .select({
              id: contentStrategies.id,
              businessId: contentStrategies.businessId,
              strategyWindowDays: contentStrategies.strategyWindowDays,
              createdAt: contentStrategies.createdAt,
            })
            .from(contentStrategies)
            .where(eq(contentStrategies.businessId, scopedBusinessId))
            .limit(20),
          db
            .select({
              id: contentQueue.id,
              businessId: contentQueue.businessId,
              title: contentQueue.title,
              status: contentQueue.status,
              kind: contentQueue.kind,
              createdAt: contentQueue.createdAt,
            })
            .from(contentQueue)
            .where(eq(contentQueue.businessId, scopedBusinessId))
            .limit(20),
          db
            .select({
              id: leads.id,
              businessId: leads.businessId,
              locationId: leads.locationId,
              email: leads.email,
              source: leads.source,
              firstSeenAt: leads.firstSeenAt,
              lastSeenAt: leads.lastSeenAt,
            })
            .from(leads)
            .where(eq(leads.businessId, scopedBusinessId))
            .limit(20),
          db
            .select({
              id: publishingJobs.id,
              queueId: publishingJobs.queueId,
              status: publishingJobs.status,
              createdAt: publishingJobs.createdAt,
            })
            .from(publishingJobs)
            .limit(20),
          db
            .select({
              id: publishedContent.id,
              businessId: publishedContent.businessId,
              queueId: publishedContent.queueId,
              title: publishedContent.title,
              status: publishedContent.status,
              publicUrl: publishedContent.publicUrl,
              createdAt: publishedContent.createdAt,
            })
            .from(publishedContent)
            .where(eq(publishedContent.businessId, scopedBusinessId))
            .limit(20),
          db
            .select({
              id: aiVisibilityChecks.id,
              businessId: aiVisibilityChecks.businessId,
              prompt: aiVisibilityChecks.prompt,
              mentionFound: aiVisibilityChecks.mentionFound,
              createdAt: aiVisibilityChecks.createdAt,
            })
            .from(aiVisibilityChecks)
            .where(eq(aiVisibilityChecks.businessId, scopedBusinessId))
            .limit(20),
          db
            .select({
              id: backlinkOpportunities.id,
              businessId: backlinkOpportunities.businessId,
              sourceName: backlinkOpportunities.sourceName,
              status: backlinkOpportunities.status,
              createdAt: backlinkOpportunities.createdAt,
            })
            .from(backlinkOpportunities)
            .where(eq(backlinkOpportunities.businessId, scopedBusinessId))
            .limit(20),
          db
            .select({
              id: jobs.id,
              businessId: jobs.businessId,
              type: jobs.type,
              status: jobs.status,
              runAfter: jobs.runAfter,
              createdAt: jobs.createdAt,
            })
            .from(jobs)
            .where(eq(jobs.businessId, scopedBusinessId))
            .limit(20),
          ])
        : [[], [], [], [], [], [], [], [], [], [], [], [], [], [], []];

    return Response.json({
      organizationRows: orgRows,
      brandRows,
      locationRows,
      businessRows,
      placeProfiles: profileRows,
      scans: scanRows,
      reports: reportRows,
      visibilitySnapshots: snapshotRows,
      rankingChecks: rankRows,
      auditFindings: auditRows,
      recommendations: recRows,
      contentStrategies: contentStrategyRows,
      contentQueue: contentRows,
      leads: leadRows,
      publishingJobs: publishRows,
      publishedContent: artifactRows,
      aiVisibilityChecks: aiRows,
      backlinkOpportunities: backlinkRows,
      jobs: jobRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown persistence read error";
    return Response.json({ error: message }, { status: 500 });
  }
}

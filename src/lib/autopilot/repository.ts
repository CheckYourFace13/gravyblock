import { and, desc, eq, inArray } from "drizzle-orm";
import {
  aiVisibilityChecks,
  backlinkOpportunities,
  brands,
  businesses,
  citationMonitors,
  contentQueue,
  assertMemoryFallbackAllowed,
  getDb,
  getSqlClient,
  jobs,
  locations,
  operatorTasks,
  publishedContent,
  publishingJobs,
} from "@/lib/db";
import { memoryStore } from "@/lib/db/memory-store";

const toIso = (value: Date | string | null | undefined) => {
  if (!value) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
};

export async function getAutopilotWorkspace(businessId: string) {
  const db = getDb();
  const sql = getSqlClient();
  const safeBusinessId = /^[0-9a-f-]{36}$/i.test(businessId) ? businessId : null;
  if (sql && !safeBusinessId) {
    return {
      contentQueue: [] as Array<{ id: string; title: string; kind: string; status: string; createdAt: string }>,
      backlinkQueue: [] as Array<{ id: string; sourceName: string; status: string; qualityScore: number | null; createdAt: string }>,
      aiVisibilityChecks: [] as Array<{ id: string; prompt: string; mentionFound: string; confidence: number | null; createdAt: string }>,
      operatorTasks: [] as Array<{ id: string; title: string; queue: string; status: string; createdAt: string }>,
      automationJobs: [] as Array<{ id: string; type: string; status: string; createdAt: string }>,
      upcomingJobs: [] as Array<{ id: string; type: string; status: string; runAfter: string | null; createdAt: string }>,
      publishingJobs: [] as Array<{ id: string; status: string; createdAt: string }>,
      publishedContent: [] as Array<{ id: string; title: string; channel: string; publicUrl: string | null; createdAt: string }>,
      citationIssues: [] as Array<{ id: string; sourceName: string; status: string; mismatchNote: string | null; createdAt: string }>,
    };
  }
  if (!db) {
    assertMemoryFallbackAllowed();
    const workspace = memoryStore.listWorkspaceByBusiness(businessId);
    return {
      contentQueue: workspace.content.slice(0, 6).map((c) => ({
        id: c.id,
        title: c.title,
        kind: "article",
        status: "queued",
        createdAt: c.createdAt,
      })),
      backlinkQueue: workspace.recommendations.slice(0, 4).map((r) => ({
        id: r.id,
        sourceName: r.title,
        status: "prospecting",
        qualityScore: 60,
        createdAt: r.createdAt,
      })),
      aiVisibilityChecks: workspace.rankingChecks.slice(0, 4).map((r) => ({
        id: r.id,
        prompt: r.query,
        mentionFound: "false",
        confidence: r.confidence ?? null,
        createdAt: r.createdAt,
      })),
      operatorTasks: workspace.recommendations.slice(0, 5).map((r) => ({
        id: r.id,
        title: r.title,
        queue: "general",
        status: "queued",
        createdAt: r.createdAt,
      })),
      automationJobs: [] as Array<{ id: string; type: string; status: string; createdAt: string }>,
      upcomingJobs: [] as Array<{ id: string; type: string; status: string; runAfter: string | null; createdAt: string }>,
      publishingJobs: [] as Array<{ id: string; status: string; createdAt: string }>,
      publishedContent: [] as Array<{ id: string; title: string; channel: string; publicUrl: string | null; createdAt: string }>,
      citationIssues: [] as Array<{ id: string; sourceName: string; status: string; mismatchNote: string | null; createdAt: string }>,
    };
  }

  const [contentRows, backlinkRows, aiRows, taskRows, jobRows, publishingRows, publishedRows, citationRows] = sql
    ? await Promise.all([
        sql.unsafe(
          `select id,title,kind,status,created_at as "createdAt" from content_queue where business_id='${safeBusinessId}' order by created_at desc limit 20`,
        ),
        sql.unsafe(
          `select id,source_name as "sourceName",status,quality_score as "qualityScore",created_at as "createdAt" from backlink_opportunities where business_id='${safeBusinessId}' order by created_at desc limit 20`,
        ),
        sql.unsafe(
          `select id,prompt,mention_found as "mentionFound",confidence,created_at as "createdAt" from ai_visibility_checks where business_id='${safeBusinessId}' order by created_at desc limit 20`,
        ),
        sql.unsafe(
          `select id,title,queue,status,created_at as "createdAt" from operator_tasks where business_id='${safeBusinessId}' order by created_at desc limit 20`,
        ),
        sql.unsafe(
          `select id,type,status,run_after as "runAfter",created_at as "createdAt" from jobs where business_id='${safeBusinessId}' order by created_at desc limit 20`,
        ),
        sql`select id,status,created_at as "createdAt" from publishing_jobs order by created_at desc limit 20`,
        sql.unsafe(
          `select id,title,channel,public_url as "publicUrl",created_at as "createdAt" from published_content where business_id='${safeBusinessId}' order by created_at desc limit 20`,
        ),
        sql.unsafe(
          `select id,source_name as "sourceName",status,mismatch_note as "mismatchNote",created_at as "createdAt" from citation_monitors where business_id='${safeBusinessId}' order by created_at desc limit 20`,
        ),
      ])
    : await Promise.all([
        db.select().from(contentQueue).where(eq(contentQueue.businessId, businessId)).orderBy(desc(contentQueue.createdAt)).limit(20),
        db
          .select()
          .from(backlinkOpportunities)
          .where(eq(backlinkOpportunities.businessId, businessId))
          .orderBy(desc(backlinkOpportunities.createdAt))
          .limit(20),
        db
          .select()
          .from(aiVisibilityChecks)
          .where(eq(aiVisibilityChecks.businessId, businessId))
          .orderBy(desc(aiVisibilityChecks.createdAt))
          .limit(20),
        db.select().from(operatorTasks).where(eq(operatorTasks.businessId, businessId)).orderBy(desc(operatorTasks.createdAt)).limit(20),
        db.select().from(jobs).where(eq(jobs.businessId, businessId)).orderBy(desc(jobs.createdAt)).limit(20),
        db
          .select()
          .from(publishingJobs)
          .orderBy(desc(publishingJobs.createdAt))
          .limit(20),
        db
          .select()
          .from(publishedContent)
          .where(eq(publishedContent.businessId, businessId))
          .orderBy(desc(publishedContent.createdAt))
          .limit(20),
        db
          .select()
          .from(citationMonitors)
          .where(eq(citationMonitors.businessId, businessId))
          .orderBy(desc(citationMonitors.createdAt))
          .limit(20),
      ]);

  return {
    contentQueue: contentRows.map((c) => ({
      id: c.id,
      title: c.title,
      kind: c.kind,
      status: c.status,
      createdAt: toIso(c.createdAt),
    })),
    backlinkQueue: backlinkRows.map((b) => ({
      id: b.id,
      sourceName: b.sourceName,
      status: b.status,
      qualityScore: b.qualityScore,
      createdAt: toIso(b.createdAt),
    })),
    aiVisibilityChecks: aiRows.map((a) => ({
      id: a.id,
      prompt: a.prompt,
      mentionFound: a.mentionFound,
      confidence: a.confidence,
      createdAt: toIso(a.createdAt),
    })),
    operatorTasks: taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      queue: t.queue,
      status: t.status,
      createdAt: toIso(t.createdAt),
    })),
    automationJobs: jobRows.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      createdAt: toIso(j.createdAt),
    })),
    upcomingJobs: jobRows
      .filter((j) => j.status === "pending")
      .sort((a, b) => {
        const aTime = a.runAfter ? new Date(a.runAfter).getTime() : 0;
        const bTime = b.runAfter ? new Date(b.runAfter).getTime() : 0;
        return aTime - bTime;
      })
      .slice(0, 6)
      .map((j) => ({
        id: j.id,
        type: j.type,
        status: j.status,
        runAfter: j.runAfter ? toIso(j.runAfter) : null,
        createdAt: toIso(j.createdAt),
      })),
    publishingJobs: publishingRows.map((p) => ({
      id: p.id,
      status: p.status,
      createdAt: toIso(p.createdAt),
    })),
    publishedContent: publishedRows.map((p) => ({
      id: p.id,
      title: p.title,
      channel: p.channel,
      publicUrl: p.publicUrl,
      createdAt: toIso(p.createdAt),
    })),
    citationIssues: citationRows.map((c) => ({
      id: c.id,
      sourceName: c.sourceName,
      status: c.status,
      mismatchNote: c.mismatchNote ?? null,
      createdAt: toIso(c.createdAt),
    })),
  };
}

export async function listBrandsOverview() {
  const db = getDb();
  const sql = getSqlClient();
  if (!db) return [] as Array<{ id: string; name: string; businessModel: string; createdAt: string; locationCount: number }>;
  const rows = sql
    ? await sql`select id,name,business_model as "businessModel",created_at as "createdAt" from brands order by created_at desc limit 200`
    : await db.select().from(brands).orderBy(desc(brands.createdAt)).limit(200);
  const locationsRows = sql
    ? await sql`select id,brand_id as "brandId" from locations limit 5000`
    : await db.select({ id: locations.id, brandId: locations.brandId }).from(locations).limit(5000);
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    businessModel: b.businessModel,
    createdAt: toIso(b.createdAt),
    locationCount: locationsRows.filter((l) => l.brandId === b.id).length,
  }));
}

export async function listLocationsOverview() {
  const db = getDb();
  const sql = getSqlClient();
  if (!db) return [] as Array<{ id: string; name: string; locationType: string; createdAt: string }>;
  const rows = sql
    ? await sql`select id,name,location_type as "locationType",created_at as "createdAt" from locations order by created_at desc limit 300`
    : await db.select().from(locations).orderBy(desc(locations.createdAt)).limit(300);
  return rows.map((l) => ({ id: l.id, name: l.name, locationType: l.locationType, createdAt: toIso(l.createdAt) }));
}

export async function getBrandBundle(brandId: string) {
  const db = getDb();
  const sql = getSqlClient();
  const safeBrandId = /^[0-9a-f-]{36}$/i.test(brandId) ? brandId : null;
  if (sql && !safeBrandId) return null;
  if (!db) return null;
  const [brand] = sql
    ? await sql.unsafe(
        `select id,organization_id as "organizationId",name,website,business_model as "businessModel",created_at as "createdAt" from brands where id='${safeBrandId}' limit 1`,
      )
    : await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  const typedBrand = brand as
    | {
        id: string;
        organizationId?: string | null;
        name: string;
        website?: string | null;
        businessModel: string;
        createdAt: Date | string;
      }
    | undefined;
  if (!typedBrand) return null;
  const locationRows = sql
    ? await sql.unsafe(
        `select id,brand_id as "brandId",name,location_type as "locationType",city,state_region as "stateRegion",country,place_id as "placeId",created_at as "createdAt" from locations where brand_id='${safeBrandId}' order by created_at desc limit 200`,
      )
    : await db
        .select()
        .from(locations)
        .where(eq(locations.brandId, brandId))
        .orderBy(desc(locations.createdAt))
        .limit(200);
  return {
    brand: {
      id: typedBrand.id,
      organizationId: typedBrand.organizationId ?? null,
      name: typedBrand.name,
      website: typedBrand.website ?? null,
      businessModel: typedBrand.businessModel,
      createdAt: toIso(typedBrand.createdAt),
    },
    locations: locationRows.map((l) => {
      const row = l as {
        id: string;
        organizationId?: string | null;
        brandId?: string | null;
        name: string;
        locationType: string;
        city?: string | null;
        stateRegion?: string | null;
        country?: string | null;
        placeId?: string | null;
        createdAt: Date | string;
      };
      return {
        id: row.id,
        organizationId: row.organizationId ?? null,
        brandId: row.brandId ?? null,
        name: row.name,
        locationType: row.locationType,
        city: row.city ?? null,
        stateRegion: row.stateRegion ?? null,
        country: row.country ?? null,
        placeId: row.placeId ?? null,
        createdAt: toIso(row.createdAt),
      };
    }),
  };
}

export async function getAutopilotOpsSummary() {
  const db = getDb();
  const sql = getSqlClient();
  if (!db) {
    assertMemoryFallbackAllowed();
    return {
      businessesTracked: memoryStore.listBusinesses().length,
      queuedTasks: 0,
      queuedJobs: 0,
      queuedPublishing: 0,
      entryRecurringPending: 0,
      proRecurringPending: 0,
      queuedCitationOps: 0,
      queuedReviewOps: 0,
      queuedLocalPageContent: 0,
    };
  }
  const [businessRows, taskRows, jobRows, publishingRows, citationTaskRows, reviewTaskRows, localPageRows, entryRows, proRows] = sql
    ? await Promise.all([
        sql`select id from businesses limit 10000`,
        sql`select id from operator_tasks where status='queued' limit 10000`,
        sql`select id from jobs where status='pending' limit 10000`,
        sql`select id from publishing_jobs where status='pending' limit 10000`,
        sql`select id from operator_tasks where status='queued' and queue='citation_ops' limit 10000`,
        sql`select id from operator_tasks where status='queued' and (queue='review_ops' or queue='reputation_ops' or queue='local_trust_ops') limit 10000`,
        sql`select id from content_queue where status='queued' and kind='location_page' limit 10000`,
        sql`select id from jobs where status='pending' and type='entry_monthly_refresh' limit 10000`,
        sql`select id from jobs where status='pending' and type='pro_recurring_refresh' limit 10000`,
      ])
    : await Promise.all([
        db.select({ id: businesses.id }).from(businesses).limit(10000),
        db.select({ id: operatorTasks.id }).from(operatorTasks).where(eq(operatorTasks.status, "queued")).limit(10000),
        db.select({ id: jobs.id }).from(jobs).where(eq(jobs.status, "pending")).limit(10000),
        db.select({ id: publishingJobs.id }).from(publishingJobs).where(eq(publishingJobs.status, "pending")).limit(10000),
        db
          .select({ id: operatorTasks.id })
          .from(operatorTasks)
          .where(and(eq(operatorTasks.status, "queued"), eq(operatorTasks.queue, "citation_ops")))
          .limit(10000),
        db
          .select({ id: operatorTasks.id })
          .from(operatorTasks)
          .where(
            and(
              eq(operatorTasks.status, "queued"),
              inArray(operatorTasks.queue, ["review_ops", "reputation_ops", "local_trust_ops"]),
            ),
          )
          .limit(10000),
        db
          .select({ id: contentQueue.id })
          .from(contentQueue)
          .where(and(eq(contentQueue.status, "queued"), eq(contentQueue.kind, "location_page")))
          .limit(10000),
        db
          .select({ id: jobs.id })
          .from(jobs)
          .where(and(eq(jobs.status, "pending"), eq(jobs.type, "entry_monthly_refresh")))
          .limit(10000),
        db
          .select({ id: jobs.id })
          .from(jobs)
          .where(and(eq(jobs.status, "pending"), eq(jobs.type, "pro_recurring_refresh")))
          .limit(10000),
      ]);
  return {
    businessesTracked: businessRows.length,
    queuedTasks: taskRows.length,
    queuedJobs: jobRows.length,
    queuedPublishing: publishingRows.length,
    entryRecurringPending: entryRows.length,
    proRecurringPending: proRows.length,
    queuedCitationOps: citationTaskRows.length,
    queuedReviewOps: reviewTaskRows.length,
    queuedLocalPageContent: localPageRows.length,
  };
}

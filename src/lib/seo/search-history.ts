/**
 * Read-only Search Console history per site, kept so growth stories can compare "before GravyBlock" with 30, 60 and 90 days after.
 * The first run backfills what Search Console still holds (about 16 months); later runs refresh only the recent days (Search Console revises
 * the latest days for a short while). Also records a weekly index recheck for a site with a pages-dropped finding, so recovery work done by the
 * site's own agent is tracked from Google's side without touching the site.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, jobs, searchDaily } from "@/lib/db";
import { getFreshAccessToken, getGoogleConnection } from "@/lib/integrations/google-oauth";
import { gscQuery } from "@/lib/seo/existing-pages";
import { inspectSample, classifyExclusion } from "@/lib/opportunities/search-driven";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function syncSearchHistory(businessId: string): Promise<{ days: number; backfilled: boolean; reason?: string }> {
  const db = getDb();
  if (!db) return { days: 0, backfilled: false, reason: "no_db" };
  const conn = await getGoogleConnection(businessId).catch(() => null);
  const token = await getFreshAccessToken(businessId).catch(() => null);
  if (!conn?.searchConsoleProperty || !token) return { days: 0, backfilled: false, reason: "not_connected" };
  const [have] = (await db.execute(sql`select count(*)::int n from search_daily where business_id = ${businessId}`)) as unknown as Array<{ n: number }>;
  const backfill = Number(have?.n ?? 0) < 60;
  const end = new Date(Date.now() - 2 * DAY);
  const start = new Date(end.getTime() - (backfill ? 480 : 40) * DAY);
  const rows = await gscQuery(token, conn.searchConsoleProperty, { start: iso(start), end: iso(end) }, ["date"], { rowLimit: 1000 });
  if (!rows) return { days: 0, backfilled: false, reason: "gsc_query_failed" };
  const values = rows
    .filter((r) => r.keys?.[0])
    .map((r) => ({ businessId, day: r.keys![0]!, clicks: Math.round(r.clicks ?? 0), impressions: Math.round(r.impressions ?? 0), position: r.position ?? 0 }));
  for (let i = 0; i < values.length; i += 500) {
    await db
      .insert(searchDaily)
      .values(values.slice(i, i + 500))
      .onConflictDoUpdate({ target: [searchDaily.businessId, searchDaily.day], set: { clicks: sql`excluded.clicks`, impressions: sql`excluded.impressions`, position: sql`excluded.position` } });
  }
  return { days: values.length, backfilled: backfill };
}

/**
 * Weekly re-inspection (Google URL Inspection, read only) of the pages named in a site's open or past pages-dropped finding.
 * Stored as a job so the report and growth story can show index recovery as Google reports it. Does nothing for sites without such a finding.
 */
export async function recheckDroppedPages(businessId: string): Promise<{ checked: number; verdicts: Record<string, number> } | { skipped: string }> {
  const db = getDb();
  if (!db) return { skipped: "no_db" };
  const [opp] = (await db.execute(sql`
    select evidence from growth_opportunities where business_id = ${businessId} and subtype = 'search_pages_dropped' order by created_at desc limit 1`)) as unknown as Array<{ evidence: { sample?: string[]; inspected?: Array<{ page: string }> } | null }>;
  const pages = [...new Set([...(opp?.evidence?.inspected?.map((i) => i.page) ?? []), ...(opp?.evidence?.sample ?? [])])].slice(0, 6);
  if (!pages.length) return { skipped: "no_dropped_pages_finding" };
  const inspected = await inspectSample(businessId, pages);
  const verdicts: Record<string, number> = { noindex_tag: 0, crawled_not_indexed: 0, blocked_other: 0, indexed: 0, unknown: 0 };
  for (const i of inspected) verdicts[classifyExclusion(i.coverage, i.indexing)]!++;
  await db.insert(jobs).values({ businessId, type: "house_index_recheck", status: "completed", payload: { at: new Date().toISOString(), verdicts, pages: inspected } });
  return { checked: inspected.length, verdicts };
}

export async function latestIndexRechecks(businessId: string, limit = 12) {
  const db = getDb();
  if (!db) return [];
  return db
    .select({ createdAt: jobs.createdAt, payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), eq(jobs.type, "house_index_recheck")))
    .orderBy(desc(jobs.createdAt))
    .limit(limit);
}

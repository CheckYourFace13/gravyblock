import { and, desc, eq } from "drizzle-orm";
import { getDb, jobs, publishedContent } from "@/lib/db";
import { isSiteWriteBlocked } from "./write-policy";

export type ManagedFeedBody = {
  version: 1;
  businessId: string;
  generatedAt: string;
  items: Array<{ slug: string; title: string; description: string | null; bodyHtml: string; coverImageUrl: string | null; publishedAt: string }>;
  overrides: Array<{ path: unknown; title: unknown; description: unknown; ogImage: unknown; jsonLd: unknown }>;
};

/** The desired state of a connected site: published items plus the latest active per-path overrides. Shared by the signed HTTP feed and the in-process self connector. */
export async function buildManagedFeed(businessId: string): Promise<ManagedFeedBody> {
  const db = getDb();
  const empty: ManagedFeedBody = { version: 1, businessId, generatedAt: new Date().toISOString(), items: [], overrides: [] };
  if (!db) return empty;
  // House accounts are read-only: their signed feed serves nothing, so no override or article can ever reach their site.
  if (await isSiteWriteBlocked(businessId)) return empty;

  const items = await db
    .select()
    .from(publishedContent)
    .where(and(eq(publishedContent.businessId, businessId), eq(publishedContent.channel, "managed_feed"), eq(publishedContent.status, "published")))
    .orderBy(desc(publishedContent.createdAt))
    .limit(100);

  const overrideRows = await db
    .select({ payload: jobs.payload, createdAt: jobs.createdAt, status: jobs.status })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), eq(jobs.type, "site_override")))
    .orderBy(desc(jobs.createdAt))
    .limit(500);
  const latest = new Map<string, { payload: Record<string, unknown>; status: string }>();
  for (const r of overrideRows) {
    const p = (r.payload ?? {}) as Record<string, unknown>;
    const path = typeof p.path === "string" ? p.path : null;
    if (path && !latest.has(path)) latest.set(path, { payload: p, status: r.status });
  }
  const overrides = [...latest.values()]
    .filter((o) => o.status === "active")
    .map((o) => {
      const p = o.payload;
      return { path: p.path, title: p.title ?? null, description: p.description ?? null, ogImage: p.ogImage ?? null, jsonLd: p.jsonLd ?? null };
    });

  return {
    version: 1,
    businessId,
    generatedAt: new Date().toISOString(),
    items: items.map((i) => {
      const slug = (i.publicUrl ?? "").split("/").filter(Boolean).pop() ?? i.id;
      return {
        slug,
        title: i.title,
        description: i.metaDescription ?? null,
        bodyHtml: i.body,
        coverImageUrl: i.coverImageUrl ?? null,
        publishedAt: i.createdAt.toISOString(),
      };
    }),
    overrides,
  };
}

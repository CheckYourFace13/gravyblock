import type { MetadataRoute } from "next";
import { desc, eq } from "drizzle-orm";
import { getDb, publishedContent } from "@/lib/db";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const staticRoutes: MetadataRoute.Sitemap = [
  { url: siteUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
  { url: `${siteUrl}/scan`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
  { url: `${siteUrl}/for-bars`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  { url: `${siteUrl}/for-breweries`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  { url: `${siteUrl}/for-restaurants`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  { url: `${siteUrl}/for-health-wellness`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = getDb();
  if (!db) return staticRoutes;

  try {
    const published = await db
      .select({ id: publishedContent.id, createdAt: publishedContent.createdAt })
      .from(publishedContent)
      .where(eq(publishedContent.status, "published"))
      .orderBy(desc(publishedContent.createdAt))
      .limit(5000);

    const contentRoutes: MetadataRoute.Sitemap = published.map((row) => ({
      url: `${siteUrl}/published/${row.id}`,
      lastModified: new Date(row.createdAt),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));

    return [...staticRoutes, ...contentRoutes];
  } catch {
    return staticRoutes;
  }
}

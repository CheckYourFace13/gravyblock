import type { MetadataRoute } from "next";
import { desc, eq } from "drizzle-orm";
import { getDb, publishedContent } from "@/lib/db";
import { CITIES, INDUSTRIES } from "@/lib/local-seo/markets";
import { GLOSSARY_TERMS } from "@/lib/content/glossary";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const staticRoutes: MetadataRoute.Sitemap = [
  { url: siteUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
  { url: `${siteUrl}/scan`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
  { url: `${siteUrl}/faq`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  { url: `${siteUrl}/support`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  { url: `${siteUrl}/local-seo`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
  { url: `${siteUrl}/tools`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
  { url: `${siteUrl}/tools/google-business-profile-checker`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
  { url: `${siteUrl}/tools/ai-visibility-test`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
  { url: `${siteUrl}/compare`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
  { url: `${siteUrl}/compare/gravyblock-vs-brightlocal`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/compare/gravyblock-vs-yext`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/compare/gravyblock-vs-semrush-local`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/compare/gravyblock-vs-bulletproof`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/compare/gravyblock-vs-babylovegrowth`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/compare/gravyblock-vs-outreachfrog`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/compare/gravyblock-vs-reputation`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/compare/gravyblock-vs-rankscore`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/compare/gravyblock-vs-adaptify`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/compare/gravyblock-vs-similarweb`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/compare/gravyblock-vs-searchatlas`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/compare/gravyblock-vs-soro`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/glossary`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
  ...GLOSSARY_TERMS.map((t) => ({
    url: `${siteUrl}/glossary/${t.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  })),
  { url: `${siteUrl}/guides`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
  { url: `${siteUrl}/guides/how-to-rank-higher-in-google-maps`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/guides/how-to-improve-local-trust-on-your-website`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/guides/how-to-show-up-in-ai-search-for-local-businesses`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/guides/multi-location-local-seo`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/guides/service-area-business-visibility`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/guides/ai-search-local-businesses`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/guides/social-proof-and-local-conversion`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/guides/website-trust-signals`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/industries`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/for-bars`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  { url: `${siteUrl}/for-breweries`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  { url: `${siteUrl}/for-restaurants`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  { url: `${siteUrl}/for-health-wellness`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  { url: `${siteUrl}/for-plumbers`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/for-dentists`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/for-lawyers`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/for-contractors`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/for-salons`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/for-chiropractors`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  { url: `${siteUrl}/for-real-estate-agents`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
];

const localSeoRoutes: MetadataRoute.Sitemap = CITIES.flatMap((city) =>
  INDUSTRIES.map((industry) => ({
    url: `${siteUrl}/local-seo/${city.slug}/${industry.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  })),
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = getDb();

  let contentRoutes: MetadataRoute.Sitemap = [];
  if (db) {
    try {
      const published = await db
        .select({ id: publishedContent.id, createdAt: publishedContent.createdAt })
        .from(publishedContent)
        .where(eq(publishedContent.status, "published"))
        .orderBy(desc(publishedContent.createdAt))
        .limit(5000);

      contentRoutes = published.map((row) => ({
        url: `${siteUrl}/published/${row.id}`,
        lastModified: new Date(row.createdAt),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      }));
    } catch {
      // non-fatal
    }
  }

  return [...staticRoutes, ...localSeoRoutes, ...contentRoutes];
}

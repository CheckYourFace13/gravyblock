import type { MetadataRoute } from "next";
import { desc, eq } from "drizzle-orm";
import { getDb, publishedContent } from "@/lib/db";
import { CITIES, INDUSTRIES } from "@/lib/local-seo/markets";
import { GLOSSARY_TERMS } from "@/lib/content/glossary";
import { COMPARE_SLUGS } from "@/lib/content/compare-pages";
import { QUESTION_GUIDE_SLUGS } from "@/lib/content/question-guides";
import { INDIVIDUAL_INDUSTRY_PAGES, INDIVIDUAL_INDUSTRY_SLUGS } from "@/lib/content/industries/individual";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const staticRoutes: MetadataRoute.Sitemap = [
  { url: siteUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
  { url: `${siteUrl}/pricing`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
  { url: `${siteUrl}/scan`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
  { url: `${siteUrl}/faq`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  { url: `${siteUrl}/support`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  { url: `${siteUrl}/local-seo`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
  { url: `${siteUrl}/tools`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
  { url: `${siteUrl}/tools/google-business-profile-checker`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
  { url: `${siteUrl}/tools/ai-visibility-test`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
  { url: `${siteUrl}/compare`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
  ...COMPARE_SLUGS.map((slug) => ({
    url: `${siteUrl}/compare/${slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  })),
  { url: `${siteUrl}/glossary`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
  ...GLOSSARY_TERMS.map((t) => ({
    url: `${siteUrl}/glossary/${t.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  })),
  { url: `${siteUrl}/guides`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
  ...QUESTION_GUIDE_SLUGS.map((slug) => ({
    url: `${siteUrl}/guides/${slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  })),
  { url: `${siteUrl}/industries`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
  ...INDIVIDUAL_INDUSTRY_SLUGS.map((slug) => ({
    url: `${siteUrl}/industries/${slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  })),
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

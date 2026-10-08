import type { MetadataRoute } from "next";
import { CITIES, INDUSTRIES } from "@/lib/local-seo/markets";
import { GLOSSARY_TERMS } from "@/lib/content/glossary";
import { COMPARE_SLUGS } from "@/lib/content/compare-pages";
import { QUESTION_GUIDE_SLUGS } from "@/lib/content/question-guides";
import { EXAMPLE_SLUGS } from "@/lib/content/example-pages";
import { INDIVIDUAL_INDUSTRY_SLUGS } from "@/lib/content/industries/individual";
import { INDUSTRY_SLUGS } from "@/lib/content/industries/registry";
import { getAllBlogPosts } from "@/lib/blog/posts";
import { isCityHubIndexable, isCityIndustryIndexable, isLocalDirectoryIndexable } from "@/lib/seo/indexing";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type Entry = MetadataRoute.Sitemap[number];

/**
 * Static entries carry no lastModified: stamping every URL with "now" on each build tells
 * crawlers that everything changed constantly, which is untrue. Only content with a real
 * date (blog posts) sets one.
 */
function entry(path: string, priority: number, changeFrequency: Entry["changeFrequency"] = "monthly"): Entry {
  return { url: path === "" ? siteUrl : `${siteUrl}${path}`, changeFrequency, priority };
}

const VERTICAL_PAGES = [
  "for-bars",
  "for-breweries",
  "for-restaurants",
  "for-health-wellness",
  "for-plumbers",
  "for-dentists",
  "for-lawyers",
  "for-contractors",
  "for-salons",
  "for-chiropractors",
  "for-real-estate-agents",
];

// Guides that are standalone pages rather than entries in QUESTION_GUIDES.
const STANDALONE_GUIDES = [
  "google-3-pack",
  "local-citation-sites-usa",
  "ai-search-local-businesses",
  "multi-location-local-seo",
  "service-area-business-visibility",
  "website-trust-signals",
  "social-proof-and-local-conversion",
];

const staticRoutes: MetadataRoute.Sitemap = [
  entry("", 1, "weekly"),
  entry("/how-it-works", 0.9),
  entry("/features", 0.9),
  entry("/pricing", 0.9),
  entry("/scan", 0.9, "weekly"),
  entry("/proof", 0.6, "weekly"),
  entry("/about", 0.5),
  entry("/contact", 0.5),
  entry("/support", 0.5),
  entry("/faq", 0.6),
  entry("/privacy", 0.3, "yearly"),
  entry("/terms", 0.3, "yearly"),
  entry("/local-seo-statistics", 0.4),
  entry("/tools", 0.8),
  entry("/tools/google-business-profile-checker", 0.8),
  entry("/tools/ai-visibility-test", 0.8),
  entry("/tools/review-link-generator", 0.9),
  entry("/tools/local-seo-roi-calculator", 0.8),
  entry("/compare", 0.8),
  ...COMPARE_SLUGS.map((slug) => entry(`/compare/${slug}`, 0.8)),
  entry("/glossary", 0.7),
  ...GLOSSARY_TERMS.map((t) => entry(`/glossary/${t.slug}`, 0.6)),
  entry("/blog", 0.8, "weekly"),
  entry("/guides", 0.8),
  ...QUESTION_GUIDE_SLUGS.map((slug) => entry(`/guides/${slug}`, 0.7)),
  ...STANDALONE_GUIDES.map((slug) => entry(`/guides/${slug}`, 0.7)),
  entry("/industries", 0.7),
  ...INDUSTRY_SLUGS.map((slug) => entry(`/industries/${slug}`, 0.6)),
  ...INDIVIDUAL_INDUSTRY_SLUGS.map((slug) => entry(`/industries/${slug}`, 0.7)),
  ...VERTICAL_PAGES.map((slug) => entry(`/${slug}`, 0.7)),
  entry("/examples", 0.5),
  entry("/examples/sample-local-growth-report", 0.6),
  ...EXAMPLE_SLUGS.map((slug) => entry(`/examples/${slug}`, 0.5)),
];

// Generated local pages: the single indexing rule in lib/seo/indexing.ts decides, so a page
// is in the sitemap if and only if its robots metadata says index.
const localSeoRoutes: MetadataRoute.Sitemap = [
  ...(isLocalDirectoryIndexable() ? [entry("/local-seo", 0.5)] : []),
  ...CITIES.filter((city) => isCityHubIndexable(city.slug)).map((city) => entry(`/local-seo/${city.slug}`, 0.5)),
  ...CITIES.flatMap((city) =>
    INDUSTRIES.filter((industry) => isCityIndustryIndexable(city.slug, industry.slug)).map((industry) =>
      entry(`/local-seo/${city.slug}/${industry.slug}`, 0.4),
    ),
  ),
];

const blogRoutes: MetadataRoute.Sitemap = getAllBlogPosts().map((post) => ({
  url: `${siteUrl}/blog/${post.slug}`,
  lastModified: new Date(post.updatedAt ?? post.publishedAt),
  changeFrequency: "monthly" as const,
  priority: 0.7,
}));

export default function sitemap(): MetadataRoute.Sitemap {
  // /published/[id] pages are noindexed: the articles live on customer websites
  // (that's the canonical source). Don't include them in the sitemap.
  return [...staticRoutes, ...localSeoRoutes, ...blogRoutes];
}

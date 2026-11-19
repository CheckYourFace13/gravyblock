/**
 * Thin or repetitive pages that were merged into a fuller page. Each old URL answers with a 301 to the page that now covers it (see next.config.ts), is out of the
 * sitemap, and is no longer linked from anywhere. Nothing here may be re-added as a page unless it has enough distinct content of its own.
 */
export type MergedUrl = { source: string; destination: string; reason: string };

/** Business-type pages that repeated one template with a different name. Their business types are now named on the category page that holds the real content. */
export const MERGED_INDUSTRIES: Record<string, { parent: string; name: string }> = {
  plumbers: { parent: "home-services", name: "Plumbers" },
  electricians: { parent: "home-services", name: "Electricians" },
  "hvac-companies": { parent: "home-services", name: "HVAC companies" },
  roofers: { parent: "home-services", name: "Roofers" },
  dentists: { parent: "health-wellness", name: "Dentists" },
  chiropractors: { parent: "health-wellness", name: "Chiropractors" },
  "med-spas": { parent: "health-wellness", name: "Med spas" },
  "gyms-fitness-studios": { parent: "health-wellness", name: "Gyms and fitness studios" },
  salons: { parent: "health-wellness", name: "Salons" },
  veterinarians: { parent: "health-wellness", name: "Veterinarians" },
  lawyers: { parent: "professional-services", name: "Lawyers" },
  accountants: { parent: "professional-services", name: "Accountants" },
  florists: { parent: "local-retail", name: "Florists" },
  "auto-repair-shops": { parent: "auto-trade", name: "Auto repair shops" },
  "apartment-complexes": { parent: "property-venues", name: "Apartment complexes" },
  "property-managers": { parent: "property-venues", name: "Property managers" },
};

const SAMPLE = "/examples/sample-local-growth-report";

export const MERGED_URLS: MergedUrl[] = [
  // examples: two hypothetical timelines and an index that only listed them; the one real example is the sample report built from an actual scan
  { source: "/examples", destination: SAMPLE, reason: "index of examples that now has one real example" },
  { source: "/examples/how-a-local-business-improves-visibility-over-time", destination: SAMPLE, reason: "generic three-line timeline with no real data" },
  { source: "/examples/multi-location-visibility-workflow", destination: SAMPLE, reason: "generic three-line workflow with no real data" },
  // guides merged into the full guide on the same question
  { source: "/guides/how-to-get-more-calls-from-google-business-profile", destination: "/guides/how-to-rank-higher-in-google-maps", reason: "same question, now a section of the Maps guide" },
  { source: "/guides/how-to-improve-local-trust-on-your-website", destination: "/guides/website-trust-signals", reason: "same topic as website trust signals" },
  { source: "/guides/social-proof-and-local-conversion", destination: "/guides/website-trust-signals", reason: "same topic as website trust signals" },
  { source: "/guides/how-to-improve-near-me-conversion", destination: "/guides/website-trust-signals", reason: "now the near-me section of the trust and conversion guide" },
  { source: "/guides/how-to-show-up-in-ai-search-for-local-businesses", destination: "/guides/ai-search-local-businesses", reason: "same question as the AI search guide" },
  { source: "/guides/how-to-build-better-location-pages", destination: "/guides/multi-location-local-seo", reason: "now the location pages section of the multi-location guide" },
  // use-case guides that repeated the industry pages in three lines
  { source: "/guides/local-seo-for-dentists", destination: "/industries/health-wellness", reason: "three-line use-case guide; the industry page holds the content" },
  { source: "/guides/local-seo-for-law-firms", destination: "/industries/professional-services", reason: "three-line use-case guide; the industry page holds the content" },
  { source: "/guides/local-seo-for-apartment-complexes", destination: "/industries/property-venues", reason: "three-line use-case guide; the industry page holds the content" },
  { source: "/guides/local-seo-for-home-services", destination: "/industries/home-services", reason: "three-line use-case guide; the industry page holds the content" },
  ...Object.entries(MERGED_INDUSTRIES).map(([slug, v]) => ({ source: `/industries/${slug}`, destination: `/industries/${v.parent}`, reason: "templated business-type page; named on its category page" })),
];

export const MERGED_SOURCES = new Set(MERGED_URLS.map((m) => m.source));
export const industriesUnder = (parent: string) => Object.values(MERGED_INDUSTRIES).filter((v) => v.parent === parent).map((v) => v.name);

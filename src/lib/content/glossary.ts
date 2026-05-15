export type GlossaryTerm = {
  slug: string;
  term: string;
  definition: string;
  expanded: string;
  relatedTerms: string[];
};

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    slug: "local-seo",
    term: "Local SEO",
    definition:
      "Local SEO is the practice of optimizing a business's online presence so it appears prominently in geographically relevant search results, including Google Maps and the local pack.",
    expanded:
      "Local SEO encompasses your Google Business Profile, NAP consistency across directories, on-page location signals, review acquisition, and local link building. Unlike general SEO, local SEO focuses on proximity, relevance, and prominence — the three core factors Google uses to rank local results. Businesses that invest consistently in local SEO see more calls, direction requests, and walk-in traffic from nearby customers actively looking to buy.",
    relatedTerms: ["google-business-profile", "nap-consistency", "citations", "review-signals"],
  },
  {
    slug: "google-business-profile",
    term: "Google Business Profile",
    definition:
      "Google Business Profile (GBP) is a free listing that controls how your business appears in Google Search and Google Maps, including your name, address, hours, photos, and customer reviews.",
    expanded:
      "A complete and active Google Business Profile is the single most important factor in local search visibility. Google uses GBP data to populate the local pack, Maps results, and Knowledge Panels. Businesses with fully verified profiles, accurate categories, up-to-date hours, and regular photo uploads consistently outrank competitors with sparse or unclaimed listings. GBP also serves as the primary surface where customers leave reviews and ask questions.",
    relatedTerms: ["local-seo", "review-signals", "nap-consistency"],
  },
  {
    slug: "nap-consistency",
    term: "NAP Consistency",
    definition:
      "NAP consistency refers to having your business Name, Address, and Phone number identical across every online listing, directory, and web page where your business appears.",
    expanded:
      "Google cross-references your NAP data from dozens of sources to verify your business is legitimate and correctly located. Inconsistencies — a suite number missing on one listing, a phone number that changed two years ago, or a business name formatted differently — create conflicting signals that reduce Google's confidence and suppress local rankings. AI search tools like ChatGPT and Perplexity also rely on consistent entity data to recommend local businesses, making NAP accuracy critical for both traditional and AI-driven visibility.",
    relatedTerms: ["citations", "local-seo", "google-business-profile", "geo-audit"],
  },
  {
    slug: "ai-search-visibility",
    term: "AI Search Visibility",
    definition:
      "AI search visibility is the likelihood that AI assistants like ChatGPT, Perplexity, and Google's AI Overviews mention or recommend your business when a user asks a local question.",
    expanded:
      "AI tools generate answers by synthesizing information from multiple trusted sources. For local businesses, this means your business facts must be consistent and corroborated across your website, Google Business Profile, major citation sites, and credible local mentions. Businesses with clear, consistent, and well-sourced information are more likely to be cited. Sparse or contradictory data causes AI tools to omit a business entirely, even if its service quality is high.",
    relatedTerms: ["local-seo", "nap-consistency", "geo-audit", "citations"],
  },
  {
    slug: "citations",
    term: "Citations",
    definition:
      "Citations are online mentions of your business's name, address, and phone number on directories, review sites, data aggregators, and local websites — with or without a link.",
    expanded:
      "Citations on authoritative directories like Yelp, Apple Maps, Bing Places, Facebook, and industry-specific sites signal to Google that your business is real, established, and correctly located. Citation volume and accuracy both matter: missing listings reduce your footprint, while inaccurate listings introduce conflicting data that can suppress rankings. Structured citations (with consistent NAP in a standard format) carry the most weight, while unstructured citations (mentions in local news or blog posts) add credibility and corroboration.",
    relatedTerms: ["nap-consistency", "local-seo", "backlinks", "geo-audit"],
  },
  {
    slug: "backlinks",
    term: "Backlinks",
    definition:
      "Backlinks are links from other websites pointing to your site, and they act as votes of authority that help search engines determine how trustworthy and relevant your content is.",
    expanded:
      "For local businesses, the most valuable backlinks come from locally relevant sources: city news sites, chamber of commerce directories, local bloggers, neighborhood association pages, and industry-specific directories. A single link from a reputable local publication can outweigh dozens of links from generic directories. Local backlinks also improve AI search visibility by creating corroborated mentions of your business name and location across trusted web sources.",
    relatedTerms: ["local-seo", "citations", "geo-audit"],
  },
  {
    slug: "geo-audit",
    term: "GEO Audit",
    definition:
      "A GEO (Generative Engine Optimization) audit evaluates how accurately and consistently your business information appears across the sources that AI search tools use to generate answers.",
    expanded:
      "A GEO audit checks whether your business name, address, phone, services, and categories are consistent and corroborated across your website, Google Business Profile, citation sites, social profiles, and high-authority local mentions. It also probes AI tools directly to see whether they mention your business and whether that information is accurate. GEO audits are increasingly important as AI-powered search displaces traditional blue-link results for local queries, and customers start asking assistants rather than searching keywords.",
    relatedTerms: ["ai-search-visibility", "nap-consistency", "citations", "local-seo"],
  },
  {
    slug: "review-signals",
    term: "Review Signals",
    definition:
      "Review signals are the quantity, recency, rating, and sentiment of customer reviews on Google and other platforms, and they directly influence local search rankings and customer conversion.",
    expanded:
      "Google's local ranking algorithm weighs review signals heavily, especially review count, average rating, and whether the business responds to reviews. Recent reviews matter more than old ones — a business with 50 reviews in the past year ranks better than one with 200 reviews from five years ago. Review signals also shape AI search results: tools like ChatGPT and Perplexity often summarize review sentiment when recommending local businesses, making review quality and consistency a factor in both organic and AI-driven discovery.",
    relatedTerms: ["google-business-profile", "local-seo", "ai-search-visibility"],
  },
];

export const GLOSSARY_BY_SLUG: Record<string, GlossaryTerm> = Object.fromEntries(
  GLOSSARY_TERMS.map((t) => [t.slug, t]),
);

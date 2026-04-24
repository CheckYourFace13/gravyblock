import type { SeoPageModel } from "@/components/seo-content-page";

export type ComparePage = {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  model: SeoPageModel;
};

const links = [
  { href: "/examples/sample-local-growth-report", label: "Sample local growth report" },
  { href: "/guides/how-to-rank-higher-in-google-maps", label: "How to rank higher in Google Maps" },
  { href: "/industries", label: "Industry pages" },
];

export const COMPARE_PAGES: Record<string, ComparePage> = {
  "local-seo-audit-tools": {
    slug: "local-seo-audit-tools",
    metaTitle: "Local SEO audit tools comparison | GravyBlock",
    metaDescription: "What local SEO audit tools do well, where they fall short, and how GravyBlock differs with scan-to-workspace workflow.",
    model: {
      eyebrow: "Comparison",
      title: "Local SEO audit tools: what to look for",
      intro: "Most audit tools surface issues. Fewer help you prioritize and keep improvements moving after the first report.",
      meaningForBusiness: "If your team needs recurring execution and visibility tracking, a static audit alone is rarely enough.",
      sections: [
        { title: "What audit tools do well", body: "They help identify technical and listing issues quickly and provide a baseline snapshot." },
        { title: "Where many tools stop short", body: "They often end at PDFs or generic scores without business-specific ongoing workflows." },
        {
          title: "Where GravyBlock fits",
          body: "GravyBlock combines scan insights with a workspace path into Base or Pro recurring monitoring and execution queues.",
          bullets: ["Built for local operators, not enterprise-only teams.", "Focuses on visibility + trust + conversion readiness together.", "Does not promise guaranteed rankings."],
        },
      ],
      relatedLinks: links,
    },
  },
  "google-maps-ranking-tools": {
    slug: "google-maps-ranking-tools",
    metaTitle: "Google Maps ranking tools comparison | GravyBlock",
    metaDescription: "Compare map-ranking tools and approaches with practical guidance for local businesses needing better call and booking outcomes.",
    model: {
      eyebrow: "Comparison",
      title: "Google Maps ranking tools: practical comparison",
      intro: "Maps rankings matter, but business outcomes come from ranking plus trust plus conversion.",
      meaningForBusiness: "Use tooling that helps you improve both visibility and customer decision confidence.",
      sections: [
        { title: "Ranking data is useful, not the whole story", body: "Position tracking helps diagnose movement, but does not explain trust or conversion leakage." },
        { title: "What to prioritize beyond position", body: "Profile quality, website trust, and review patterns often decide whether visibility becomes revenue." },
        { title: "How GravyBlock differs", body: "GravyBlock starts with a free scan and connects findings to recurring local growth workflows." },
      ],
      relatedLinks: links,
    },
  },
  "ai-search-visibility-tools": {
    slug: "ai-search-visibility-tools",
    metaTitle: "AI search visibility tools for local businesses | GravyBlock",
    metaDescription: "Evaluate AI search visibility tools based on factual consistency, trust signals, and practical local growth workflows.",
    model: {
      eyebrow: "Comparison",
      title: "AI search visibility tools: what matters for local businesses",
      intro: "AI visibility tooling is growing fast. Local operators need clear signals, not vague buzzwords.",
      meaningForBusiness: "Pick tools that improve factual consistency and conversion readiness, not just synthetic mention counts.",
      sections: [
        { title: "What a useful AI-visibility workflow includes", body: "Entity consistency checks, source clarity, and practical prioritization tied to local conversions." },
        { title: "Common limitations", body: "Many tools report abstract exposure metrics without helping you improve profile/site coherence." },
        { title: "How GravyBlock approaches AI readiness", body: "It treats AI visibility as part of local trust: profile consistency, website clarity, reviews, and recurring monitoring." },
      ],
      relatedLinks: links,
    },
  },
  "multi-location-seo-tools": {
    slug: "multi-location-seo-tools",
    metaTitle: "Multi-location SEO tools comparison | GravyBlock",
    metaDescription: "Compare multi-location SEO tools and workflows for consistency, trust, and conversion across local footprints.",
    model: {
      eyebrow: "Comparison",
      title: "Multi-location SEO tools: choosing the right workflow",
      intro: "Multi-location visibility fails when consistency and ownership break down across teams.",
      meaningForBusiness: "The best tool for multi-location teams is one that keeps local facts aligned and execution moving over time.",
      sections: [
        { title: "Core requirements", body: "You need consistency checks, location-level visibility context, and operational follow-through." },
        { title: "Common gaps", body: "Many platforms track data but do not make remediation practical for local operators." },
        { title: "GravyBlock fit", body: "GravyBlock supports recurring local readiness checks and workspace workflows for teams that need ongoing momentum." },
      ],
      relatedLinks: links,
    },
  },
};

export const COMPARE_SLUGS = Object.keys(COMPARE_PAGES);

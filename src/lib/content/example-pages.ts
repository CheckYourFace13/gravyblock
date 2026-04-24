import type { SeoPageModel } from "@/components/seo-content-page";

export type ExamplePage = {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  model: SeoPageModel;
};

const links = [
  { href: "/guides", label: "Guide library" },
  { href: "/industries", label: "Industry pages" },
  { href: "/compare/local-seo-audit-tools", label: "Local SEO audit tools comparison" },
];

export const EXAMPLE_PAGES: Record<string, ExamplePage> = {
  "sample-local-growth-report": {
    slug: "sample-local-growth-report",
    metaTitle: "Sample local growth report format | GravyBlock",
    metaDescription: "See what a sample local growth report includes: readiness score, findings, and action priorities.",
    model: {
      eyebrow: "Examples",
      title: "Sample local growth report",
      intro: "This is an anonymized example of how GravyBlock frames visibility and conversion readiness for a local operator.",
      meaningForBusiness: "A useful report should make priorities obvious in minutes and give teams a sequence they can act on.",
      sections: [
        { title: "What a sample report contains", body: "Readiness score, verdict, top findings, and grouped opportunities across profile, trust, and conversion areas." },
        { title: "How owners use it", body: "Owners and operators use the report to align teams around highest-impact fixes first." },
        { title: "Why this format works", body: "It combines clarity for decision-makers with enough detail for execution teams." },
      ],
      relatedLinks: links,
    },
  },
  "how-a-local-business-improves-visibility-over-time": {
    slug: "how-a-local-business-improves-visibility-over-time",
    metaTitle: "How a local business improves visibility over time | GravyBlock",
    metaDescription: "Example progression showing how local businesses improve profile trust, website conversion, and recurring visibility metrics.",
    model: {
      eyebrow: "Examples",
      title: "How a local business improves visibility over time",
      intro: "This example timeline shows practical progress from first scan through recurring monitoring.",
      meaningForBusiness: "Local growth is usually cumulative: better facts, stronger trust, cleaner conversion paths, then recurring optimization.",
      sections: [
        { title: "Month 0: baseline scan", body: "Identify the highest-impact trust and conversion blockers." },
        { title: "Months 1-2: core fixes", body: "Resolve profile inconsistencies, strengthen website trust cues, and improve primary CTAs." },
        { title: "Months 3+: recurring optimization", body: "Use Base or Pro monitoring to catch drift and keep execution cadence." },
      ],
      relatedLinks: links,
    },
  },
  "multi-location-visibility-workflow": {
    slug: "multi-location-visibility-workflow",
    metaTitle: "Multi-location visibility workflow example | GravyBlock",
    metaDescription: "Example workflow for multi-location teams improving local profile consistency, trust, and conversion readiness.",
    model: {
      eyebrow: "Examples",
      title: "Multi-location visibility workflow",
      intro: "This anonymized workflow shows how multi-location teams can standardize local readiness without flattening local nuance.",
      meaningForBusiness: "When teams use one local readiness framework, consistency improves and each location keeps practical autonomy.",
      sections: [
        { title: "Standardize what must match", body: "Define canonical facts, trust requirements, and conversion standards for every location." },
        { title: "Allow location-specific context", body: "Keep local offers, proof, and neighborhood-specific details relevant to each market." },
        { title: "Monitor and remediate continuously", body: "Use recurring checks to find drift and prioritize fixes by impact." },
      ],
      relatedLinks: links,
    },
  },
};

export const EXAMPLE_SLUGS = Object.keys(EXAMPLE_PAGES);

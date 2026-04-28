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
  "gravyblock-vs-brightlocal": {
    slug: "gravyblock-vs-brightlocal",
    metaTitle: "GravyBlock vs BrightLocal: local SEO for small businesses | GravyBlock",
    metaDescription: "How GravyBlock compares to BrightLocal for small business local SEO. GravyBlock runs automation automatically — no monthly manual reports needed.",
    model: {
      eyebrow: "GravyBlock vs BrightLocal",
      title: "GravyBlock vs BrightLocal: which fits your business?",
      intro: "BrightLocal is built for agencies managing many clients. GravyBlock is built for small business owners who want local SEO to run on autopilot without a dedicated marketing team.",
      meaningForBusiness: "If you are a business owner, not an agency, you want a tool that does the work, not one that produces reports you still have to act on yourself.",
      sections: [
        {
          title: "What BrightLocal does well",
          body: "BrightLocal offers deep reporting, citation building services, and white-label options suited to agencies running local SEO for multiple clients.",
        },
        {
          title: "Where BrightLocal is a mismatch for owner-operators",
          body: "BrightLocal is priced and scoped for agencies. Most business owners pay for features they will never use and get reports that require a marketing background to interpret.",
          bullets: [
            "Starts at $39/month for single users, scales up quickly for meaningful features.",
            "Reports are detailed but action-requiring — the business owner still has to execute.",
            "White-label and citation tools are built for agencies, not the business itself.",
          ],
        },
        {
          title: "What GravyBlock does differently",
          body: "GravyBlock starts with a free scan, gives you an immediate visibility score, and on paid plans runs content, outreach, and refresh cycles automatically without you having to log in and execute tasks.",
          bullets: [
            "Free scan shows your score and top gaps in 30 seconds.",
            "Content is generated and queued automatically on Growth and higher plans.",
            "Visibility refreshes run on schedule — weekly on Growth, daily on Agency.",
            "No marketing background required to get value.",
          ],
        },
      ],
      relatedLinks: [
        { href: "/scan", label: "Run a free GravyBlock scan" },
        { href: "/#plans", label: "Compare GravyBlock plans" },
        ...links,
      ],
    },
  },
  "gravyblock-vs-yext": {
    slug: "gravyblock-vs-yext",
    metaTitle: "GravyBlock vs Yext: local search for small businesses | GravyBlock",
    metaDescription: "GravyBlock vs Yext for local search visibility. Yext is enterprise listing management. GravyBlock is automation-first for owner-operated businesses.",
    model: {
      eyebrow: "GravyBlock vs Yext",
      title: "GravyBlock vs Yext: local visibility for owner-operated businesses",
      intro: "Yext is an enterprise listing management platform built for large brands. GravyBlock is an autopilot tool built for owner-operated local businesses who need ongoing visibility without an enterprise budget.",
      meaningForBusiness: "Most small businesses do not need Yext's publisher network at enterprise pricing. They need consistent citations, good content, and recurring scans that tell them what changed.",
      sections: [
        {
          title: "What Yext does well",
          body: "Yext syncs business listings across hundreds of directories and publishers simultaneously, which benefits large multi-location brands that need consistent data at scale.",
        },
        {
          title: "Where Yext is a mismatch for small businesses",
          body: "Yext's pricing starts well above what most small businesses can justify for listing management alone. The platform is designed for brand operations teams, not owner-operators.",
          bullets: [
            "Enterprise pricing that starts at hundreds of dollars per month.",
            "Primarily a listings sync platform — does not generate content or run outreach.",
            "Requires onboarding and ongoing management by a marketing team.",
          ],
        },
        {
          title: "How GravyBlock fits small business local SEO",
          body: "GravyBlock focuses on what actually moves local search rankings for small businesses: visibility score tracking, content generation, review signals, and outreach — all running automatically.",
          bullets: [
            "Free scan in 30 seconds with no account required.",
            "Growth plan at $74.99/month introductory generates content and queues outreach automatically.",
            "No listings-sync lock-in — work that actually improves your Google presence directly.",
          ],
        },
      ],
      relatedLinks: [
        { href: "/scan", label: "Run a free scan now" },
        { href: "/#plans", label: "GravyBlock plans and pricing" },
        ...links,
      ],
    },
  },
  "gravyblock-vs-semrush-local": {
    slug: "gravyblock-vs-semrush-local",
    metaTitle: "GravyBlock vs Semrush Local: local SEO comparison | GravyBlock",
    metaDescription: "GravyBlock vs Semrush for local SEO. Semrush is a broad SEO suite. GravyBlock automates local visibility work so business owners do not need to.",
    model: {
      eyebrow: "GravyBlock vs Semrush",
      title: "GravyBlock vs Semrush Local: do you need an SEO suite or an autopilot?",
      intro: "Semrush is a comprehensive SEO platform built for marketing teams and SEO professionals. GravyBlock is a local autopilot built for business owners who do not have time to learn SEO tooling.",
      meaningForBusiness: "If you already have an SEO team, Semrush gives them data. If you are the owner and the marketing team, GravyBlock does the work instead.",
      sections: [
        {
          title: "What Semrush does well",
          body: "Semrush offers keyword research, backlink analysis, site audits, and local listing management for SEO professionals managing multiple properties.",
        },
        {
          title: "Where Semrush is overkill for local owner-operators",
          body: "Semrush is priced for teams and requires significant SEO expertise to use effectively. Most small business owners pay for a toolset they use 5% of.",
          bullets: [
            "Pro plan starts at $139.95/month — most local businesses use only a fraction of the features.",
            "Requires SEO knowledge to interpret keyword and backlink data meaningfully.",
            "Local-specific features (Listing Management) are an add-on, not core.",
          ],
        },
        {
          title: "Why GravyBlock is different for local businesses",
          body: "GravyBlock replaces the need to learn SEO tools entirely. It scans your local visibility, generates content, sends outreach, and refreshes on a schedule — with no ongoing manual work required.",
          bullets: [
            "No SEO knowledge required: the scan explains your gaps in plain language.",
            "Content is generated for your specific business, city, and keywords.",
            "Starts free. Autopilot plans from $39.99/month introductory.",
          ],
        },
      ],
      relatedLinks: [
        { href: "/scan", label: "Run a free GravyBlock scan" },
        { href: "/local-seo", label: "Local SEO resources" },
        ...links,
      ],
    },
  },
};

export const COMPARE_SLUGS = Object.keys(COMPARE_PAGES);

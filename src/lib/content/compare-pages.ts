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
            "Scale plan at $74.99/month introductory generates content and queues outreach automatically.",
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
  "gravyblock-vs-bulletproof": {
    slug: "gravyblock-vs-bulletproof",
    metaTitle: "GravyBlock vs BulletProof: local SEO for real estate agents | GravyBlock",
    metaDescription: "GravyBlock vs BulletProof for real estate agent local SEO. BulletProof is real-estate-only with coaching. GravyBlock automates the same visibility work for any local business.",
    model: {
      eyebrow: "GravyBlock vs BulletProof",
      title: "GravyBlock vs BulletProof: automated local SEO for real estate agents",
      intro: "BulletProof is a done-for-you local SEO service built exclusively for real estate agents, with live coaching and manual profile management. GravyBlock automates the same core visibility work — Google Posts, citation audits, review monitoring, and ranking snapshots — at a fraction of the cost and without locking you into a real-estate-only platform.",
      meaningForBusiness: "If you are a real estate agent who wants your Google profile active and your citations clean without paying for a concierge service, GravyBlock does the same work automatically on a schedule.",
      sections: [
        {
          title: "What BulletProof does well",
          body: "BulletProof creates 50+ directory profiles, optimizes GBP, publishes 15–100 Google Posts monthly, and provides live coaching calls three times per week. For agents who want full-service hand-holding, it delivers.",
          bullets: [
            "50+ directory profile creation (citations built for you).",
            "Dedicated real estate agent coaching community.",
            "Voice search optimization (Alexa, Siri, Cortana compatibility).",
            "Google Local Service Ads training included.",
          ],
        },
        {
          title: "Where BulletProof is a mismatch",
          body: "BulletProof is exclusively for real estate agents and is priced as a premium service — 'one deal pays for itself' implies a cost well above what most automated platforms charge. It also requires significant time investment for the coaching component.",
          bullets: [
            "Real-estate-only — cannot serve other business types.",
            "High-touch model requires time for coaching calls.",
            "Pricing not publicly listed — typically positioned as a premium investment.",
          ],
        },
        {
          title: "What GravyBlock does differently",
          body: "GravyBlock handles GBP content publishing, citation audits, review monitoring with AI reply drafts, visibility score tracking, and monthly digests automatically — for real estate agents and any other local business — starting at $39.99/month introductory.",
          bullets: [
            "Works for real estate agents and all other local businesses.",
            "GBP posts and content generated and queued automatically.",
            "Citation audit creates a directory checklist monthly.",
            "Review monitoring with AI-drafted replies you copy and post.",
            "No coaching calls required — the platform does the work.",
          ],
        },
      ],
      relatedLinks: [
        { href: "/for-real-estate-agents", label: "GravyBlock for real estate agents" },
        { href: "/scan", label: "Run a free scan" },
        ...links,
      ],
    },
  },
  "gravyblock-vs-babylovegrowth": {
    slug: "gravyblock-vs-babylovegrowth",
    metaTitle: "GravyBlock vs BabyLoveGrowth: local SEO automation comparison | GravyBlock",
    metaDescription: "GravyBlock vs BabyLoveGrowth.ai for automated local SEO. Both publish AI content automatically. GravyBlock adds review monitoring, citation audits, and local visibility tracking built for local businesses.",
    model: {
      eyebrow: "GravyBlock vs BabyLoveGrowth",
      title: "GravyBlock vs BabyLoveGrowth: which autopilot fits your local business?",
      intro: "BabyLoveGrowth.ai is an AI content and backlink automation platform built for any website that wants organic traffic. GravyBlock is built specifically for local businesses — it adds Google Business Profile management, review monitoring, citation audits, and local ranking snapshots that BabyLoveGrowth does not offer.",
      meaningForBusiness: "If you run a local business that needs customers from your city — not just website traffic — you need local-specific tools on top of content: GBP posts, citations, and review signals.",
      sections: [
        {
          title: "What BabyLoveGrowth does well",
          body: "BabyLoveGrowth auto-publishes 30 SEO articles per month, builds backlinks through a 4,000+ site network, tracks AI search brand mentions (ChatGPT, Perplexity), and integrates with WordPress, Webflow, and Shopify automatically.",
          bullets: [
            "30 articles/month auto-published via CMS integrations.",
            "4,000+ site backlink network — automated link exchange.",
            "LLM visibility tracking across ChatGPT and Perplexity.",
            "$99/month with 90-day money-back guarantee.",
          ],
        },
        {
          title: "Where BabyLoveGrowth misses for local businesses",
          body: "BabyLoveGrowth is a content and backlink tool, not a local SEO platform. It does not manage Google Business Profile, does not run citation audits, does not monitor or respond to reviews, and does not track local map pack rankings.",
          bullets: [
            "No Google Business Profile management or GBP post publishing.",
            "No citation/directory consistency checking.",
            "No review monitoring or reply suggestions.",
            "No local visibility score or map pack tracking.",
            "Backlink network is generic — not geo-targeted for local search.",
          ],
        },
        {
          title: "What GravyBlock adds for local businesses",
          body: "GravyBlock combines AI content generation with all the local-specific tools: GBP posts, citation audits, review monitoring with AI replies, competitor comparison, and LLM visibility probes across AI search engines — all running automatically on a schedule.",
          bullets: [
            "GBP post generation and content queue on Growth+ plans.",
            "Monthly citation audit creates a directory fix checklist.",
            "Review monitoring with AI-drafted reply suggestions.",
            "LLM visibility probes: checks if AI search engines mention your business.",
            "WordPress auto-publish when you connect your site.",
            "Starts free with a scan — paid plans from $39.99/month introductory.",
          ],
        },
      ],
      relatedLinks: [
        { href: "/scan", label: "Run a free scan now" },
        { href: "/#plans", label: "See GravyBlock plans" },
        ...links,
      ],
    },
  },
  "gravyblock-vs-outreachfrog": {
    slug: "gravyblock-vs-outreachfrog",
    metaTitle: "GravyBlock vs OutreachFrog: link building for local businesses | GravyBlock",
    metaDescription: "GravyBlock vs OutreachFrog for local business link building. OutreachFrog sells one-off backlinks. GravyBlock finds and queues local link opportunities automatically.",
    model: {
      eyebrow: "GravyBlock vs OutreachFrog",
      title: "GravyBlock vs OutreachFrog: link building that fits local businesses",
      intro: "OutreachFrog is a done-for-you link building service — you pay per backlink placement, they write the content and find the publisher. GravyBlock automates local backlink prospecting, generates outreach email drafts, and combines it with the full local SEO stack: GBP, citations, reviews, and content.",
      meaningForBusiness: "For a local business, the most valuable links are from local chambers, news sites, and industry directories in your city — not generic DA-boosting guest posts. GravyBlock finds those local link opportunities and drafts the outreach automatically.",
      sections: [
        {
          title: "What OutreachFrog does well",
          body: "OutreachFrog places high-quality backlinks on real publisher sites through blogger outreach. They handle content writing, publisher sourcing, and placement — with options from $159 for DA links to $1,199 for enterprise packages.",
          bullets: [
            "Done-for-you: they write the content and find publishers.",
            "10,000+ accounts served; claims to be America's largest dedicated backlink provider.",
            "One-time orders — no subscription commitment.",
          ],
        },
        {
          title: "Where OutreachFrog is a poor fit for local businesses",
          body: "OutreachFrog's network is optimized for domain authority building, not local search relevance. Local map pack rankings depend more on local citations, proximity, GBP signals, and geo-relevant mentions than on generic DA backlinks.",
          bullets: [
            "Per-order pricing: $159–$1,199 per link adds up fast without a subscription.",
            "Generic publisher network — not targeting your city or local niche.",
            "No GBP management, citation audits, review tools, or local rank tracking.",
            "No ongoing automation — each order is a one-time event.",
          ],
        },
        {
          title: "How GravyBlock handles local link building",
          body: "GravyBlock automatically finds local backlink opportunities — chambers of commerce, business associations, local news sites, and niche directories in your city — and generates a personalized outreach email draft for each one. These are the links that actually move local rankings.",
          bullets: [
            "Automated prospect finder runs monthly, targeting your specific city and vertical.",
            "AI-generated outreach emails, ready to send.",
            "Local-first: chambers, associations, news outlets, niche blogs in your area.",
            "Combined with GBP posts, citations, reviews, and content generation.",
            "Included in Growth+ plans — no per-link fees.",
          ],
        },
      ],
      relatedLinks: [
        { href: "/scan", label: "Run a free scan and see your link opportunities" },
        { href: "/#plans", label: "GravyBlock plans" },
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

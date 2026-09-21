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

const BASE_PAGES: Record<string, ComparePage> = {
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
          body: "GravyBlock combines scan insights with a workspace path into Starter, Scale or Pro recurring monitoring and execution queues.",
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

type VsConfig = {
  slug: string;
  name: string;
  metaDescription: string;
  intro: string;
  meaningForBusiness: string;
  doesWell: { body: string; bullets: string[] };
  differenceBody: string;
  extraLinks?: { href: string; label: string }[];
};

/**
 * Comparison pages deliberately avoid stating that a competitor lacks a
 * capability: vendors in this category (listings sync, review requests,
 * reporting, social, automation) add features often. Each page describes what
 * the competitor is known for and how GravyBlock differs in approach and price.
 * GravyBlock's own bullets come from the canonical capability map.
 */
const GRAVYBLOCK_BULLETS = [
  "Free scan shows your score and top gaps in about 60 seconds.",
  "Writes articles and service-area pages from your own website's information and publishes them to your connected WordPress, Webflow or Shopify site, then checks the page is live.",
  "Publishes a weekly Google Business Profile post and adds your own website images to your profile once Google is connected.",
  "Posts Google review replies automatically once Google is connected; Yelp and TripAdvisor replies are drafted for you to paste.",
  "Pitches relevant local organizations for links and only counts a link once it is verified live on their site. Links are never guaranteed.",
  "Checks that your name, phone and address agree across your website, Google, and where connected Yelp and Facebook, and alerts you when they drift. It does not build or fix listings on hundreds of directories.",
  "Monthly AI-visibility checks, weekly Maps rank checks and Search Console data once Google is connected.",
  "Scale plan is $149.99/month; with code GROWTH50 it is $74.99/month, locked for as long as you stay subscribed.",
];

function buildVsPages(): Record<string, ComparePage> {
  const configs: VsConfig[] = [
    {
      slug: "gravyblock-vs-brightlocal",
      name: "BrightLocal",
      metaDescription: "How GravyBlock compares to BrightLocal for small business local SEO: different approach, lower-cost option for owner-operators.",
      intro: "BrightLocal is an established local SEO platform with reporting, listing and review tools that is popular with agencies. GravyBlock is a lower-cost option for small business owners who want scheduled local SEO work handled without a marketing team.",
      meaningForBusiness: "Both can be a good fit depending on whether you want a toolkit to operate or scheduled work handled for you. Check each vendor's current feature list and pricing before deciding.",
      doesWell: {
        body: "BrightLocal is known for local rank tracking, citation and listing tools, review tools and white-label reporting, and today offers a broad set of local SEO features.",
        bullets: ["Reporting and rank tracking widely used by agencies.", "Listing and citation management tools.", "Pricing has generally started from around $39/month; confirm current plans on their site."],
      },
      differenceBody: "GravyBlock focuses on a narrower set of scheduled tasks and is priced for single-location owner-operators.",
    },
    {
      slug: "gravyblock-vs-yext",
      name: "Yext",
      metaDescription: "GravyBlock vs Yext for local search visibility: Yext is a listing and reputation platform; GravyBlock is a lower-cost option focused on content, Google posts and outreach.",
      intro: "Yext is a well-known listings and reputation platform, historically aimed at larger brands and multi-location businesses. GravyBlock is a lower-cost option for owner-operated local businesses.",
      meaningForBusiness: "If you need listings pushed to a large publisher network across many locations, look closely at Yext and similar platforms. If you want scheduled content, Google Business Profile posts and local outreach at a small-business price, GravyBlock may fit.",
      doesWell: {
        body: "Yext syncs business listings across a large publisher network and offers reviews, pages and search tools for larger organizations.",
        bullets: ["Listing sync across many publishers.", "Multi-location management.", "Published pricing has generally started from about $199 per year for entry plans; confirm current plans on their site."],
      },
      differenceBody: "GravyBlock does not sync listings across hundreds of directories. It checks that your details agree across your website, Google, and where connected Yelp and Facebook, and focuses on content, Google posts, review replies and outreach.",
    },
    {
      slug: "gravyblock-vs-bulletproof",
      name: "BulletProof",
      metaDescription: "GravyBlock vs BulletProof for real estate agent local SEO: a coaching-style program versus a lower-cost software option for any local business.",
      intro: "BulletProof is a local SEO program for real estate agents that combines services with coaching. GravyBlock is software that works for any local business, including real estate agents.",
      meaningForBusiness: "If you want a hands-on, coaching-style program built for agents, BulletProof is designed for that. If you prefer a lower-cost software option that runs scheduled work, GravyBlock may fit.",
      doesWell: {
        body: "BulletProof is positioned around real estate agents and combines profile work with coaching for agents who want guided support.",
        bullets: ["Real-estate-specific focus.", "Coaching community.", "Pricing is not publicly listed as far as we know; ask them directly."],
      },
      differenceBody: "GravyBlock has no coaching component and is not real-estate-only. It runs on a schedule after a one-time setup.",
      extraLinks: [{ href: "/for-real-estate-agents", label: "GravyBlock for real estate agents" }],
    },
    {
      slug: "gravyblock-vs-babylovegrowth",
      name: "BabyLoveGrowth",
      metaDescription: "GravyBlock vs BabyLoveGrowth.ai: both publish AI content; GravyBlock is focused on local businesses and Google Business Profile work.",
      intro: "BabyLoveGrowth.ai is an AI content and link-building platform for websites that want organic traffic. GravyBlock is built for local businesses and adds Google Business Profile posts and Google review replies.",
      meaningForBusiness: "If you run a local business that needs customers from your city, compare how each tool handles local signals as well as content.",
      doesWell: {
        body: "BabyLoveGrowth publicly describes automated article publishing to common CMS platforms and link-building features for general websites.",
        bullets: ["Article automation with CMS integrations.", "Link-building network.", "Pricing has been listed from about $99/month; confirm on their site."],
      },
      differenceBody: "GravyBlock is scoped to local businesses: content built from your own website's facts, Google Business Profile work, and outreach to relevant local organizations.",
    },
    {
      slug: "gravyblock-vs-outreachfrog",
      name: "OutreachFrog",
      metaDescription: "GravyBlock vs OutreachFrog: per-link placement service versus a subscription with personalized local outreach that only counts verified links.",
      intro: "OutreachFrog is a link placement service priced per link. GravyBlock includes personalized outreach to relevant local organizations as part of a subscription, with no guarantee of links.",
      meaningForBusiness: "Paying per placement and running your own outreach are different models. GravyBlock never guarantees links and counts a link only once it is verified live on the other site.",
      doesWell: {
        body: "OutreachFrog sells link placements on publisher sites and handles content and sourcing for each order.",
        bullets: ["Done-for-you placements.", "One-time orders rather than a subscription.", "Per-link pricing; confirm current packages on their site."],
      },
      differenceBody: "GravyBlock finds relevant local organizations, pitches one useful page from your website to a real published contact, follows up once, and only counts a link once it is verified live. Replies go to you.",
    },
    {
      slug: "gravyblock-vs-semrush-local",
      name: "Semrush",
      metaDescription: "GravyBlock vs Semrush Local: a broad SEO suite versus a narrower, lower-cost option for local business owners.",
      intro: "Semrush is a broad SEO platform with a local toolkit, used by marketing teams and SEO professionals. GravyBlock is a narrower, lower-cost option for owners who want scheduled local work handled for them.",
      meaningForBusiness: "If you have SEO expertise and want research and analysis tools, Semrush is a strong option. If you want less to configure, GravyBlock may fit.",
      doesWell: {
        body: "Semrush offers keyword research, site audits, backlink analysis and a local toolkit with listing management.",
        bullets: ["Deep keyword and competitor research.", "Site auditing and reporting.", "Pricing has generally started from around $140/month for main plans; confirm on their site."],
      },
      differenceBody: "GravyBlock does not aim to be a research suite. It runs a defined set of local tasks on a schedule.",
    },
    {
      slug: "gravyblock-vs-rankscore",
      name: "RankScore",
      metaDescription: "GravyBlock vs RankScore: content-focused automation versus content plus Google Business Profile posts and Google review replies.",
      intro: "RankScore uses AI to plan, write and publish SEO articles. GravyBlock also publishes website content and adds local work such as Google Business Profile posts and Google review replies.",
      meaningForBusiness: "If your customers find you through Google Maps as well as web search, compare how each tool handles local signals in addition to articles.",
      doesWell: {
        body: "RankScore focuses on keyword targeting matched to your site's authority, topic planning and automated article publishing.",
        bullets: ["Keyword planning tied to site authority.", "Topic cluster planning.", "Pricing has been offered as a lifetime deal at times; confirm current terms."],
      },
      differenceBody: "GravyBlock writes only from facts on your own website, and pairs content with Google Business Profile posts, review replies and local outreach.",
    },
    {
      slug: "gravyblock-vs-adaptify",
      name: "Adaptify",
      metaDescription: "GravyBlock vs Adaptify: an agency-oriented white-label platform versus a self-serve option built for business owners.",
      intro: "Adaptify is an SEO automation platform aimed at agencies serving multiple clients. GravyBlock is a self-serve product for the owner of a local business.",
      meaningForBusiness: "If you are an agency, Adaptify is aimed at you. If you are the business owner, GravyBlock starts with a free scan and self-serve signup.",
      doesWell: {
        body: "Adaptify publicly describes automated content, link and reporting features for agencies, including white-label options.",
        bullets: ["Agency and white-label workflow.", "Content publishing to common CMS platforms.", "Pricing is via demo or agency plans; confirm with them."],
      },
      differenceBody: "GravyBlock is built for a single business and does not guarantee links; outreach is personalized and a link only counts once verified live.",
    },
    {
      slug: "gravyblock-vs-similarweb",
      name: "SimilarWeb",
      metaDescription: "GravyBlock vs SimilarWeb: a traffic analytics platform versus a local SEO product that publishes and posts on a schedule.",
      intro: "SimilarWeb is a traffic and market analytics platform used by analysts and larger teams. GravyBlock is a different kind of product: it publishes local content and posts on a schedule.",
      meaningForBusiness: "If you need competitive traffic analytics, SimilarWeb is built for that. If you want local SEO work done for you, GravyBlock is designed for that.",
      doesWell: {
        body: "SimilarWeb provides traffic estimates, audience data, referral sources and benchmarking across websites and industries.",
        bullets: ["Traffic and engagement estimates.", "Competitor benchmarking.", "Pricing has generally started in the hundreds of dollars per month; confirm on their site."],
      },
      differenceBody: "GravyBlock does not offer market analytics. Competitors are analyzed at scan time, not monitored continuously.",
    },
    {
      slug: "gravyblock-vs-searchatlas",
      name: "Search Atlas",
      metaDescription: "GravyBlock vs Search Atlas: a large SEO toolset versus a narrower, lower-cost option for local business owners.",
      intro: "Search Atlas is a large SEO platform with many tools, including AI-assisted optimization, local rank tracking and content generation. GravyBlock is narrower by design and priced for a single local business.",
      meaningForBusiness: "If you want a broad toolset and are comfortable configuring campaigns, Search Atlas offers a lot. If you want a small set of local tasks handled on a schedule, GravyBlock may fit.",
      doesWell: {
        body: "Search Atlas offers a wide toolset covering rank tracking, content, Google Business Profile management, reporting and AI visibility.",
        bullets: ["Broad toolset.", "Local rank tracking with geogrid views.", "Pricing has generally started from around $99/month; confirm current plans on their site."],
      },
      differenceBody: "GravyBlock does a smaller set of things and asks for a one-time connection of your website, Google account and Facebook Page.",
    },
    {
      slug: "gravyblock-vs-soro",
      name: "Soro",
      metaDescription: "GravyBlock vs Soro: content automation versus content plus Google Business Profile posts and Google review replies for local businesses.",
      intro: "Soro is an automated content platform that finds keywords, writes articles and publishes them. GravyBlock also publishes website content, and adds local work such as Google Business Profile posts and Google review replies.",
      meaningForBusiness: "If most of your customers arrive from blog and web search, a content-focused tool may be enough. If customers find you through Google Maps, compare how each tool handles local signals.",
      doesWell: {
        body: "Soro focuses on simple automated keyword research, article writing in your brand voice, and publishing.",
        bullets: ["Automated content pipeline.", "Brand voice learning.", "Pricing has been listed from around $49/month; confirm on their site."],
      },
      differenceBody: "GravyBlock writes from facts on your own website and pairs articles with Google Business Profile posts, review replies and local outreach.",
    },
    {
      slug: "gravyblock-vs-reputation",
      name: "Reputation.com",
      metaDescription: "GravyBlock vs Reputation.com: an enterprise reputation platform versus a lower-cost option for owner-operated local businesses.",
      intro: "Reputation (Reputation.com) is an enterprise reputation management platform used by larger and multi-location brands. GravyBlock is a lower-cost option for owner-operated local businesses.",
      meaningForBusiness: "Reputation platforms typically offer review requests, listings, surveys and analytics at enterprise scale. GravyBlock covers a smaller set of local tasks at a small-business price.",
      doesWell: {
        body: "Reputation offers review aggregation, review requests, surveys, listings sync and analytics for larger organizations.",
        bullets: ["Enterprise-scale reputation tools.", "Multi-location analytics.", "Pricing is generally quote-based; confirm terms with them."],
      },
      differenceBody: "GravyBlock does not send review requests to your customers. It emails you a weekly reminder and a shareable review link, and it replies to your Google reviews automatically once Google is connected.",
      extraLinks: [{ href: "/guides/how-to-show-up-in-ai-search-for-local-businesses", label: "How to show up in AI search" }],
    },
    {
      slug: "gravyblock-vs-whitespark",
      name: "Whitespark",
      metaDescription: "GravyBlock vs Whitespark: well-regarded citation and rank tools versus scheduled content, Google posts and outreach for owner-operators.",
      intro: "Whitespark makes well-regarded local rank tracking and citation tools, and offers citation building services. GravyBlock is a different approach: scheduled content, Google Business Profile posts, review replies and outreach.",
      meaningForBusiness: "If you want to manage citations and track rankings with dedicated tools, Whitespark is a good fit. If you want a scheduled workflow, GravyBlock may fit.",
      doesWell: {
        body: "Whitespark's Local Rank Tracker and Citation Finder are widely used by local SEO practitioners.",
        bullets: ["Local rank tracking across cities.", "Citation discovery and citation building services.", "Rank tracker pricing has generally started from around $17/month; confirm on their site."],
      },
      differenceBody: "GravyBlock does not build citations across directories. It checks that your details agree across your website, Google, and where connected Yelp and Facebook.",
    },
    {
      slug: "gravyblock-vs-gmb-everywhere",
      name: "GMB Everywhere",
      metaDescription: "GravyBlock vs GMB Everywhere: a Chrome extension for profile research versus a scheduled local SEO product.",
      intro: "GMB Everywhere is a popular Chrome extension for researching Google Business Profiles. GravyBlock is a different kind of product that publishes and posts on a schedule.",
      meaningForBusiness: "They serve different needs: research in the browser versus scheduled work handled for you.",
      doesWell: {
        body: "GMB Everywhere makes it quick to see categories, attributes and review patterns for any Google Business Profile.",
        bullets: ["Fast profile and competitor research.", "Low cost; confirm current pricing on their site."],
      },
      differenceBody: "GravyBlock's free scan covers your Google profile, reviews, citations, website and AI search, and paid plans run content, posting and outreach on a schedule.",
    },
  ];

  const pages: Record<string, ComparePage> = {};
  for (const c of configs) {
    pages[c.slug] = {
      slug: c.slug,
      metaTitle: "GravyBlock vs " + c.name + ": local SEO compared | GravyBlock",
      metaDescription: c.metaDescription,
      model: {
        eyebrow: "GravyBlock vs " + c.name,
        title: "GravyBlock vs " + c.name + ": which fits your business?",
        intro: c.intro,
        meaningForBusiness: c.meaningForBusiness,
        sections: [
          { title: "What " + c.name + " is known for", body: c.doesWell.body, bullets: c.doesWell.bullets },
          { title: "How GravyBlock differs", body: c.differenceBody, bullets: GRAVYBLOCK_BULLETS },
        ],
        relatedLinks: [
          { href: "/scan", label: "Run a free GravyBlock scan" },
          { href: "/pricing", label: "GravyBlock plans and pricing" },
          ...(c.extraLinks ?? []),
          ...links,
        ],
      },
    };
  }
  return pages;
}

export const COMPARE_PAGES: Record<string, ComparePage> = { ...BASE_PAGES, ...buildVsPages() };

export const COMPARE_SLUGS = Object.keys(COMPARE_PAGES);

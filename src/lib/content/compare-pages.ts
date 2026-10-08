import type { SeoPageModel } from "@/components/seo-content-page";

export type ComparePage = {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  model: SeoPageModel;
};

const links = [
  { href: "/how-it-works", label: "How GravyBlock works" },
  { href: "/features", label: "What GravyBlock does, and what it does not" },
  { href: "/examples/sample-local-growth-report", label: "Sample local growth report" },
  { href: "/guides/how-to-rank-higher-in-google-maps", label: "How to rank higher in Google Maps" },
];

/**
 * Differentiation, stated once and honestly: GravyBlock is a simple autonomous system for
 * business owners that decides which worthwhile, eligible local marketing work to do and then
 * does it, so the owner is not operating an SEO toolbox. Many vendors now also act, not just
 * report, so no page here claims that other tools only tell you what is wrong.
 */

const BASE_PAGES: Record<string, ComparePage> = {
  "local-seo-audit-tools": {
    slug: "local-seo-audit-tools",
    metaTitle: "Local SEO audit tools comparison",
    metaDescription:
      "What local SEO audit tools do well, what to check before choosing one, and where GravyBlock's free scan and automatic follow-through fit.",
    model: {
      eyebrow: "Comparison",
      title: "Local SEO audit tools: what to look for",
      intro:
        "Audit tools show you what is wrong with your local presence. Some stop at the report; others now also help act on it. The difference matters more than the score.",
      meaningForBusiness:
        "Decide whether you want a report to act on yourself, or the work done for you. Both are reasonable; they cost different amounts of your time.",
      sections: [
        {
          title: "What audit tools do well",
          body: "They identify technical, listing and review issues quickly and give you a baseline to measure against. Many are inexpensive, and some are free.",
        },
        {
          title: "What to check before you choose",
          body: "Ask what the tool does after the report.",
          bullets: [
            "Does it only list issues, or can it fix some of them?",
            "What does it need access to, and who verifies that a fix actually happened?",
            "Does it re-check over time, or is it a one-time snapshot?",
          ],
        },
        {
          title: "Where GravyBlock fits",
          body: "GravyBlock's free scan is an audit: a visibility score and the top findings, with what GravyBlock would do about each. On Scale, GravyBlock then does the eligible work automatically and verifies it.",
          bullets: [
            "Built for owner-operated local businesses, not enterprise teams.",
            "Starter is monitoring only; automatic work is on Scale and Pro.",
            "It does not promise guaranteed rankings.",
          ],
        },
      ],
      relatedLinks: links,
    },
  },
  "google-maps-ranking-tools": {
    slug: "google-maps-ranking-tools",
    metaTitle: "Google Maps ranking tools comparison",
    metaDescription:
      "How to think about Google Maps ranking tools: what position tracking tells you, what it does not, and how GravyBlock's weekly map checks fit.",
    model: {
      eyebrow: "Comparison",
      title: "Google Maps ranking tools: practical comparison",
      intro: "Maps rankings matter, but business outcomes come from ranking plus trust plus conversion.",
      meaningForBusiness:
        "Use rank data to see whether your work is moving things, and judge the tool by what happens after you see the number.",
      sections: [
        {
          title: "Ranking data is useful, not the whole story",
          body: "Position tracking helps you see movement, but it does not explain trust or why a visitor does or does not call.",
        },
        {
          title: "What to prioritize beyond position",
          body: "Profile completeness, website trust and review patterns often decide whether visibility becomes a customer.",
        },
        {
          title: "How GravyBlock differs",
          body: "GravyBlock checks your local map position weekly on paid plans as one part of its work and reports it alongside what it has done. It is not a dedicated rank-tracking suite, so if detailed geographic ranking views are your main need, a specialized tool may suit you better.",
        },
      ],
      relatedLinks: links,
    },
  },
  "ai-search-visibility-tools": {
    slug: "ai-search-visibility-tools",
    metaTitle: "AI search visibility tools for local businesses",
    metaDescription:
      "What to look for in AI search visibility tools for local businesses, and what GravyBlock's monthly AI mention checks do and do not do.",
    model: {
      eyebrow: "Comparison",
      title: "AI search visibility tools: what matters for local businesses",
      intro:
        "Tools that check whether AI assistants mention your business are multiplying. Local businesses need clear signals, not buzzwords.",
      meaningForBusiness:
        "Judge a tool by whether it helps you improve the facts and pages AI assistants draw on, not only by a mention count.",
      sections: [
        {
          title: "What a useful AI-visibility workflow includes",
          body: "Consistent business facts across your website and profiles, clear source pages, and a way to see whether mentions change over time.",
        },
        {
          title: "What to check",
          body: "Whether a tool only reports mentions or also helps you improve what assistants rely on, and how it handles the fact that assistants give different answers on different days.",
        },
        {
          title: "How GravyBlock approaches AI readiness",
          body: "GravyBlock checks monthly whether AI assistants such as ChatGPT and Perplexity mention your business and reports the result. It treats consistent facts, accurate profiles and good website content as the foundation. It does not yet act automatically on the AI-mention results themselves, and it cannot promise a mention.",
        },
      ],
      relatedLinks: links,
    },
  },
  "multi-location-seo-tools": {
    slug: "multi-location-seo-tools",
    metaTitle: "Multi-location SEO tools comparison",
    metaDescription:
      "What multi-location businesses should look for in SEO tools, and where GravyBlock, which covers one location per subscription, does and does not fit.",
    model: {
      eyebrow: "Comparison",
      title: "Multi-location SEO tools: choosing the right workflow",
      intro: "Multi-location visibility fails when consistency and ownership break down across teams and locations.",
      meaningForBusiness:
        "Pick a tool built for the number of locations you actually run. Platforms designed for large networks and tools designed for single locations make different trade-offs.",
      sections: [
        {
          title: "Core requirements",
          body: "Consistency checks across locations, location-level reporting, and clear ownership of who does what.",
        },
        {
          title: "What to check",
          body: "How a tool prices additional locations, whether each location gets its own profile work, and how much of the work your team still has to do.",
        },
        {
          title: "Where GravyBlock fits",
          body: "Each GravyBlock subscription covers one business location. Owners with a few locations can subscribe once per location. Large franchise or enterprise networks that need centralized controls are better served by platforms built for that scale.",
        },
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
  /** When the competitor is plausibly the better choice. */
  competitorBetter: string[];
  /** When GravyBlock is plausibly the better choice. */
  gravyBetter: string[];
  differenceBody: string;
  extraLinks?: { href: string; label: string }[];
};

/**
 * Comparison pages deliberately avoid stating that a competitor lacks a capability and avoid
 * quoting competitor prices: vendors in this category add features and change plans often.
 * Each page says what the competitor is known for, when it may be the better choice, when
 * GravyBlock may be, and how GravyBlock differs in approach. Always check the vendor's own site
 * for current features and pricing. GravyBlock's own bullets come from the canonical
 * capability map.
 */
const GRAVYBLOCK_BULLETS = [
  "Writes articles and service-area pages from your own website's information and publishes them to your connected WordPress, Webflow or Shopify site, then checks the page is live.",
  "Publishes a weekly Google Business Profile post and adds your own website images to your profile once Google is connected.",
  "Posts Google review replies automatically once Google is connected, and once your booking or invoicing system is connected, asks real completed customers for a review.",
  "Pitches relevant local organizations for links and only counts a link once it is verified live. Links are never guaranteed.",
  "Checks that your name, phone and address agree across your website, Google, and where connected Yelp and Facebook, and alerts you when they drift. It does not build or fix listings on hundreds of directories.",
  "Scale is $149.99/month, or $74.99/month with code GROWTH50, locked for as long as you stay subscribed.",
];

function buildVsPages(): Record<string, ComparePage> {
  const configs: VsConfig[] = [
    {
      slug: "gravyblock-vs-brightlocal",
      name: "BrightLocal",
      metaDescription:
        "How GravyBlock compares to BrightLocal for small business local SEO: a toolkit you operate versus software that decides and does the work.",
      intro:
        "BrightLocal is an established local SEO platform with reporting, listing and review tools that is popular with agencies. GravyBlock is a lower-cost option for small business owners who want that work decided and handled automatically without a marketing team.",
      meaningForBusiness:
        "Both can be a good fit depending on whether you want a toolkit to operate yourself or a system that decides and does the work for you. Check each vendor's current features and pricing before deciding.",
      doesWell: {
        body: "BrightLocal is known for local rank tracking, citation and listing tools, review tools and white-label reporting, and today offers a broad set of local SEO features.",
        bullets: ["Reporting and rank tracking widely used by agencies.", "Listing and citation management tools.", "Review management and local search reporting."],
      },
      competitorBetter: [
        "You or your agency want detailed reporting, rank tracking and citation tools to operate directly.",
        "You manage several clients or locations and want white-label reports.",
      ],
      gravyBetter: [
        "You are a single-location owner who wants the work decided and done for you.",
        "You do not want to learn a toolkit or interpret reports each month.",
      ],
      differenceBody:
        "GravyBlock focuses on a narrower set of automatically chosen actions and is priced for single-location owner-operators.",
    },
    {
      slug: "gravyblock-vs-yext",
      name: "Yext",
      metaDescription:
        "GravyBlock vs Yext for local search visibility: Yext is a listing and reputation platform; GravyBlock is a lower-cost option focused on content, Google posts and outreach.",
      intro:
        "Yext is a well-known listings and reputation platform, historically aimed at larger brands and multi-location businesses. GravyBlock is a lower-cost option for owner-operated local businesses.",
      meaningForBusiness:
        "If you need listings pushed to a large publisher network across many locations, look closely at Yext and similar platforms. If you want content, Google Business Profile posts and local outreach chosen and handled for you automatically at a small-business price, GravyBlock may fit.",
      doesWell: {
        body: "Yext syncs business listings across a large publisher network and offers reviews, pages and search tools for larger organizations.",
        bullets: ["Listing sync across many publishers.", "Multi-location management.", "Tools for larger organizations."],
      },
      competitorBetter: [
        "You need your business data pushed to a large network of publishers and directories.",
        "You run many locations or a franchise and need central controls.",
      ],
      gravyBetter: [
        "You run one business and care more about content, Google posts and local outreach than directory sync.",
        "You want a small-business price and simple setup.",
      ],
      differenceBody:
        "GravyBlock does not sync listings across hundreds of directories. It checks that your details agree across your website, Google, and where connected Yelp and Facebook, and focuses on content, Google posts, review replies and outreach.",
    },
    {
      slug: "gravyblock-vs-bulletproof",
      name: "BulletProof",
      metaDescription:
        "GravyBlock vs BulletProof for real estate agent local SEO: a coaching-style program versus a lower-cost software option for any local business.",
      intro:
        "BulletProof is a local SEO program for real estate agents that combines services with coaching. GravyBlock is software that works for any local business, including real estate agents.",
      meaningForBusiness:
        "If you want a hands-on, coaching-style program built for agents, BulletProof is designed for that. If you prefer a lower-cost software option that decides and does the work itself, GravyBlock may fit.",
      doesWell: {
        body: "BulletProof is positioned around real estate agents and combines profile work with coaching for agents who want guided support.",
        bullets: ["Real-estate-specific focus.", "Coaching community.", "Guided, people-led support."],
      },
      competitorBetter: [
        "You are a real estate agent who wants coaching and a guided program.",
        "You value live, people-led help over software.",
      ],
      gravyBetter: [
        "You want software that works on its own rather than a program you participate in.",
        "You are not a real estate agent, or you want a lower-cost option.",
      ],
      differenceBody:
        "GravyBlock has no coaching component and is not real-estate-only. After a one-time setup, it decides what will help and does it automatically.",
      extraLinks: [{ href: "/for-real-estate-agents", label: "GravyBlock for real estate agents" }],
    },
    {
      slug: "gravyblock-vs-babylovegrowth",
      name: "BabyLoveGrowth",
      metaDescription:
        "GravyBlock vs BabyLoveGrowth.ai: both publish AI content; GravyBlock is focused on local businesses and Google Business Profile work.",
      intro:
        "BabyLoveGrowth.ai is an AI content and link-building platform for websites that want organic traffic. GravyBlock is built for local businesses and adds Google Business Profile posts and Google review replies.",
      meaningForBusiness:
        "If you run a local business that needs customers from your city, compare how each tool handles local signals as well as content.",
      doesWell: {
        body: "BabyLoveGrowth publicly describes automated article publishing to common CMS platforms and link-building features for general websites.",
        bullets: ["Article automation with CMS integrations.", "A link-building network.", "Works for websites that are not local."],
      },
      competitorBetter: [
        "Your goal is web search traffic for a site that is not tied to a local area.",
        "You publish to a CMS GravyBlock does not connect to.",
      ],
      gravyBetter: [
        "Your customers find you through Google Maps and reviews as well as web search.",
        "You want Google Business Profile posts and review replies handled too.",
      ],
      differenceBody:
        "GravyBlock is scoped to local businesses: content built from your own website's facts, Google Business Profile work, and outreach to relevant local organizations.",
    },
    {
      slug: "gravyblock-vs-outreachfrog",
      name: "OutreachFrog",
      metaDescription:
        "GravyBlock vs OutreachFrog: per-link placement service versus a subscription with personalized local outreach that only counts verified links.",
      intro:
        "OutreachFrog is a link placement service priced per link. GravyBlock includes personalized outreach to relevant local organizations as part of a subscription, with no guarantee of links.",
      meaningForBusiness:
        "Paying per placement and having outreach included in a subscription are different models. GravyBlock never guarantees links and counts a link only once it is verified live on the other site.",
      doesWell: {
        body: "OutreachFrog sells link placements on publisher sites and handles content and sourcing for each order.",
        bullets: ["Done-for-you placements.", "One-time orders rather than a subscription.", "You choose how much to buy."],
      },
      competitorBetter: [
        "You want a specific number of link placements ordered and delivered.",
        "You want content placed on publisher sites as a one-time project.",
      ],
      gravyBetter: [
        "You want ongoing outreach to relevant local organizations folded into one subscription.",
        "You prefer earned links to ordered placements, and accept that links are not guaranteed.",
      ],
      differenceBody:
        "GravyBlock finds relevant local organizations, pitches one useful page from your website to a real published contact, follows up once, and only counts a link once it is verified live. Replies go to you.",
    },
    {
      slug: "gravyblock-vs-semrush-local",
      name: "Semrush",
      metaDescription:
        "GravyBlock vs Semrush Local: a broad SEO suite versus a narrower, lower-cost option for local business owners.",
      intro:
        "Semrush is a broad SEO platform with a local toolkit, used by marketing teams and SEO professionals. GravyBlock is a narrower, lower-cost option for owners who want the work chosen and done for them automatically.",
      meaningForBusiness:
        "If you have SEO expertise and want research and analysis tools, Semrush is a strong option. If you want less to configure, GravyBlock may fit.",
      doesWell: {
        body: "Semrush offers keyword research, site audits, backlink analysis and a local toolkit with listing management.",
        bullets: ["Deep keyword and competitor research.", "Site auditing and reporting.", "A broad suite beyond local SEO."],
      },
      competitorBetter: [
        "You want deep keyword and competitor research and have the expertise to use it.",
        "You already use Semrush for other SEO work.",
      ],
      gravyBetter: [
        "You want less to configure and the work done for you.",
        "You only need local visibility work for one business.",
      ],
      differenceBody:
        "GravyBlock does not aim to be a research suite. It decides which local actions are worth taking and does them automatically.",
    },
    {
      slug: "gravyblock-vs-rankscore",
      name: "RankScore",
      metaDescription:
        "GravyBlock vs RankScore: content-focused automation versus content plus Google Business Profile posts and Google review replies.",
      intro:
        "RankScore uses AI to plan, write and publish SEO articles. GravyBlock also publishes website content and adds local work such as Google Business Profile posts and Google review replies.",
      meaningForBusiness:
        "If your customers find you through Google Maps as well as web search, compare how each tool handles local signals in addition to articles.",
      doesWell: {
        body: "RankScore focuses on keyword targeting matched to your site's authority, topic planning and automated article publishing.",
        bullets: ["Keyword planning tied to site authority.", "Topic cluster planning.", "Automated article publishing."],
      },
      competitorBetter: [
        "Your main goal is keyword-driven web search traffic through articles.",
        "You want detailed keyword planning for your site.",
      ],
      gravyBetter: [
        "Local customers find you through Google Maps and reviews, not only web search.",
        "You want articles paired with Google posts, review replies and local outreach.",
      ],
      differenceBody:
        "GravyBlock writes only from facts on your own website, and pairs content with Google Business Profile posts, review replies and local outreach.",
    },
    {
      slug: "gravyblock-vs-adaptify",
      name: "Adaptify",
      metaDescription:
        "GravyBlock vs Adaptify: an agency-oriented white-label platform versus a self-serve option built for business owners.",
      intro:
        "Adaptify is an SEO automation platform aimed at agencies serving multiple clients. GravyBlock is a self-serve product for the owner of a local business.",
      meaningForBusiness:
        "If you are an agency, Adaptify is aimed at you. If you are the business owner, GravyBlock starts with a free scan and self-serve signup.",
      doesWell: {
        body: "Adaptify publicly describes automated content, link and reporting features for agencies, including white-label options.",
        bullets: ["Agency and white-label workflow.", "Content publishing to common CMS platforms.", "Built for managing several clients."],
      },
      competitorBetter: [
        "You are an agency that needs white-label workflows across many clients.",
        "You want to resell automated SEO under your own brand.",
      ],
      gravyBetter: [
        "You are the business owner and want a self-serve product for one business.",
        "You do not want to involve an agency.",
      ],
      differenceBody:
        "GravyBlock is built for a single business and does not guarantee links; outreach is personalized and a link only counts once verified live.",
    },
    {
      slug: "gravyblock-vs-similarweb",
      name: "SimilarWeb",
      metaDescription:
        "GravyBlock vs SimilarWeb: a traffic analytics platform versus a local SEO product that automatically decides what to publish and post.",
      intro:
        "SimilarWeb is a traffic and market analytics platform used by analysts and larger teams. GravyBlock is a different kind of product: it automatically decides what local content and posts will help, and publishes them.",
      meaningForBusiness:
        "If you need competitive traffic analytics, SimilarWeb is built for that. If you want local SEO work done for you, GravyBlock is designed for that.",
      doesWell: {
        body: "SimilarWeb provides traffic estimates, audience data, referral sources and benchmarking across websites and industries.",
        bullets: ["Traffic and engagement estimates.", "Competitor benchmarking.", "Market and audience research."],
      },
      competitorBetter: [
        "You need traffic estimates, audience data or competitive benchmarking.",
        "You are an analyst or marketing team researching a market.",
      ],
      gravyBetter: [
        "You want local SEO work done rather than analytics to interpret.",
        "You run one local business and want a small-business price.",
      ],
      differenceBody:
        "GravyBlock does not offer market analytics. Competitors are analyzed at scan time, not monitored continuously.",
    },
    {
      slug: "gravyblock-vs-searchatlas",
      name: "Search Atlas",
      metaDescription:
        "GravyBlock vs Search Atlas: a large SEO toolset versus a narrower, lower-cost option for local business owners.",
      intro:
        "Search Atlas is a large SEO platform with many tools, including AI-assisted optimization, local rank tracking and content generation. GravyBlock is narrower by design and priced for a single local business.",
      meaningForBusiness:
        "If you want a broad toolset and are comfortable configuring campaigns, Search Atlas offers a lot. If you want local marketing work chosen and handled for you automatically, GravyBlock may fit.",
      doesWell: {
        body: "Search Atlas offers a wide toolset covering rank tracking, content, Google Business Profile management, reporting and AI visibility.",
        bullets: ["Broad toolset.", "Local rank tracking with geogrid views.", "Reporting for several sites or clients."],
      },
      competitorBetter: [
        "You want a broad toolset and are comfortable configuring it.",
        "You manage several sites or clients.",
      ],
      gravyBetter: [
        "You want fewer settings and a defined set of work done automatically.",
        "You only need local visibility work for one business.",
      ],
      differenceBody:
        "GravyBlock does a smaller set of things and asks for a one-time connection of your website, Google account and Facebook Page.",
    },
    {
      slug: "gravyblock-vs-soro",
      name: "Soro",
      metaDescription:
        "GravyBlock vs Soro: content automation versus content plus Google Business Profile posts and Google review replies for local businesses.",
      intro:
        "Soro is an automated content platform that finds keywords, writes articles and publishes them. GravyBlock also publishes website content, and adds local work such as Google Business Profile posts and Google review replies.",
      meaningForBusiness:
        "If most of your customers arrive from blog and web search, a content-focused tool may be enough. If customers find you through Google Maps, compare how each tool handles local signals.",
      doesWell: {
        body: "Soro focuses on simple automated keyword research, article writing in your brand voice, and publishing.",
        bullets: ["Automated content pipeline.", "Brand voice learning.", "Simple, content-focused setup."],
      },
      competitorBetter: [
        "Most of your customers arrive from blog and web search.",
        "You want an automated content pipeline and little else.",
      ],
      gravyBetter: [
        "Customers find you through Google Maps and reviews.",
        "You want Google posts, review replies and local outreach alongside articles.",
      ],
      differenceBody:
        "GravyBlock writes from facts on your own website and pairs articles with Google Business Profile posts, review replies and local outreach.",
    },
    {
      slug: "gravyblock-vs-reputation",
      name: "Reputation.com",
      metaDescription:
        "GravyBlock vs Reputation.com: an enterprise reputation platform versus a lower-cost option for owner-operated local businesses.",
      intro:
        "Reputation (Reputation.com) is an enterprise reputation management platform used by larger and multi-location brands. GravyBlock is a lower-cost option for owner-operated local businesses.",
      meaningForBusiness:
        "Reputation platforms typically offer review requests, listings, surveys and analytics at enterprise scale. GravyBlock covers a smaller set of local tasks at a small-business price.",
      doesWell: {
        body: "Reputation offers review aggregation, review requests, surveys, listings sync and analytics for larger organizations.",
        bullets: ["Enterprise-scale reputation tools.", "Multi-location analytics.", "Surveys and analytics beyond reviews."],
      },
      competitorBetter: [
        "You are a larger or multi-location brand that needs reputation analytics, surveys and central controls.",
        "You need reputation work across many locations.",
      ],
      gravyBetter: [
        "You run one owner-operated business and want review replies and requests handled at a small-business price.",
        "You want reputation work alongside content and Google posts.",
      ],
      differenceBody:
        "Once you connect your booking or invoicing system, GravyBlock automatically emails your real completed customers asking for a review, and it replies to your Google reviews automatically once Google is connected.",
      extraLinks: [{ href: "/guides/how-to-show-up-in-ai-search-for-local-businesses", label: "How to show up in AI search" }],
    },
    {
      slug: "gravyblock-vs-whitespark",
      name: "Whitespark",
      metaDescription:
        "GravyBlock vs Whitespark: well-regarded citation and rank tools versus automated content, Google posts and outreach for owner-operators.",
      intro:
        "Whitespark makes well-regarded local rank tracking and citation tools, and offers citation building services. GravyBlock is a different approach: it automatically decides and does content, Google Business Profile posts, review replies and outreach.",
      meaningForBusiness:
        "If you want to manage citations and track rankings with dedicated tools, Whitespark is a good fit. If you want that decided and done for you automatically, GravyBlock may fit.",
      doesWell: {
        body: "Whitespark's Local Rank Tracker and Citation Finder are widely used by local SEO practitioners.",
        bullets: ["Local rank tracking across cities.", "Citation discovery and citation building services.", "Tools local SEO professionals rely on."],
      },
      competitorBetter: [
        "You want dedicated citation discovery or citation building done for your business.",
        "You want local rank tracking you operate yourself.",
      ],
      gravyBetter: [
        "You want content, Google posts and outreach decided and done for you instead.",
        "You prefer not to manage citation work yourself.",
      ],
      differenceBody:
        "GravyBlock does not build citations across directories. It checks that your details agree across your website, Google, and where connected Yelp and Facebook.",
    },
    {
      slug: "gravyblock-vs-gmb-everywhere",
      name: "GMB Everywhere",
      metaDescription:
        "GravyBlock vs GMB Everywhere: a Chrome extension for profile research versus an automated local SEO product.",
      intro:
        "GMB Everywhere is a popular Chrome extension for researching Google Business Profiles. GravyBlock is a different kind of product that automatically decides what to publish and post.",
      meaningForBusiness:
        "They serve different needs: research in the browser versus work chosen and handled for you automatically.",
      doesWell: {
        body: "GMB Everywhere makes it quick to see categories, attributes and review patterns for any Google Business Profile.",
        bullets: ["Fast profile and competitor research.", "Runs in your browser.", "Useful for one-off checks."],
      },
      competitorBetter: [
        "You want quick, lightweight research on any Google Business Profile.",
        "You are doing a one-off competitor check.",
      ],
      gravyBetter: [
        "You want ongoing work done, not research.",
        "You want your own profile and website improved automatically.",
      ],
      differenceBody:
        "GravyBlock's free scan covers your Google profile, reviews, citations, website and AI search, and paid plans automatically decide and run content, posting and outreach.",
    },
  ];

  const pages: Record<string, ComparePage> = {};
  for (const c of configs) {
    pages[c.slug] = {
      slug: c.slug,
      metaTitle: "GravyBlock vs " + c.name + ": local SEO compared",
      metaDescription: c.metaDescription,
      model: {
        eyebrow: "GravyBlock vs " + c.name,
        title: "GravyBlock vs " + c.name + ": which fits your business?",
        intro: c.intro,
        meaningForBusiness: c.meaningForBusiness,
        sections: [
          { title: "What " + c.name + " is known for", body: c.doesWell.body, bullets: c.doesWell.bullets },
          {
            title: c.name + " may be the better choice if",
            body: "Every business is different. These are the situations where " + c.name + " is the more natural fit.",
            bullets: c.competitorBetter,
          },
          {
            title: "GravyBlock may be the better choice if",
            body: "And these are the situations where GravyBlock is the more natural fit.",
            bullets: c.gravyBetter,
          },
          { title: "How GravyBlock differs", body: c.differenceBody, bullets: GRAVYBLOCK_BULLETS },
          {
            title: "Check current details",
            body: "Features and pricing change often. Confirm " + c.name + "'s current plans and capabilities on its own website before deciding.",
          },
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

  pages["gravyblock-vs-local-seo-agencies"] = {
    slug: "gravyblock-vs-local-seo-agencies",
    metaTitle: "GravyBlock vs local SEO agencies: an honest comparison",
    metaDescription:
      "A fair comparison of hiring a local SEO agency and using GravyBlock: where an agency may be better, where GravyBlock may be, and what to ask before you decide.",
    model: {
      eyebrow: "GravyBlock vs local SEO agencies",
      title: "GravyBlock vs a local SEO agency: which fits your business?",
      intro:
        "An agency gives you people. GravyBlock gives you software that does a defined set of the work automatically. They solve the same problem differently, and either can be right.",
      meaningForBusiness:
        "The right choice depends on how custom your needs are, what you want to spend, and how much you want to manage. Neither is better in every case.",
      directAnswer:
        "Choose an agency if you need custom human strategy or creative campaigns. Choose GravyBlock if you want ongoing local SEO work done continuously, at a lower price, with little work from you.",
      sections: [
        {
          title: "Where an agency may be better",
          body: "A good agency brings judgment and flexibility that software does not.",
          bullets: [
            "Custom human strategy built around your specific business and market.",
            "Highly specialized or very competitive campaigns that need hands-on adjustment.",
            "Unusual businesses that do not fit standard patterns.",
            "Intensive creative work such as photography, video, branding or website redesign.",
            "A person to talk to, who can adapt quickly when your situation changes.",
            "Work GravyBlock does not do, such as large-scale directory building, PR and paid advertising management.",
          ],
        },
        {
          title: "Where GravyBlock may be better",
          body: "GravyBlock is built for owner-operated businesses that want steady execution without managing a vendor.",
          bullets: [
            "Lower cost. Scale is $149.99/month, or $74.99/month with code GROWTH50, locked for as long as you stay subscribed. Agency retainers vary widely, so compare real quotes.",
            "Continuous operation. The work does not wait for a meeting or a monthly report cycle.",
            "Little workload for you. You connect your website, Google account and Facebook Page once, and GravyBlock takes it from there.",
            "Automatic prioritization. It decides which work is worth doing for your business and skips what is not.",
            "Consistent execution. The same checks and actions run every time, without depending on one person's availability.",
            "Integrated measurement. Every action is verified live before it is counted, and results are reported only once confirmed.",
          ],
        },
        {
          title: "What GravyBlock does not replace",
          body: "GravyBlock does not replace strategy, creative work or relationships. It does not design your website, run paid ads, handle public relations, or build listings on hundreds of directories, and it never guarantees rankings, links or traffic. If you need those things, an agency or specialist may be the better route, and some businesses use GravyBlock for the ongoing basics alongside one.",
        },
        {
          title: "Questions worth asking any agency",
          body: "Whichever way you lean, these questions make quotes comparable.",
          bullets: [
            "What exactly will you do each month, and how will I see that it happened?",
            "How do you measure results, and what counts as success?",
            "Is there a contract, and what does cancelling look like?",
            "Who owns the accounts, content and listings if we part ways?",
            "Who will actually do the work, and who will I talk to?",
          ],
        },
        {
          title: "A practical way to decide",
          body: "Start with the free scan to see your visibility score and what GravyBlock would do about each finding. If the list is mostly ongoing basics, GravyBlock may cover it for much less. If it points to custom strategy or creative work, talk to an agency, using the scan as a starting brief.",
        },
      ],
      relatedLinks: [
        { href: "/scan", label: "Run a free GravyBlock scan" },
        { href: "/pricing", label: "GravyBlock plans and pricing" },
        ...links,
      ],
    },
  };

  return pages;
}

export const COMPARE_PAGES: Record<string, ComparePage> = { ...BASE_PAGES, ...buildVsPages() };

export const COMPARE_SLUGS = Object.keys(COMPARE_PAGES);

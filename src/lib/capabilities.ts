/**
 * Canonical capability map — the ONE place that states what GravyBlock's paid
 * plans actually do. Public pages, generated local/industry templates, FAQ
 * answers and emails should read wording from here (or match it exactly) so a
 * stale capability claim can't reappear independently in some template.
 *
 * `status`:
 *  - automatic:        runs on a schedule with no recurring customer action
 *                      once the listed one-time authorization exists
 *  - partial:          part of the job is automatic; `limits` says what is not
 *  - not_implemented:  do NOT claim this publicly
 *
 * `oneTime` lists the one-time connection the customer authorizes. A one-time
 * authorization is not recurring labor.
 *
 * Keep this honest: change `status` only when the engine actually runs in
 * production (see the src/lib modules referenced per entry).
 */

export type CapabilityStatus = "automatic" | "partial" | "not_implemented";

export type Capability = {
  id: string;
  label: string;
  status: CapabilityStatus;
  /** Plan tiers that include it (public names: Starter, Scale, Pro). */
  plans: ("starter" | "growth" | "pro")[];
  oneTime?: string;
  /** Exact public sentence. Only present for automatic/partial capabilities. */
  publicLine?: string;
  /** What is NOT done — used to correct competitors' comparisons and stale copy. */
  limits?: string;
  engine: string;
};

export const CAPABILITIES: Capability[] = [
  {
    id: "website_content",
    label: "Website articles and service pages",
    status: "automatic",
    plans: ["growth", "pro"],
    oneTime: "Connect your website (WordPress, Webflow or Shopify) once",
    publicLine: "Writes articles and service-area pages from your own website's information and publishes them to your connected website, then checks the page is live.",
    limits: "Needs a connected WordPress, Webflow or Shopify site; nothing is written about facts your website does not state.",
    engine: "src/lib/autopilot/content-planner.ts + executor.ts (executeContentPublishPath)",
  },
  {
    id: "existing_page_optimization",
    label: "Improving existing pages from Search Console data",
    status: "not_implemented",
    plans: [],
    engine: "not built",
  },
  {
    id: "gbp_posts",
    label: "Google Business Profile posts",
    status: "automatic",
    plans: ["growth", "pro"],
    oneTime: "Connect Google once",
    publicLine: "Publishes a weekly Google Business Profile post based on a page from your own website.",
    engine: "src/lib/gbp/post-publisher.ts",
  },
  {
    id: "gbp_photos",
    label: "Google Business Profile photos",
    status: "automatic",
    plans: ["growth", "pro"],
    oneTime: "Connect Google once",
    publicLine: "Adds your own website images to your Google profile over time (never stock photos).",
    engine: "src/lib/gbp/photo-uploader.ts",
  },
  {
    id: "gbp_profile_edits",
    label: "Automatic edits to Google profile fields (hours, services, categories)",
    status: "not_implemented",
    plans: [],
    engine: "not built",
  },
  {
    id: "review_monitoring",
    label: "Review monitoring",
    status: "automatic",
    plans: ["starter", "growth", "pro"],
    publicLine: "Monitors new Google, Yelp and TripAdvisor reviews and alerts you.",
    engine: "src/lib/reviews/platform-sync.ts",
  },
  {
    id: "review_replies",
    label: "Review replies",
    status: "partial",
    plans: ["growth", "pro"],
    oneTime: "Connect Google once",
    publicLine: "Posts replies to your Google reviews automatically. Yelp and TripAdvisor don't allow automatic replies through their API, so GravyBlock monitors those reviews and flags anything that needs your attention instead of adding a recurring task to your plate.",
    limits: "Yelp and TripAdvisor do not allow API replies — monitored and flagged only.",
    engine: "src/lib/gbp/review-responder.ts",
  },
  {
    id: "review_requests",
    label: "Review requests sent to your customers",
    status: "partial",
    plans: ["growth", "pro"],
    oneTime: "Connect your booking/invoicing system once so GravyBlock knows who your real completed customers are",
    publicLine: "Once connected, GravyBlock emails every real completed customer the same neutral request to leave a Google review, with one follow-up — no selecting who gets asked, no manual sending.",
    limits: "Needs a connected transaction/customer source; without one, GravyBlock cannot identify real completed customers to ask.",
    engine: "src/lib/reviews/review-request-engine.ts",
  },
  {
    id: "social_posting",
    label: "Facebook and Instagram posting",
    status: "automatic",
    plans: ["growth", "pro"],
    oneTime: "Connect your Facebook Page once",
    publicLine: "Posts to your connected Facebook Page (and Instagram) from your website's own content and your real reviews, with no per-post approval.",
    engine: "src/lib/social/truth-social.ts + facebook-poster.ts + review-spotlight.ts",
  },
  {
    id: "authority_outreach",
    label: "Authority / link outreach",
    status: "partial",
    plans: ["growth", "pro"],
    publicLine: "Finds relevant local organizations, pitches one useful page from your website to a real published contact, follows up once, and only counts a link once it is verified on their site.",
    limits: "No guaranteed links, no purchased or automated link creation, and replies go to you. Unlinked-mention discovery and reply tracking are not automated.",
    engine: "src/lib/authority/engine.ts",
  },
  {
    id: "citations",
    label: "Business listings / citations",
    status: "partial",
    plans: ["starter", "growth", "pro"],
    publicLine: "Checks that your name, phone and address agree across your website, Google, and (where connected) Yelp and Facebook, and tells you when they drift.",
    limits: "Directories that require owner verification or forbid automation are not submitted to automatically. GravyBlock does not build or fix listings on hundreds of directories.",
    engine: "src/lib/citations/engine.ts",
  },
  {
    id: "rank_tracking",
    label: "Ranking checks",
    status: "automatic",
    plans: ["growth", "pro"],
    oneTime: "Connect Google once for Search Console data",
    publicLine: "Tracks local map rankings weekly and Search Console keyword data daily once Google is connected.",
    engine: "src/lib/seo/local-pack-tracker.ts + rank-tracker.ts",
  },
  {
    id: "ai_visibility",
    label: "AI search visibility checks",
    status: "partial",
    plans: ["starter", "growth", "pro"],
    publicLine: "Checks monthly whether AI assistants mention your business.",
    limits: "Results are reported; GravyBlock does not yet automatically act on them.",
    engine: "src/lib/ai-visibility/llm-probes.ts",
  },
  {
    id: "competitor_monitoring",
    label: "Ongoing competitor monitoring",
    status: "not_implemented",
    plans: [],
    engine: "not built (competitors are analyzed at scan time only)",
  },
  {
    id: "sitemap_submission",
    label: "Sitemap submission",
    status: "automatic",
    plans: ["growth", "pro"],
    oneTime: "Connect Google once",
    publicLine: "Submits your sitemap to Google weekly.",
    engine: "src/lib/seo/customer-indexing.ts",
  },
  {
    id: "site_watchdog",
    label: "Website health watchdog",
    status: "partial",
    plans: ["starter", "growth", "pro"],
    publicLine: "Checks your website weekly for broken pages, accidental noindex, and a missing phone link, contact form or analytics, and emails you only when something breaks.",
    limits: "Detects and alerts; it does not repair your site automatically.",
    engine: "src/lib/watchdog/site-watchdog.ts",
  },
  {
    id: "listing_watchdog",
    label: "Google listing change alerts",
    status: "automatic",
    plans: ["starter", "growth", "pro"],
    publicLine: "Alerts you when Google changes your listing's name, address, phone, website or hours.",
    engine: "src/lib/gbp/listing-watchdog.ts",
  },
  {
    id: "reddit_posting",
    label: "Reddit / forum / community posting",
    status: "not_implemented",
    plans: [],
    engine: "disabled",
  },
];

export const CAPABILITY_BY_ID: Record<string, Capability> = Object.fromEntries(CAPABILITIES.map((c) => [c.id, c]));

export type PlanName = "starter" | "growth" | "pro";

/** Public bullets for a plan — only capabilities that are automatic or partial and included in that plan. */
export function publicBullets(plan: PlanName): string[] {
  return CAPABILITIES.filter((c) => c.status !== "not_implemented" && c.publicLine && c.plans.includes(plan)).map((c) => c.publicLine as string);
}

/** Capabilities that must NOT be claimed anywhere public. */
export const NOT_CLAIMABLE: string[] = CAPABILITIES.filter((c) => c.status === "not_implemented").map((c) => c.label);

/** Shared one-liner used by generated local/industry pages. */
export function localPageCapabilityBullets(): string[] {
  return [
    "Writes articles and service-area pages from your own website's information and publishes them to your connected website.",
    "Publishes weekly Google Business Profile posts and adds your own images to your profile (with Google connected).",
    "Replies to Google reviews automatically and monitors Google, Yelp and TripAdvisor reviews.",
    "Posts to your connected Facebook Page and Instagram without per-post approval.",
    "Pitches relevant local organizations for links and only reports a link once it is verified on their site.",
    "Checks that your name, phone and address agree across your website, Google, Yelp and Facebook.",
    "Watches your website weekly and emails you only if something breaks.",
  ];
}

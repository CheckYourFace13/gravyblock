/**
 * Translates a scan finding into what GravyBlock would actually do about it —
 * the sales framing required for the free scan/report: PROBLEM → WHAT
 * GRAVYBLOCK WOULD DO AUTOMATICALLY → WHAT CONNECTION IS NEEDED → WHAT GETS
 * VERIFIED AFTERWARD. Never a plain checklist item telling the visitor to go
 * fix something themselves.
 */

export type AutopilotAction = {
  whatWeDo: string;
  connectionNeeded: string | null; // null = nothing to connect, starts working on signup
  verify: string;
};

const BY_CATEGORY: Record<string, AutopilotAction> = {
  businessSnapshot: {
    whatWeDo: "Keep your core business facts (name, hours, services, address) current everywhere GravyBlock publishes or posts on your behalf.",
    connectionNeeded: null,
    verify: "Facts are re-checked against your live website and Google listing on an ongoing basis.",
  },
  googlePresence: {
    whatWeDo: "Post regularly to your Google Business Profile and keep your listing details aligned with your real business.",
    connectionNeeded: "Connect Google",
    verify: "Google Business Profile insights and your weekly map-pack position.",
  },
  websiteConversionHealth: {
    whatWeDo: "Prioritize the pages with the strongest opportunity and improve eligible pages automatically through your site connection.",
    connectionNeeded: "Connect your website",
    verify: "Live page checks after publishing, plus Search Console clicks and impressions on the affected pages.",
  },
  searchVisibility: {
    whatWeDo: "Target the search queries you're missing with new content and technical fixes, published automatically.",
    connectionNeeded: "Connect your website (and Search Console for verified numbers)",
    verify: "Search Console clicks, impressions, and average position on the targeted queries.",
  },
  localRankingSignals: {
    whatWeDo: "Work the levers that move local rank — profile completeness, review velocity, citation consistency, and fresh content.",
    connectionNeeded: "Connect Google",
    verify: "Real Google Maps pack position, checked weekly.",
  },
  socialPresence: {
    whatWeDo: "Publish relevant updates to your social pages automatically, drawn from your own website's content.",
    connectionNeeded: "Connect Facebook",
    verify: "Posts confirmed live on your connected pages.",
  },
  maps: {
    whatWeDo: "Keep your Google Business Profile active with regular posts and your own photos, so it reads as a maintained, trustworthy listing.",
    connectionNeeded: "Connect Google",
    verify: "Profile freshness and post history in your workspace.",
  },
  reviews: {
    whatWeDo: "Request reviews automatically from real completed customers and reply to new Google reviews as they come in.",
    connectionNeeded: "Connect your booking/invoicing system (for requests) and Google (for replies)",
    verify: "Review count and rating trend versus nearby competitors.",
  },
  ai_visibility: {
    whatWeDo: "Strengthen the facts and content that AI assistants pull from — your site, your listing, and your reviews — so answers describe you accurately.",
    connectionNeeded: null,
    verify: "Monthly checks of what ChatGPT, Perplexity, and Gemini say when asked about businesses like yours.",
  },
  priority: {
    whatWeDo: "Take this on first — it's ranked ahead of your other findings because it carries the most upside for the least risk.",
    connectionNeeded: "Depends on the fix — shown once you're in your workspace",
    verify: "Tracked against your baseline and reported once there's a real, measured result.",
  },
};

const DEFAULT_ACTION: AutopilotAction = {
  whatWeDo: "Evaluate this against everything else GravyBlock could do for your business, and act on it automatically when it's worth the effort.",
  connectionNeeded: "Depends on the fix — shown once you're in your workspace",
  verify: "Tracked against your baseline and reported once there's a real, measured result.",
};

export function describeAutopilotAction(category: string): AutopilotAction {
  return BY_CATEGORY[category] ?? DEFAULT_ACTION;
}

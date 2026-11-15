/**
 * GravyBlock's video BRIEFS: the subjects and customer questions its own marketing videos must cover. A brief is not a script. The AI concept planner (video/concepts/tour-planner.ts) turns each one
 * into a distinct video (hook, story, wording, real workflow, payoff, closing) from Product Truth and the real site, and the similarity gates keep the set different from one another.
 * `slot` says where an owner-approved video belongs on gravyblock.com (see PlacedVideo); nothing is placed until the owner has approved that video.
 */
import { TOPICS } from "./gravyblock-topics";
import type { Brief } from "./video/concepts/tour-planner";

const SCAN = "https://gravyblock.com/scan";
const topic = (key: string) => {
  const t = TOPICS.find((x) => x.key === key);
  if (!t) throw new Error(`no GravyBlock topic ${key}`);
  return t;
};
const fromTopic = (key: string, over: Partial<Brief> = {}): Brief => {
  const t = topic(key);
  return { angleId: `gravyblock-${t.key}`, key: t.key, role: t.role, title: t.title, goal: t.goal, audience: t.audience, coreBenefit: t.coreBenefit, features: t.features, ctaText: t.ctaText, ctaUrl: t.ctaUrl, funnel: t.funnel, ...over };
};

export type RolloutBrief = Brief & { slot: string; page: string };

export const GRAVYBLOCK_BRIEFS: RolloutBrief[] = [
  { angleId: "gravyblock-local-seo-that-does-the-work-for-you", key: "local-seo-that-does-the-work-for-you", role: "A", title: "What GravyBlock actually does", goal: "answer, plainly and visibly, what GravyBlock is and what it does for a small business", audience: "a small business owner who has just heard of GravyBlock", coreBenefit: "a clear picture of the product in one watch", features: ["reads the business", "chooses work", "does eligible work", "verifies it"], ctaText: "Scan my business free", ctaUrl: SCAN, funnel: "cold", slot: "home-what-it-does", page: "/" },
  { angleId: "gravyblock-the-free-scan-step-by-step", key: "the-free-scan-step-by-step", role: "B", title: "From the free scan to work getting done", goal: "show how a business goes from the free scan, to a score and findings, to GravyBlock doing the work", audience: "someone about to run the free scan", coreBenefit: "the scan leads somewhere: work is chosen, done and checked", features: ["free scan", "score and findings", "connect", "work done"], ctaText: "Run my free scan", ctaUrl: SCAN, funnel: "high_intent", slot: "scan-free-scan-to-action", page: "/scan" },
  fromTopic("autonomous-marketing", { title: "Marketing without adding work to your plate", goal: "show how marketing gets done without a new to-do list landing on the owner", slot: "home-no-extra-work", page: "/" } as Partial<Brief>) as RolloutBrief,
  fromTopic("marketing-studio", { title: "Marketing Studio: videos made from your real website", slot: "marketing-studio-page", page: "/marketing-studio" } as Partial<Brief>) as RolloutBrief,
  { angleId: "gravyblock-proof-the-work-actually-happened", key: "proof-the-work-actually-happened", role: "C", title: "Proof that the work actually happened", goal: "show the real proof page: work confirmed at an external destination, in three honest levels", audience: "an owner burned by vague SEO reports", coreBenefit: "work is checked where it lands, and the claims stay honest", features: ["verified action", "three levels of proof", "live numbers"], ctaText: "See the proof", ctaUrl: "https://gravyblock.com/proof", funnel: "interested", slot: "proof-page", page: "/proof" },
  fromTopic("local-search-growth", { title: "Local visibility: finding and acting on local search opportunities", slot: "local-seo-page", page: "/local-seo" } as Partial<Brief>) as RolloutBrief,
  fromTopic("business-truth", { title: "Business Truth: it learns your company before it writes a word", slot: "how-it-works-business-truth", page: "/how-it-works" } as Partial<Brief>) as RolloutBrief,
  fromTopic("backlinks-outreach", { title: "Authority, links and citations: off-site growth that gets worked on", goal: "show that GravyBlock works on off-site growth (outreach for links, citations kept consistent) instead of only recommending it", slot: "features-authority", page: "/features" } as Partial<Brief>) as RolloutBrief,
  fromTopic("vs-checklist", { title: "Reports and checklists tell you what to do. GravyBlock does the eligible work.", slot: "compare-why-gravyblock", page: "/compare" } as Partial<Brief>) as RolloutBrief,
  fromTopic("faq-control", { title: "Control without workload: you stay in charge, you do not do the work", goal: "show what you control (connections you grant, what it will and will not do) without being handed work", slot: "faq-control", page: "/faq" } as Partial<Brief>) as RolloutBrief,
];

/** The public pages the planner may read and the tour may use. A page that does not exist is simply left out. */
export const GRAVYBLOCK_PLAN_PATHS = ["/", "/scan", "/how-it-works", "/features", "/proof", "/pricing", "/marketing-studio", "/examples/sample-local-growth-report", "/compare", "/faq", "/local-seo"];

export const slotOfSpec = (specId: string) => GRAVYBLOCK_BRIEFS.find((b) => `gravyblock:${b.key}` === specId)?.slot ?? null;

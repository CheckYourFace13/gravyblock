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
  {
    flagship: true,
    mustCover: ["/", "/scan", "/how-it-works", "/features", "/proof", "/marketing-studio", "/pricing"],
    storyScenes: [["/"], ["/scan"], ["/how-it-works"], ["/features"], ["/proof"], ["/marketing-studio", "/pricing"]],
    angleId: "gravyblock-flagship-explainer",
    key: "flagship-explainer",
    role: "A",
    title: "GravyBlock explained: what it does, how it proves it, and what you do next",
    goal: "explain GravyBlock from start to finish to a first-time visitor: what it is and who it is for, how the free scan and Business Truth find and ground the work, how it does the eligible work automatically and proves it, how Marketing Studio fits in, how little the owner has to do and what the owner controls, why it is different from a report or checklist, and what to do next",
    audience: "a small business owner seeing GravyBlock for the first time on the homepage",
    coreBenefit: "the whole product understood in about a minute: it does the eligible marketing work and proves it, instead of handing over a list",
    features: ["free scan", "Business Truth", "does eligible work automatically", "verified proof", "Marketing Studio", "owner control"],
    ctaText: "Scan my business free",
    ctaUrl: SCAN,
    funnel: "cold",
    slot: "home-hero-flagship",
    page: "/",
  } as RolloutBrief,
  fromTopic("faq-control", { title: "Control without workload: you stay in charge, you do not do the work", goal: "show what you control (connections you grant, what it will and will not do) without being handed work", slot: "faq-control", page: "/faq" } as Partial<Brief>) as RolloutBrief,
];

/**
 * Other framings of the same brief, for the same slot on the same page: when a concept keeps failing (or has used its share of the AI budget) the next framing is tried instead of asking the
 * same question again. They are different angles on the subject, not different subjects, so placement does not change. The first framing is the brief itself.
 */
export const BRIEF_VARIANTS: Record<string, Array<Partial<Brief>>> = {
  "local-seo-that-does-the-work-for-you": [
    { title: "GravyBlock in one watch: what it reads, what it does, how it proves it", goal: "show a business owner the whole loop in one pass: it reads the business, picks work, does it and checks it", coreBenefit: "the whole product understood in one short watch" },
    { title: "What happens after you connect your business", goal: "show what GravyBlock does for a business once it is connected, from its first read to the first verified result", coreBenefit: "a clear picture of what happens next" },
  ],
  "the-free-scan-step-by-step": [
    { title: "Your free scan, and what it leads to", goal: "show running the free scan and the report it leads to, then what GravyBlock would do about the findings", coreBenefit: "the scan is the start of real work, not just a score" },
    { title: "A scan that does not stop at a score", goal: "show how the scan findings turn into chosen, checked work", coreBenefit: "findings become work" },
  ],
  "autonomous-marketing": [
    { title: "Marketing that does not land on your to-do list", goal: "show that the owner is not handed tasks: GravyBlock decides and does the eligible work", coreBenefit: "no new to-do list" },
    { title: "Hands off, but not blind", goal: "show GravyBlock working without the owner while still showing what it did", coreBenefit: "marketing runs without you managing it" },
  ],
  "marketing-studio": [
    { title: "A marketing video made from your own website", goal: "show Marketing Studio turning a real website into a short video that the owner reviews first", coreBenefit: "a real video from real pages, reviewed before it goes out" },
    { title: "Videos you approve before anything is published", goal: "show the review step of Marketing Studio and what the owner controls", coreBenefit: "control without making the video yourself" },
  ],
  "proof-the-work-actually-happened": [
    { title: "How you can tell the work really happened", goal: "show where GravyBlock shows verified work and the three honest levels of proof", coreBenefit: "work you can check" },
    { title: "Reports that show the receipt", goal: "show the proof page as a record of confirmed work, not a vague report", coreBenefit: "evidence instead of promises" },
  ],
  "local-search-growth": [
    { title: "Showing up when nearby customers search", goal: "show how GravyBlock finds and acts on local search opportunities for a business", coreBenefit: "work aimed at being found nearby" },
    { title: "Local visibility, worked on every week", goal: "show the recurring local work (listings, posts, reviews) that GravyBlock does", coreBenefit: "steady local work, not a one-off audit" },
  ],
  "business-truth": [
    { title: "It learns your business before it writes a word", goal: "show how GravyBlock builds its understanding of a business from the business's own website and profile", coreBenefit: "everything it writes starts from your facts" },
    { title: "Your facts first, then the marketing", goal: "show that claims come from verified facts about the business", coreBenefit: "nothing is invented about you" },
  ],
  "backlinks-outreach": [
    { title: "Links and citations that get worked on", goal: "show GravyBlock working on citations and relevant local links rather than only listing them as advice", coreBenefit: "off-site work that is done and verified" },
    { title: "From advice about links to links actually requested", goal: "show outreach for links and citation fixes being carried out and checked", coreBenefit: "authority work handled for you" },
  ],
  "vs-checklist": [
    { title: "Reports tell you what to do. GravyBlock does it.", goal: "contrast a list of recommendations with GravyBlock doing the eligible work", coreBenefit: "work done, not homework handed over" },
    { title: "The gap between an audit and a result", goal: "show what changes when the work is done for the business instead of listed for it", coreBenefit: "the audit becomes action" },
  ],
  "faq-control": [
    { title: "You stay in charge without doing the work", goal: "show what the owner controls and what GravyBlock does on its own", coreBenefit: "control without workload" },
    { title: "What you decide, and what you never have to", goal: "show the connections the owner grants and the work that then runs without them", coreBenefit: "decisions stay yours, effort does not" },
  ],
};

BRIEF_VARIANTS["flagship-explainer"] = [
  { title: "From a free scan to proven work: GravyBlock in about a minute", goal: "walk a first-time visitor from the free scan, through how GravyBlock learns the business and does the eligible work, to the proof, Marketing Studio and what to do next", mustCover: ["/", "/scan", "/how-it-works", "/features", "/proof", "/marketing-studio"], storyScenes: [["/"], ["/scan"], ["/how-it-works"], ["/features"], ["/proof"], ["/marketing-studio"]] },
  { title: "Not another report: what GravyBlock actually does for you", goal: "show that GravyBlock does eligible marketing work and proves it, instead of handing over a to-do list, and how much of the work stays with the owner", mustCover: ["/", "/scan", "/features", "/proof", "/marketing-studio"], storyScenes: [["/"], ["/scan"], ["/features"], ["/features"], ["/proof"], ["/marketing-studio"]] },
];

/** The brief for the n-th framing (0 is the brief itself); the framings repeat in turn. */
export function briefVariant(b: RolloutBrief, n: number): RolloutBrief {
  const list = BRIEF_VARIANTS[b.key] ?? [];
  if (!list.length || n <= 0) return b;
  return { ...b, ...list[(n - 1) % list.length] } as RolloutBrief;
}

/** The public pages the planner may read and the tour may use. A page that does not exist is simply left out. */
export const GRAVYBLOCK_PLAN_PATHS = ["/", "/scan", "/how-it-works", "/features", "/proof", "/pricing", "/marketing-studio", "/examples/sample-local-growth-report", "/compare", "/faq", "/local-seo"];

export const slotOfSpec = (specId: string) => GRAVYBLOCK_BRIEFS.find((b) => `gravyblock:${b.key}` === specId)?.slot ?? null;

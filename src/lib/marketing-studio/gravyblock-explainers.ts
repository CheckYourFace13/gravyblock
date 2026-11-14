/**
 * GravyBlock's own first video set, as PRODUCT EXPLAINER / WORKFLOW VISUALIZATION concepts (owner directive 2026-11-10). GravyBlock works out of sight, so there is no control to click:
 * each video shows how it works as lit-up steps, in its own verified words. Every card is a verbatim piece of Product Truth taken from a public page that the capture re-reads before
 * rendering, or an owner-entered fact for Marketing Studio (the owner's own description of his product). Nothing is invented: no customer results, no fake screens or metrics.
 * The angles are the existing GravyBlock topic inventory entries, so the duplicate gate and the placement recommendations already apply.
 */
import type { ExplainerDef, ExplainerNode } from "./video/concepts/explainer";

const BRAND = { name: "GravyBlock", accent: "#f5b301", dark: "#0b1020", light: "#faf7f2" };
const ORIGIN = "https://gravyblock.com";
const CTA = { text: "Scan my business free", url: "https://gravyblock.com/scan", display: "gravyblock.com/scan" };

const n = (step: string, line: string, say: string, path: string | undefined, fact: string = line): ExplainerNode => ({ step, line, say, path, fact });
const base = { slug: "gravyblock", productName: "GravyBlock", origin: ORIGIN, ctaHost: "gravyblock.com", cta: CTA, brand: BRAND };

/** The owner's own statements about Marketing Studio, entered as Product Truth (source: owner_entered). They describe what the product does for its owner today. */
export const MARKETING_STUDIO_FACTS = [
  "Marketing Studio makes short marketing videos from your real website.",
  "Every video is emailed to you for review before anything is published.",
  "Approve it, request changes, or pause new videos, straight from the email.",
] as const;

export type GravyblockExplainer = { def: ExplainerDef; angleId: string; yt: { title: string; description: string } };

export const GRAVYBLOCK_EXPLAINERS: GravyblockExplainer[] = [
  {
    angleId: "gravyblock-local-seo-that-does-the-work-for-you",
    yt: { title: "GravyBlock: What It Actually Does, Step by Step", description: "Local SEO without the to-do list. GravyBlock reads your real website, chooses what is worth fixing next, does the eligible work automatically and verifies what it completed." },
    def: {
      ...base,
      specId: "gravyblock:local-seo-that-does-the-work-for-you",
      angle: { id: "gravyblock-local-seo-that-does-the-work-for-you", role: "A", title: "GravyBlock: what it actually does", funnel: "cold" },
      title: "GravyBlock: what it actually does",
      hook: "Local SEO, without the to-do list?",
      audience: "a small business owner with no time for SEO",
      problem: "SEO usually hands you a list of tasks you never get to",
      whyItMatters: "the work gets done and checked without adding to your plate",
      scenes: [
        { heading: "How GravyBlock works", nodes: [n("READS", "Reads your real website and connected profiles.", "It reads your real website and connected profiles.", "/"), n("CHOOSES", "Chooses what is worth fixing next", "Then it can choose what is worth fixing next.", "/"), n("DOES", "Does the eligible work automatically", "Eligible work is done automatically.", "/")] },
        { heading: "Then it checks itself", nodes: [n("VERIFIES", "Verifies what it completed", "It will check what it completed.", "/"), n("KEEPS GOING", "Keeps monitoring and working automatically", "Then it will keep going, monitoring and working automatically.", "/"), n("FIRST STEP", "Find out your visibility score and what's holding you back. Free, in 60 seconds.", "Start with the free scan. Find out your visibility score, and what is holding you back.", "/scan", "Find out your visibility score and what's holding you back")] },
      ],
      endLine: "Run the free scan, at Gravy Block dot com.",
      endCaption: "Run the free scan at gravyblock.com",
      endHeadline: "Local SEO that does the work for you.",
    },
  },
  {
    angleId: "gravyblock-autonomous-marketing",
    yt: { title: "GravyBlock: Marketing That Keeps Going Without a To-Do List", description: "Connect once and GravyBlock decides what to do next and then does it, so you are not left with a to-do list." },
    def: {
      ...base,
      specId: "gravyblock:autonomous-marketing",
      angle: { id: "gravyblock-autonomous-marketing", role: "B", title: "GravyBlock: marketing that runs without a to-do list", funnel: "interested" },
      title: "GravyBlock: marketing that keeps going",
      hook: "What if your marketing kept going without you?",
      audience: "an owner who started marketing before and stopped",
      problem: "marketing stalls the moment you get busy",
      whyItMatters: "it keeps choosing and doing the next worthwhile action",
      scenes: [
        { heading: "Connect once", nodes: [n("CONNECT", "Connect once. GravyBlock takes it from there.", "Connect once. GravyBlock takes it from there.", "/"), n("ACTS", "Automatically performs the best legitimate action available.", "It performs the legitimate action available now, automatically.", "/"), n("LEARNS", "Uses what it learns to choose the next worthwhile action.", "Then it uses what it learns to choose the next worthwhile action.", "/")] },
        { heading: "No to-do list", nodes: [n("BUILT TO", "GravyBlock is built to decide what to do next and then do it", "It is built to decide what to do next, then get it done.", "/"), n("PRICE", "No setup fee · Cancel anytime · $39.99/month", "No setup fee. Cancel anytime. $39.99 a month.", "/"), n("START", "Free scan, no credit card", "Try a free scan, no credit card.", "/")] },
      ],
      endLine: "Try the free scan, at Gravy Block dot com.",
      endCaption: "Try the free scan at gravyblock.com",
      endHeadline: "Connect once. GravyBlock takes it from there.",
    },
  },
  {
    angleId: "gravyblock-marketing-studio",
    yt: { title: "GravyBlock Marketing Studio: Videos Made From Your Real Website", description: "Marketing Studio makes short marketing videos from your real website and emails each one to you for review before anything is published." },
    def: {
      ...base,
      specId: "gravyblock:marketing-studio",
      angle: { id: "gravyblock-marketing-studio", role: "B", title: "GravyBlock Marketing Studio: videos made from your real website", funnel: "interested" },
      title: "GravyBlock Marketing Studio",
      hook: "Who has time to make marketing videos?",
      audience: "an owner who knows video works but has no time to make it",
      problem: "making marketing videos takes time most owners do not have",
      whyItMatters: "videos get made from your own website and nothing goes out without your approval",
      scenes: [{ heading: "Videos, made for you", nodes: [n("MAKES", MARKETING_STUDIO_FACTS[0], "Marketing Studio makes short videos from your real website, ready to watch.", undefined), n("REVIEWS", MARKETING_STUDIO_FACTS[1], "You watch every video in your email before anything is published.", undefined), n("YOU DECIDE", MARKETING_STUDIO_FACTS[2], "Approve it, request changes, or pause new videos, straight from the email, and you are done.", undefined)] },
        { heading: "From one place", nodes: [n("CONNECT", "Connect once. GravyBlock takes it from there.", "Connect once, and GravyBlock takes it from there.", "/"), n("ACTS", "Automatically performs the best legitimate action available.", "It performs the legitimate action available now, automatically.", "/"), n("START", "Free scan, no credit card", "Try a free scan, no credit card.", "/")] },
      ],
      endLine: "Try the free scan. Created automatically by GravyBlock Marketing Studio.",
      endCaption: "Try the free scan at gravyblock.com. Created automatically by GravyBlock Marketing Studio.",
      endHeadline: "Nothing publishes until you approve.",
    },
  },
  {
    angleId: "gravyblock-the-free-scan-step-by-step",
    yt: { title: "GravyBlock: From Free Scan to Work Actually Getting Done", description: "Run the free scan, see your score and top findings, then connect your site and turn on a plan. GravyBlock decides what will help most, does it automatically, verifies it happened and keeps going." },
    def: {
      ...base,
      specId: "gravyblock:the-free-scan-step-by-step",
      angle: { id: "gravyblock-the-free-scan-step-by-step", role: "B", title: "GravyBlock: the free scan, step by step", funnel: "high_intent" },
      title: "GravyBlock: from free scan to work done",
      hook: "Got your score. Now what?",
      audience: "someone about to run the free scan",
      problem: "a score is only useful if something happens next",
      whyItMatters: "the scan leads straight into work being done and checked",
      scenes: [
        { heading: "From scan to plan", nodes: [n("SCAN", "Find your business, get a score across 6 ranking factors", "Find your business and get a score across 6 ranking factors.", "/scan"), n("SEE", "You see score, verdict, and top findings first.", "You see your score, verdict, and top findings first.", "/scan"), n("CONNECT", "Connect your site and turn on a plan.", "Then connect your site and turn on a plan.", "/")] },
        { heading: "Then the work starts", nodes: [n("DECIDES", "GravyBlock decides what will help most", "Then it will choose what will help most.", "/"), n("DOES", "does it automatically", "It is done automatically.", "/"), n("CHECKS", "verifies it happened, and keeps going", "It will check it happened, and keep going.", "/")] },
      ],
      endLine: "Find your visibility score, at Gravy Block dot com.",
      endCaption: "Find your visibility score at gravyblock.com",
      endHeadline: "Find out your visibility score.",
    },
  },
  {
    angleId: "gravyblock-proof-the-work-actually-happened",
    yt: { title: "GravyBlock: How It Proves the Work Happened", description: "GravyBlock confirms its work at the external destination and shows you that the work happened. It is honest that this shows the work happened, not that results followed." },
    def: {
      ...base,
      specId: "gravyblock:proof-the-work-actually-happened",
      angle: { id: "gravyblock-proof-the-work-actually-happened", role: "C", title: "GravyBlock: proof the work actually happened", funnel: "interested" },
      title: "GravyBlock: proof the work happened",
      hook: "How do you know the work really happened?",
      audience: "an owner who has been burned by vague SEO reports",
      problem: "most SEO reports tell you what was done, not whether it happened",
      whyItMatters: "work is checked where it lands, and the claims stay honest",
      scenes: [
        { heading: "Proof, not promises", nodes: [n("CONFIRMED", "Work confirmed at an external destination", "Work is checked at an external destination.", "/proof"), n("SUCH AS", "listing checks, Google and social posts, review replies, or links found live on other sites", "You see listing checks, posts, review replies, or links found live.", "/proof"), n("HONEST", "It shows the work happened, not that results followed.", "It shows the work happened, not that results followed.", "/proof")] },
        { heading: "Run on its own", nodes: [n("OWN BUSINESSES", "These are businesses operated by GravyBlock's owner, running the same automation customers get.", "These are businesses operated by GravyBlock's owner.", "/proof"), n("LIVE", "The numbers are pulled live from the database that powers customer workspaces.", "The numbers are pulled live.", "/proof"), n("NO FAKES", "We'd rather show you nothing than make it up.", "We would rather show you nothing than make it up.", "/", "We'd rather show you nothing than make it up")] },
      ],
      endLine: "See the proof for yourself, at Gravy Block dot com slash proof.",
      endCaption: "See the proof for yourself at gravyblock.com/proof",
      endHeadline: "Proof, not promises.",
    },
  },
];

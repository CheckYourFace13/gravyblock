/**
 * GravyBlock's own first video set, as PRODUCT EXPLAINER / WORKFLOW VISUALIZATION concepts (owner directive 2026-11-10). GravyBlock works out of sight, so there is no control to click:
 * each video shows how it works as lit-up steps, in its own verified words. Every card is a verbatim piece of Product Truth taken from a public page that the capture re-reads before
 * rendering, or an owner-entered fact for Marketing Studio (the owner's own description of his product). Nothing is invented: no customer results, no fake screens or metrics.
 * The angles are the existing GravyBlock topic inventory entries, so the duplicate gate and the placement recommendations already apply.
 */
import type { ExplainerDef, ExplainerNode } from "./video/concepts/explainer";
import type { TourStep } from "./video/concepts/tour";

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

/**
 * The real product, used for real: each scene is a sequence of verified interactions on the live gravyblock.com (open a page, scroll to something, click a link or a tab, type into a field).
 * Every `shows` is text that must be on the screen after the step, so a page that fails to load, a changed page or an empty picture stops the render instead of reaching the owner.
 */
const open = (path: string, shows: string, label?: string, node: 0 | 1 | 2 = 0): TourStep => ({ node, do: "open", path, shows, label });
const scroll = (node: 0 | 1 | 2, text: string, shows: string = text, label?: string): TourStep => ({ node, do: "scroll", text, shows, label });
const click = (node: 0 | 1 | 2, text: string, shows: string, label?: string): TourStep => ({ node, do: "click", text, shows, label: label ?? text });
const type = (node: 0 | 1 | 2, field: string, value: string, shows: string, label?: string): TourStep => ({ node, do: "type", field, value, shows, label: label ?? `${field}: ${value}` });
const WEBSITE_TAB = "Website / online business";

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
        { heading: "How GravyBlock works", nodes: [n("READS", "Reads your real website and connected profiles.", "It reads your real website and connected profiles.", "/"), n("CHOOSES", "Chooses what is worth fixing next", "Then it can choose what is worth fixing next.", "/"), n("DOES", "Does the eligible work automatically", "Eligible work is done automatically.", "/")], tour: [open("/", "Local SEO that does the work for you.", "GravyBlock home"), scroll(0, "Learns your business", "Reads your real website and connected profiles."), scroll(1, "Chooses what is worth fixing next"), scroll(1, "Does the work", "Automatically performs the best legitimate action available."), scroll(2, "Does the eligible work automatically")] },
        { heading: "Then it checks itself", nodes: [n("VERIFIES", "Verifies what it completed", "It will check what it completed.", "/"), n("KEEPS GOING", "Keeps monitoring and working automatically", "Then it will keep going, monitoring and working automatically.", "/"), n("FIRST STEP", "Find out your visibility score and what's holding you back. Free, in 60 seconds.", "Start with the free scan. Find out your visibility score, and what is holding you back.", "/scan", "Find out your visibility score and what's holding you back")], tour: [open("/", "Verifies what it completed", "GravyBlock home"), scroll(0, "Verifies it", "Checks that the action actually happened."), scroll(1, "Keeps monitoring and working automatically"), click(2, "Get my free score", "See your Google visibility score in 60 seconds."), click(2, WEBSITE_TAB, "Enter your website"), type(2, "Website URL", "gravyblock.com", "Website URL")] },
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
        { heading: "Connect once", nodes: [n("CONNECT", "Connect once. GravyBlock takes it from there.", "Connect once. GravyBlock takes it from there.", "/"), n("ACTS", "Automatically performs the best legitimate action available.", "It performs the legitimate action available now, automatically.", "/"), n("LEARNS", "Uses what it learns to choose the next worthwhile action.", "Then it uses what it learns to choose the next worthwhile action.", "/")], tour: [open("/", "Local SEO that does the work for you.", "GravyBlock home"), scroll(0, "Keeps going", "Uses what it learns to choose the next worthwhile action."), scroll(1, "Does the work", "Automatically performs the best legitimate action available."), scroll(2, "Keeps going", "Uses what it learns to choose the next worthwhile action.")] },
        { heading: "No to-do list", nodes: [n("BUILT TO", "GravyBlock is built to decide what to do next and then do it", "It is built to decide what to do next, then get it done.", "/"), n("PRICE", "No setup fee · Cancel anytime · $39.99/month", "No setup fee. Cancel anytime. $39.99 a month.", "/"), n("START", "Free scan, no credit card", "Try a free scan, no credit card.", "/")], tour: [open("/", "One engine. It never stops working.", "GravyBlock home"), scroll(0, "GravyBlock is built to decide what to do next", "GravyBlock is built to decide what to do next and then do it"), scroll(1, "No setup fee", "No setup fee · Cancel anytime · $39.99/month"), click(2, "Scan my business free", "See your Google visibility score in 60 seconds."), click(2, WEBSITE_TAB, "Enter your website"), type(2, "Website URL", "gravyblock.com", "Website URL")] },
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
      // Every spoken line is something the viewer SEES on the real site while it is said (the owner's rule: narration may not describe functionality that is not shown).
      // The Studio's own promises (email review, approve, pause) are not on any public page, so they are carried by the owner-entered facts and the end card, never narrated over pictures that do not show them.
      scenes: [{ heading: "Videos, made for you", nodes: [n("MAKES", "Reads your real website and connected profiles.", "Marketing Studio makes short videos from your real website.", "/", MARKETING_STUDIO_FACTS[0]), n("READS", "Reads your real website and connected profiles.", "Marketing Studio reads your real website.", "/", MARKETING_STUDIO_FACTS[0]), n("DOES", "Automatically performs the best legitimate action available.", "Then it does the work automatically.", "/")], tour: [open("/", "One engine. It never stops working.", "GravyBlock home"), scroll(0, "One engine. It never stops working."), scroll(1, "Learns your business", "Reads your real website and connected profiles."), scroll(2, "Does the work", "Automatically performs the best legitimate action available.")] },
        { heading: "From one place", nodes: [n("CONNECT", "Connect once. GravyBlock takes it from there.", "Connect once, and GravyBlock takes it from there.", "/"), n("ACTS", "Automatically performs the best legitimate action available.", "It performs the legitimate action available now, automatically.", "/"), n("START", "Free scan, no credit card", "Try a free scan, no credit card.", "/")], tour: [open("/", "Connect once. GravyBlock takes it from there.", "GravyBlock home"), scroll(0, "Connect once. GravyBlock takes it from there."), scroll(1, "Does the work", "Automatically performs the best legitimate action available."), click(2, "Get my free score", "See your Google visibility score in 60 seconds."), click(2, WEBSITE_TAB, "Enter your website"), type(2, "Website URL", "gravyblock.com", "Website URL")] },
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
        { heading: "From scan to plan", nodes: [n("SCAN", "Find your business, get a score across 6 ranking factors", "Find your business and get a score across 6 ranking factors.", "/scan"), n("SEE", "You see score, verdict, and top findings first.", "You see your score, verdict, and top findings first.", "/scan"), n("CONNECT", "Connect your site and turn on a plan.", "Then connect your site and turn on a plan.", "/")], tour: [open("/scan", "See your Google visibility score in 60 seconds.", "The free scan"), click(0, WEBSITE_TAB, "Enter your website"), type(0, "Website URL", "gravyblock.com", "Website URL"), scroll(1, "You see score, verdict, and top findings first.", "You see score, verdict, and top findings first."), click(2, "Start free", "Free scan"), scroll(2, "Connect your site and turn on a plan.")] },
        { heading: "Then the work starts", nodes: [n("DECIDES", "GravyBlock decides what will help most", "Then it will choose what will help most.", "/"), n("DOES", "does it automatically", "It is done automatically.", "/"), n("CHECKS", "verifies it happened, and keeps going", "It will check it happened, and keep going.", "/")], tour: [open("/", "GravyBlock takes it from there", "GravyBlock home"), scroll(0, "GravyBlock takes it from there", "Connect your site and turn on a plan."), scroll(1, "Does the work", "Automatically performs the best legitimate action available."), scroll(2, "Verifies it", "Checks that the action actually happened.")] },
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
        { heading: "Proof, not promises", nodes: [n("CONFIRMED", "Work confirmed at an external destination", "Work is checked at an external destination.", "/proof"), n("SUCH AS", "listing checks, Google and social posts, review replies, or links found live on other sites", "You see listing checks, posts, review replies, or links found live.", "/proof"), n("HONEST", "It shows the work happened, not that results followed.", "It shows the work happened, not that results followed.", "/proof")], tour: [open("/", "VERIFIED WORK, NOT PROMISES", "GravyBlock home"), click(0, "Verified work", "PROOF, NOT PROMISES"), scroll(1, "LEVEL 1: VERIFIED ACTION", "Work confirmed at an external destination"), scroll(2, "LEVEL 2: SEARCH OR VISIBILITY RESULT", "It shows the work happened, not that results followed.")] },
        { heading: "Run on its own", nodes: [n("OWN BUSINESSES", "These are businesses operated by GravyBlock's owner, running the same automation customers get.", "These are businesses operated by GravyBlock's owner.", "/proof"), n("LIVE", "The numbers are pulled live from the database that powers customer workspaces.", "The numbers are pulled live.", "/proof"), n("NO FAKES", "We'd rather show you nothing than make it up.", "We would rather show you nothing than make it up.", "/", "We'd rather show you nothing than make it up")], tour: [open("/proof", "These are businesses operated by GravyBlock's owner", "The proof page"), scroll(0, "These are businesses operated by GravyBlock's owner", "These are businesses operated by GravyBlock's owner"), scroll(1, "The numbers are pulled live", "The numbers are pulled live from the database"), open("/", "We'd rather show you nothing than make it up.", "GravyBlock home", 2), scroll(2, "We'd rather show you nothing than make it up.")] },
      ],
      endLine: "See the proof for yourself, at Gravy Block dot com slash proof.",
      endCaption: "See the proof for yourself at gravyblock.com/proof",
      endHeadline: "Proof, not promises.",
    },
  },
];

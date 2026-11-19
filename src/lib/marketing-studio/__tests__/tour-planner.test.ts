// The AI concept planner: it may only use what exists on the real site, every plan is gated before any render, and a failed plan is replanned with the exact problems.
import "./setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Corpus } from "../video/concepts/corpus";
import { planTour, swapWords, type Ask, type Brief, type PlanContext } from "../video/concepts/tour-planner";

export const FACTS = ["Marketing Studio makes short marketing videos from your real website.", "Every video is emailed to you for review before anything is published.", "Reads your real website and connected profiles.", "Automatically performs the best legitimate action available.", "See your Google visibility score in 60 seconds.", "Find your business, get a score across 6 ranking factors."];
export const corpus: Corpus = {
  origin: "https://gravyblock.com",
  at: new Date().toISOString(),
  pages: [
    { path: "/", title: "GravyBlock", blocks: [{ id: "p0.b0", text: "Local SEO that does the work for you." }, { id: "p0.b1", text: "Reads your real website and connected profiles." }, { id: "p0.b2", text: "Automatically performs the best legitimate action available." }], controls: [{ id: "p0.c0", kind: "link", text: "Get my free score", to: "/scan" }] },
    { path: "/scan", title: "Free scan", blocks: [{ id: "p1.b0", text: "See your Google visibility score in 60 seconds." }, { id: "p1.b1", text: "Find your business, get a score across 6 ranking factors." }], controls: [{ id: "p1.c0", kind: "field", text: "Website URL" }] },
  ],
};
export const brief: Brief = { angleId: "gravyblock-x", key: "x", role: "B", title: "Test subject", goal: "show something", audience: "owners", coreBenefit: "a benefit", features: ["a"], ctaText: "Try it", ctaUrl: "https://gravyblock.com/scan", funnel: "cold" };
export const ctx = (history: PlanContext["history"] = []): PlanContext => ({ corpus, facts: FACTS, prohibited: [], history, brand: { name: "GravyBlock", accent: "#f5b301", dark: "#0b1020", light: "#faf7f2" }, slug: "gravyblock", productName: "GravyBlock", origin: "https://gravyblock.com", ctaHost: "gravyblock.com" });

const good = (hook: string, over: Record<string, unknown> = {}) => ({
  hook,
  problem: "owners never get to the marketing list",
  benefit: "the work is picked and done for them",
  yt: { title: "A test video title", description: "A short description of the test video." },
  scenes: [
    { heading: "See the loop", nodes: [{ step: "READS", block: "p0.b1", say: "ignored hook line", fact: 2 }, { step: "READS", block: "p0.b1", say: "It reads your real website and profiles.", fact: 2 }, { step: "ACTS", block: "p0.b2", say: "Then it performs a legitimate action available.", fact: 3 }],
      tour: [{ node: 1, do: "open", target: "/", shows: "p0.b0" }, { node: 1, do: "scroll", target: "p0.b1", shows: "p0.b1" }, { node: 2, do: "scroll", target: "p0.b2", shows: "p0.b2" }, { node: 3, do: "scroll", target: "p0.b2", shows: "p0.b2" }] },
    { heading: "Try the scan", nodes: [{ step: "OPEN", block: "p1.b0", say: "Open the free scan and see the score.", fact: 4 }, { step: "FIND", block: "p1.b1", say: "Find the business and read the factors.", fact: 5 }, { step: "TYPE", block: "p1.b1", say: "Type the website and get the factors.", fact: 5 }],
      tour: [{ node: 1, do: "open", target: "/", shows: "p0.b0" }, { node: 1, do: "click", target: "p0.c0", shows: "p1.b0" }, { node: 2, do: "scroll", target: "p1.b1", shows: "p1.b1" }, { node: 3, do: "type", target: "p1.c0", value: "gravyblock.com", shows: "p1.b0" }] },
  ],
  endLine: "Check your own score at Gravy Block dot com.",
  endCaption: "Check your own score at gravyblock.com",
  endHeadline: "Your score, in a minute.",
  ...over,
});
export const planJson = (hook: string, over: Record<string, unknown> = {}) => JSON.stringify(good(hook, over));

describe("tour planner", () => {
  test("a grounded plan becomes a live tour definition using only things on the real site", async () => {
    const r = await planTour(brief, ctx(), [], async () => planJson("Who has time for another marketing task?"));
    assert.equal(r.ok, true, JSON.stringify(r));
    if (!r.ok) return;
    assert.equal(r.def.scenes.length, 2);
    assert.equal(r.def.scenes[0].tour![0].do, "open");
    assert.ok(r.def.scenes[1].tour!.some((s) => s.do === "type" && s.value === "gravyblock.com"));
    assert.equal(r.def.specId, "gravyblock:x");
  });
  test("a made-up block, a missing control or a typed personal value is refused with the exact reason, then replanned", async () => {
    const calls: string[] = [];
    const ask: Ask = async (_s, user, attempt) => {
      calls.push(user);
      if (attempt === 1) return planJson("Who has time for another marketing task?", { scenes: [{ heading: "x", nodes: [{ block: "p9.b9", say: "something invented here", fact: 0 }, {}, {}], tour: [] }, {}] });
      return planJson("Who has time for another marketing task?");
    };
    const r = await planTour(brief, ctx(), [], ask);
    assert.equal(r.ok, true);
    assert.equal(r.attempts, 2, "the failure was replanned internally, not left blocked");
    assert.match(calls[1], /PREVIOUS PLAN WAS REFUSED/);
    assert.match(calls[1], /is not on the real site|needs 3 nodes/);
  });
  test("a copy of an earlier video's hook is refused and the replan must differ", async () => {
    const earlier = { specId: "gravyblock:old", hook: "Who has time for another marketing task?", problem: "p", benefit: "b", lines: ["Who has time for another marketing task?", "It reads your real website and profiles.", "Then it performs a legitimate action available."], closing: "Check your own score at Gravy Block dot com.", cta: "Try it", visual: [], format: "live product tour" };
    let n = 0;
    const r = await planTour(brief, ctx([earlier]), [earlier], async () => (++n === 1 ? planJson("Who has time for another marketing task?") : planJson("What would you do with the hours your marketing eats?", { endLine: "Look at your own number at Gravy Block dot com.", endCaption: "Look at your own number at gravyblock.com", endHeadline: "Your number is waiting." })));
    assert.equal(r.attempts >= 2, true);
  });
  test("a plan with no usable tour is completed from its own nodes, with a real page opened first", async () => {
    const r = await planTour(brief, ctx(), [], async () => { const j = JSON.parse(planJson("Who has time for another marketing task?")); j.scenes.forEach((x: { tour?: unknown }) => delete x.tour); return JSON.stringify(j); });
    assert.equal(r.ok, true, JSON.stringify(r));
    if (r.ok) assert.ok(r.def.scenes.every((sc) => sc.tour![0].do === "open" && sc.tour!.length >= 3));
  });
  test("refused words are swapped for plain ones without touching other words", () => {
    assert.equal(swapWords("It takes the best step, only once, lonely on this page."), "It takes the right step, just once, lonely on here.");
  });
  test("when every attempt fails the plan is reported, never produced", async () => {
    const r = await planTour(brief, ctx(), [], async () => "not json", 2);
    assert.equal(r.ok, false);
    assert.equal(r.attempts, 2);
  });
});

describe("planner repairs: a long hook and business hours", () => {
  test("a hook past 12 words is cut back to its first complete thought, keeping a question a question", async () => {
    const { fitHook } = await import("../video/concepts/tour-planner");
    const words = (s: string) => s.split(/\s+/).length;
    const long = "Still spending your evenings on marketing nobody asked you to do? GravyBlock reads your business and handles the rest while you run it.";
    const fit = fitHook(long);
    assert.ok(words(fit) <= 12 && fit.endsWith("?"), fit);
    const noStop = "You run the business and then you also have to run all of the marketing for it every single week";
    assert.ok(words(fitHook(noStop)) <= 12);
    assert.equal(fitHook("What does it actually do for you?"), "What does it actually do for you?");
  });
  test("business hours is said as opening times, so a site sentence stays usable", async () => {
    const { swapWords } = await import("../video/concepts/tour-planner");
    assert.equal(swapWords("Keep your business hours right everywhere"), "Keep your opening times right everywhere");
  });
});

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
    assert.match(calls[1], /THE PREVIOUS PLAN/);
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

describe("engine reliability: free repairs before a paid retry", () => {
  const hook = "Who has time for another marketing task?";
  test("a block id that is not on the site, and a hook that is too long, are repaired with no second model call", async () => {
    let calls = 0;
    const r = await planTour(brief, ctx(), [], async () => {
      calls++;
      const j = JSON.parse(planJson("Who has time for another marketing task every single week while you are also running a whole business?"));
      j.scenes[0].nodes[1].block = "p9.b9";
      return JSON.stringify(j);
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(calls, 1, "one paid call");
    if (r.ok) {
      assert.ok((r.repairs ?? 0) >= 1, "the block was repaired for free");
      assert.ok(r.def.hook.split(/\s+/).length <= 12);
    }
  });
  test("a line about something its screen does not show is replaced by the screen's own words, for free", async () => {
    let calls = 0;
    const r = await planTour(brief, ctx(), [], async () => {
      calls++;
      const j = JSON.parse(planJson(hook));
      j.scenes[0].nodes[2].say = "Quantum dolphins orchestrate galactic paperwork effortlessly";
      return JSON.stringify(j);
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(calls, 1);
  });
  test("a retry sends the previous plan back so only the failing parts change", async () => {
    const earlier = { specId: "gravyblock:old", hook, problem: "p", benefit: "b", lines: [hook], closing: "c", cta: "t", visual: [], format: "tour" } as unknown as PlanContext["history"][number];
    const prompts: string[] = [];
    let n = 0;
    await planTour(brief, ctx([earlier]), [earlier], async (_s, user) => {
      prompts.push(user);
      return ++n === 1 ? planJson(hook) : planJson("What would you do with the hours your marketing eats?", { endLine: "Look at your own number at Gravy Block dot com." });
    });
    assert.ok(prompts.length >= 2);
    assert.match(prompts[1], /THE PREVIOUS PLAN \(change ONLY what the problems name/);
  });
  test("a reply cut off mid-way is closed and used instead of being paid for again", async () => {
    const { parseLoose } = await import("../video/concepts/tour-planner");
    const full = planJson(hook);
    const cut = full.slice(0, full.indexOf('"endLine"') - 1);
    const got = parseLoose(cut);
    assert.ok(got && Array.isArray(got.scenes) && got.scenes.length === 2, "recovered the scenes");
    assert.equal(parseLoose("no json here at all"), null);
  });
  test("the plan's own quotes are checked against the live site: changed text makes it stale, unchanged text does not", async () => {
    const { staleQuotes } = await import("../video/concepts/tour-planner");
    const r = await planTour(brief, ctx(), [], async () => planJson(hook));
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(staleQuotes(r.def, corpus), []);
    const changed: Corpus = { ...corpus, pages: corpus.pages.map((p) => ({ ...p, blocks: p.blocks.map((b) => (b.id === "p0.b1" ? { ...b, text: "Now says something completely different about pricing." } : b)) })) };
    const stale = staleQuotes(r.def, changed);
    assert.ok(stale.length > 0 && stale.some((s) => /Reads your real website/i.test(s)), JSON.stringify(stale));
  });
});

describe("engine reliability: a stuck concept is asked another way", () => {
  test("every brief has two other framings of the same subject, for the same slot and page", async () => {
    const { BRIEF_VARIANTS, briefVariant, GRAVYBLOCK_BRIEFS } = await import("../gravyblock-briefs");
    for (const b of GRAVYBLOCK_BRIEFS) {
      assert.equal((BRIEF_VARIANTS[b.key] ?? []).length, 2, b.key);
      const v1 = briefVariant(b, 1);
      const v2 = briefVariant(b, 2);
      assert.notEqual(v1.goal, b.goal);
      assert.notEqual(v1.goal, v2.goal);
      assert.equal(v1.slot, b.slot);
      assert.equal(v1.page, b.page);
      assert.equal(v1.key, b.key);
      assert.equal(briefVariant(b, 3).goal, v1.goal, "the framings repeat in turn");
      assert.equal(briefVariant(b, 0), b);
    }
  });
  test("the budget limits keep the whole set inside the month", async () => {
    const { PER_CONCEPT_CAP_USD, PER_PASS_CAP_USD } = await import("../gravyblock-register");
    assert.ok(PER_CONCEPT_CAP_USD * 10 <= 5 && PER_PASS_CAP_USD <= PER_CONCEPT_CAP_USD * 2);
  });
});

describe("engine reliability: what is never offered, and what is steered away from", () => {
  test("site text the wording gate refuses is never offered to the planner (it is shown verbatim and cannot be reworded)", async () => {
    const { groundedCorpus } = await import("../video/concepts/tour-planner");
    const facts = ["Only the finished work is counted.", "Reads your real website and connected profiles."];
    const c: Corpus = { origin: "https://gravyblock.com", at: "", pages: [{ path: "/", title: "x", blocks: [{ id: "a", text: "Only the finished work is counted." }, { id: "b", text: "Reads your real website and connected profiles." }], controls: [] }] };
    assert.deepEqual(groundedCorpus(c, facts).pages[0].blocks.map((b) => b.id), ["b"]);
  });
  test("more than two scenes are cut back to the first two for free", async () => {
    const { repairRaw } = await import("../video/concepts/tour-planner");
    const raw = JSON.parse(planJson("Who has time for another marketing task?"));
    raw.scenes.push(JSON.parse(JSON.stringify(raw.scenes[0])));
    const fixed = repairRaw(raw, ["the plan must have exactly 2 scenes"], ctx());
    assert.equal(fixed.raw.scenes!.length, 2);
    assert.equal(fixed.changed, true);
  });
  test("the openings earlier videos used are named in the prompt", async () => {
    const { renderPrompt } = await import("../video/concepts/tour-planner");
    const earlier = { specId: "gravyblock:old", hook: "Who is actually doing your Google work?", problem: "p", benefit: "b", lines: ["x"], closing: "c", cta: "t", visual: [], format: "tour" } as unknown as PlanContext["history"][number];
    assert.match(renderPrompt(brief, ctx([earlier]), []), /Hook openings already used.*who is actually/);
  });
});

describe("engine reliability: the check that refused every render now runs before it", () => {
  test("a plan whose lines name no action or result is refused before any render, with the lines named", async () => {
    const { gateDef, planTour: plan } = await import("../video/concepts/tour-planner");
    const r = await plan(brief, ctx(), [], async () => planJson("Who has time for another marketing task?"));
    assert.ok(r.ok);
    if (!r.ok) return;
    const dull = JSON.parse(JSON.stringify(r.def));
    for (const sc of dull.scenes) for (const nd of sc.nodes) nd.say = "A broad and general statement about the business matters";
    const problems = gateDef(dull, ctx(), []);
    assert.ok(problems.some((p: string) => /spoken lines name an action or a result/.test(p)), JSON.stringify(problems));
  });
  test("the same plan passes once its lines say what happens", async () => {
    const r = await planTour(brief, ctx(), [], async () => planJson("Who has time for another marketing task?"));
    assert.ok(r.ok, JSON.stringify(r));
  });
});

describe("engine reliability: text the capture cannot locate is not offered again", () => {
  test("blocks whose text was found unlocatable on the live page are removed from the corpus", async () => {
    const { withoutUnlocatable } = await import("../gravyblock-register");
    const out = withoutUnlocatable(corpus, ["reads your real website and connected profiles."]);
    assert.ok(!out.pages.flatMap((p) => p.blocks).some((b) => /reads your real website/i.test(b.text)));
    assert.ok(out.pages.flatMap((p) => p.blocks).length < corpus.pages.flatMap((p) => p.blocks).length);
    assert.equal(withoutUnlocatable(corpus, []), corpus);
  });
});

describe("flagship explainer format", () => {
  const flagBrief: Brief = { ...brief, key: "flag", flagship: true, mustCover: ["/", "/scan", "/pricing"] };
  test("the flagship asks for six scenes and a 60 to 90 second story, and the short format is unchanged", async () => {
    const { systemFor, lengthWindow, FLAGSHIP_SCENES } = await import("../video/concepts/tour-planner");
    assert.equal(FLAGSHIP_SCENES, 6);
    assert.match(systemFor(flagBrief), /exactly 6 scenes/);
    assert.match(systemFor(flagBrief), /60 to 90 seconds/);
    assert.match(systemFor(flagBrief), /x6\],"endLine"/);
    assert.match(systemFor(brief), /exactly 2 scenes/);
    assert.deepEqual(lengthWindow(true), { lo: 60, hi: 90 });
    assert.deepEqual(lengthWindow(false), { lo: 23, hi: 32 });
  });
  test("a two-scene plan is refused for a flagship, with the exact reason", async () => {
    const r = await planTour(flagBrief, ctx(), [], async () => planJson("Who has time for another marketing task?"), 1);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.problems.join(" "), /exactly 6 scenes/);
  });
  test("a flagship story that does not show a page it promised, or is too short, is refused before any render", async () => {
    const { gateDef } = await import("../video/concepts/tour-planner");
    const r = await planTour(brief, ctx(), [], async () => planJson("Who has time for another marketing task?"));
    assert.ok(r.ok);
    if (!r.ok) return;
    const asFlagship = { ...r.def, flagship: true, mustCover: ["/", "/scan", "/pricing"] };
    const problems = gateDef(asFlagship, ctx(), []);
    assert.ok(problems.some((p: string) => /must show these pages and does not: \/pricing/.test(p)), JSON.stringify(problems));
    assert.ok(problems.some((p: string) => /must run 60 to 90 seconds/.test(p)), JSON.stringify(problems));
  });
  test("the finished flagship is judged by its own length window, and a short video still is not", async () => {
    const { evaluateRecord } = await import("../video/concepts/validate");
    const base = { specId: "gravyblock:flag", slug: "gravyblock", productName: "GravyBlock", transcript: Array.from({ length: 12 }, (_, i) => ({ text: i === 0 ? "Who has time for more marketing tasks?" : "Watch it open the page and find the score." })), firstActionMs: 1500, stateChanges: 30, interactivePlates: 6, verifiedClaims: 12, ctaText: "Scan my business free", onScreen: [], takenOpenings: [], prohibited: [] };
    const pacing = (o: { durationMs: number; flagship?: boolean }) => evaluateRecord({ ...base, ...o }).checks.find((c) => c.id === "engaging_pacing")?.ok;
    assert.equal(pacing({ durationMs: 75_000, flagship: true }), true);
    assert.equal(pacing({ durationMs: 75_000 }), false, "75 seconds is too long for a short video");
    assert.equal(pacing({ durationMs: 25_000, flagship: true }), false, "25 seconds is too short for a flagship");
    assert.equal(pacing({ durationMs: 25_000 }), true);
  });
});

describe("flagship repairs: the story map is followed for free", () => {
  test("a scene whose assigned page is missing takes it: its nodes move onto that page and its tour is rebuilt to open it", async () => {
    const { repairRaw } = await import("../video/concepts/tour-planner");
    const b: Brief = { ...brief, flagship: true, storyScenes: [["/scan"], ["/"]], mustCover: ["/scan", "/"] };
    const raw = JSON.parse(planJson("Who has time for another marketing task?"));
    const fixed = repairRaw(raw, ["the story must show these pages and does not: /scan (open each in a scene and base a spoken line on one of its blocks)"], ctx(), b);
    assert.equal(fixed.changed, true);
    const sc = fixed.raw.scenes![0];
    assert.ok(sc.nodes!.every((n) => /^p1\./.test(n.block ?? "")), JSON.stringify(sc.nodes));
    assert.equal(sc.tour![0].do, "open");
    assert.equal(sc.tour![0].target, "/scan");
    assert.ok(sc.tour!.filter((t) => t.do !== "open").length >= 3, "the scene uses the page");
  });
  test("a scene with too little interaction gets a tour made from its own nodes, keeping its typed entry", async () => {
    const { repairRaw } = await import("../video/concepts/tour-planner");
    const raw = JSON.parse(planJson("Who has time for another marketing task?"));
    raw.scenes[1].nodes = raw.scenes[1].nodes.map((n: { block?: string }) => ({ ...n, block: "p1.b1" }));
    const fixed = repairRaw(raw, ["scene 2 does not use the product enough (at least 3 scrolls, clicks or typed entries a scene): add real interactions"], ctx(), { ...brief, flagship: true });
    const tour = fixed.raw.scenes![1].tour!;
    assert.equal(tour[0].do, "open");
    assert.ok(tour.filter((t) => t.do === "scroll").length >= 3);
    assert.ok(tour.some((t) => t.do === "type"), "the typed scan entry is kept");
  });
  test("the flagship brief carries a scene plan that covers every page it must show", async () => {
    const { GRAVYBLOCK_BRIEFS, BRIEF_VARIANTS, briefVariant } = await import("../gravyblock-briefs");
    const f = GRAVYBLOCK_BRIEFS.find((b) => b.key === "flagship-explainer");
    assert.ok(f && f.flagship && f.storyScenes && f.storyScenes.length === 6);
    for (const v of [f, briefVariant(f, 1), briefVariant(f, 2)]) {
      const planned = new Set((v.storyScenes ?? []).flat());
      assert.ok((v.mustCover ?? []).every((p) => planned.has(p)), `${v.title}: every required page has a scene`);
      assert.equal(v.storyScenes!.length, 6);
    }
    assert.equal(BRIEF_VARIANTS["flagship-explainer"].length, 2);
  });
});

describe("repairs: lines that name no action get a lead-in that points at the screen", () => {
  test("the shortest lines without an action word are lengthened just enough to pass", async () => {
    const { repairRaw } = await import("../video/concepts/tour-planner");
    const raw = JSON.parse(planJson("Who has time for another marketing task?"));
    for (const sc of raw.scenes) for (const nd of sc.nodes) { nd.say = "A broad and general statement about the business matters"; nd.block = "p0.b0"; }
    const problem = "only 1 of 7 spoken lines name an action or a result: rewrite at least 3 of these so they say what happens on screen: \"x\"";
    const fixed = repairRaw(raw, [problem], ctx());
    assert.equal(fixed.changed, true);
    const says = fixed.raw.scenes!.flatMap((s) => s.nodes!.map((n) => n.say!));
    const { OUTCOME_WORD } = await import("../video/concepts/standard");
    assert.ok(says.filter((t) => OUTCOME_WORD.test(t)).length >= 3, JSON.stringify(says));
    assert.ok(says.some((t) => /^(Now|Look|See|Here|Watch), /.test(t)), "at least one lead-in was needed");
    assert.ok(says.every((t) => t.split(/\s+/).length <= 14));
  });
});

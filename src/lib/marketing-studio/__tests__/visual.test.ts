import "./setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { groupCaptions } from "../video/demo/audio";
import { headlineFits, stateAt, visualChecks } from "../video/concepts/align";
import { mutateField } from "../video/concepts/discover";
import { rankedPairs, resultLines } from "../video/concepts/generate";
import type { Concept, GeneratorInput, PageDiscovery } from "../video/concepts/types";

describe("calculator discovery values", () => {
  test("quantities change to a different plausible value, years and codes are left alone", () => {
    assert.equal(mutateField({ type: "text", value: "1800", min: "", max: "" })?.value, "2250");
    assert.equal(mutateField({ type: "text", value: "15", min: "1", max: "31" })?.value, "12");
    assert.equal(mutateField({ type: "text", value: "2026", min: "", max: "" }), null);
    assert.equal(mutateField({ type: "text", value: "abc", min: "", max: "" }), null);
    assert.equal(mutateField({ type: "text", value: "2", min: "1", max: "2" })?.value, "1");
  });
  test("a select moves to its next real option", () => {
    assert.deepEqual(mutateField({ type: "select", value: "Actual days in month", options: ["Actual days in month", "30-day month"], min: "", max: "" }), { value: "30-day month", select: true });
  });
  test("the best result line is a figure line, not prose", () => {
    const r = resultLines("This result stays in your browser for this visit. | Prorated rent: $1,350.00 | Daily rate $75.0000 x 18 days");
    assert.equal(r[0], "Prorated rent: $1,350.00");
  });
});

const calcPage: PageDiscovery = {
  path: "/tools/prorated-rent",
  url: "https://rentalnoodle.com/tools/prorated-rent",
  title: "t",
  lines: ["Prorated rent calculator"],
  groups: [],
  links: [],
  searches: [],
  ctas: [],
  discoveredAt: "2026-11-08",
  calcs: [
    {
      id: "/tools/prorated-rent#calc0",
      path: "/tools/prorated-rent",
      heading: "Prorated rent calculator",
      fields: [{ index: 0, label: "Monthly rent ($)", type: "text", value: "1800" }],
      steps: [
        { field: 0, name: "Monthly rent ($)", value: "2250", newText: "Prorated rent: $1,200.00 | Daily rate $75.0000 x 16 days" },
        { field: 3, name: "Occupy start day", value: "12", newText: "Prorated rent: $1,350.00 | Daily rate $75.0000 x 18 days" },
        { field: 4, name: "Occupy end day", value: "27", newText: "Prorated rent: $1,125.00 | Daily rate $75.0000 x 15 days" },
        { field: 5, name: "Day-count convention", value: "30-day month", select: true, newText: "Prorated rent: $1,100.00 | Daily rate $73.3333 x 15 days" },
      ],
    },
  ],
};

describe("calculators are ranked first", () => {
  test("a calculator pair stays on one page and replays earlier entries silently", () => {
    const input = { usedControls: [], angle: { title: "prorated rent", goal: "first rent payment", features: [], scenes: [], hook: "", coreBenefit: "", cta: { url: "https://rentalnoodle.com/" } }, discoveries: [calcPage, { ...calcPage, path: "/", calcs: [], links: [{ index: 0, text: "Plans and prose", href: "https://rentalnoodle.com/p", destHeading: "Plans", destTitle: "p", top: ["One simple place for every rental, and more words here"], lower: ["Who lives there, contact info, and rent terms in prose"] }] }] } as unknown as GeneratorInput;
    const r = rankedPairs(input);
    assert.ok(r.pairs.length > 0);
    const [a, b] = r.pairs[0];
    assert.equal(a.plan.clicks[0].kind, "fill");
    assert.equal(b.plan.path, "/tools/prorated-rent");
    assert.equal(a.plan.prefixFills?.length ?? 0, 0);
    assert.equal(b.plan.prefixFills?.length, 2);
  });
});

describe("headline fit", () => {
  test("short headlines fit, a long one does not", () => {
    assert.ok(headlineFits("Running game nights?"));
    assert.ok(headlineFits("Moving in mid-month? Guess no more."));
    assert.ok(!headlineFits("Moving in mid month and still guessing the first rent payment every single time you move?"));
  });
});

const conceptOf = (step1: string, step2: string): Concept =>
  ({
    slug: "rentalnoodle",
    productName: "RentalNoodle",
    ctaHost: "rentalnoodle.com",
    headlines: { a1: "Prorated rent", end: "Try it." },
    capturePlan: [{ id: "p1", path: "/tools/prorated-rent", heading: "Prorated rent calculator", clicks: [{ kind: "fill", field: 0, name: "Monthly rent ($)", value: "2250", payoff: "Prorated rent: $1,200.00" }, { kind: "fill", field: 3, name: "Occupy start day", value: "12", payoff: "Daily rate $75" }] }],
    narration: [
      { id: "L1", sceneId: "a1", spoken: "Moving in mid-month? Stop guessing rent.", claims: ["c-ctx1"] },
      { id: "L2", sceneId: "a1", spoken: step1, claims: ["c-ctx1", "c-pay1a"] },
      { id: "L3", sceneId: "a1", spoken: step2, claims: ["c-ctx1", "c-pay1b"] },
      { id: "L4", sceneId: "end", spoken: "Try it, at Rental Noodle dot com.", claims: ["c-cta"] },
    ],
  }) as unknown as Concept;
const lt = { L1: { start: 300, end: 2500, durMs: 2200 }, L2: { start: 3000, end: 5500, durMs: 2500 }, L3: { start: 6000, end: 8500, durMs: 2500 }, L4: { start: 9000, end: 11000, durMs: 2000 } };
const timeline = { scenes: [{ id: "a1", kind: "screen", plate: "p1", start: 0, end: 9500, states: [{ at: 0, state: "s0" }, { at: 3200, state: "a" }, { at: 6200, state: "b" }] }, { id: "end", kind: "end", start: 9100, end: 11500 }] };
const manifest = {
  plates: {
    p1: {
      title: "Prorated Rent Calculator",
      rects: { boxB: [20, 300, 350, 110] },
      meta: { resultFontPx: 24 },
      states: {
        s0: { file: "p1-s0.jpg", label: "before", visible: "Prorated rent calculator | Monthly rent ($) | 1800 | Prorated rent: $960.00 | Daily rate $60" },
        a: { file: "p1-a.jpg", label: "a", result: "Prorated rent: $1,200.00", visible: "Prorated rent calculator | Monthly rent ($) | 2250 | Prorated rent: $1,200.00 | Daily rate $75" },
        b: { file: "p1-b.jpg", label: "b", result: "Daily rate $75", visible: "Prorated rent calculator | Occupy start day | 12 | Prorated rent: $1,350.00 | Daily rate $75 | 18 days" },
      },
    },
  },
};

describe("post-render visual alignment", () => {
  test("which screen is showing follows the finished timeline", () => {
    assert.equal(stateAt(timeline as never, 1000)?.state, "s0");
    assert.equal(stateAt(timeline as never, 4000)?.state, "a");
    assert.equal(stateAt(timeline as never, 7000)?.state, "b");
  });
  test("narration that matches what is on screen passes", async () => {
    const r = await visualChecks({ concept: conceptOf("{a1}Type 2250 for monthly rent and see the prorated rent update.", "{b1}Pick the start day 12 and watch the daily rate."), manifest: manifest as never, lineTimes: lt, timeline: timeline as never, platesDir: "/nonexistent" });
    const align = r.find((x) => x.id === "visual_alignment")!;
    assert.ok(align.ok, align.detail);
    assert.ok(r.find((x) => x.id === "payoff_framing")!.ok);
  });
  test("narration about something that is not on screen fails", async () => {
    const r = await visualChecks({ concept: conceptOf("{a1}Open the signup page and see the standings leaderboard.", "{b1}Pick the start day 12 and watch the daily rate."), manifest: manifest as never, lineTimes: lt, timeline: timeline as never, platesDir: "/nonexistent" });
    const align = r.find((x) => x.id === "visual_alignment")!;
    assert.ok(!align.ok);
    assert.match(align.detail, /standings|signup/);
  });
  test("a result narrated before it appears fails", async () => {
    const c = conceptOf("{a1}Type 2250 for monthly rent and see the prorated rent update.", "{b1}Pick the start day 12 and watch the daily rate.");
    const early = { L1: lt.L1, L2: { start: 1000, end: 2800, durMs: 1800 }, L3: lt.L3, L4: lt.L4 };
    const r = await visualChecks({ concept: c, manifest: manifest as never, lineTimes: early, timeline: timeline as never, platesDir: "/nonexistent" });
    assert.ok(!r.find((x) => x.id === "visual_alignment")!.ok);
  });
  test("an empty-result state and a clipped headline fail the framing check", async () => {
    const c = conceptOf("{a1}Type 2250 for monthly rent and see the prorated rent update.", "{b1}Pick the start day 12 and watch the daily rate.");
    c.headlines.a1 = "Moving in mid month and still guessing the first rent payment every single time you move?";
    const m = JSON.parse(JSON.stringify(manifest));
    m.plates.p1.states.a.result = "No results found yet";
    const r = await visualChecks({ concept: c, manifest: m as never, lineTimes: lt, timeline: timeline as never, platesDir: "/nonexistent" });
    const f = r.find((x) => x.id === "payoff_framing")!;
    assert.ok(!f.ok);
    assert.match(f.detail, /empty or error state/);
    assert.match(f.detail, /headline/);
  });
});

describe("caption holds", () => {
  test("the last caption of a line never runs into the next line even with a 200ms line gap", () => {
    const first = groupCaptions([{ text: "Tap", from: 0, to: 200 }, { text: "Mon,", from: 200, to: 600 }], 0);
    const second = groupCaptions([{ text: "Tap", from: 0, to: 200 }, { text: "Tue,", from: 200, to: 600 }], 600 + 200);
    assert.ok(second[0].from >= first[first.length - 1].to - 40, `${second[0].from} vs ${first[first.length - 1].to}`);
  });
});

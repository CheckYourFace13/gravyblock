import "./setup";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../db";
import { computeAllowance, type VideoEvent } from "../entitlements";
import { createProduct, listFacts } from "../repository";
import { INTERNAL_SCOPE } from "../scope";
import { setSetting } from "../runtime";
import { mergeOverrides, emptyOverrides } from "../publishing/review-intent";
import { AllowanceWait, runReplacementJob, queueReplacement, type ReplacementDeps } from "../publishing/review-replacement";
import { requestChanges, getReview, recordUnlistedReview } from "../publishing/video-review";
import { applyPlan, ensureMarkers, snapshotOf, type ApplyContext } from "../revisions/apply";
import { candidatesFor } from "../revisions/candidates";
import { listRevisions } from "../revisions/history";
import { interpretNote, modelInput, rulesPlan, type PlanView, type Planner } from "../revisions/plan";
import { fetchPageText, flagForCorrection, flagsKey, listFlags, recheckProductTruth } from "../revisions/recheck";
import { copyFor, prepareRevision, scrubDescription, swapDuplicateTaps, swapFlaggedTaps } from "../revisions/run";
import { abbreviationsIn, expandAbbreviations, markersIn, placeMarker, removePhrase, withoutMarker } from "../revisions/text";
import { hintsFromForm } from "../publishing/review-flow";
import { connectAccount } from "../publishing/connections";
import { YT_SCOPE_MANAGE, YT_SCOPE_READ, YT_SCOPE_UPLOAD } from "../publishing/youtube-api";
import { applyScriptEdits, planHandwritten } from "../revisions/handwritten";
import { DEMO_SPECS, demoSpecFor } from "../video/demo/specs";
import { buildConceptTimeline, layoutConcept } from "../video/concepts/build";
import { conceptKey } from "../video/concepts/registry";
import { timing } from "../video/concepts/generate";
import { personalityFor } from "../video/concepts/standard";
import { pageVocabulary } from "../video/concepts/validate";
import type { Concept, PageDiscovery } from "../video/concepts/types";
import type { Manifest } from "../video/demo/types";
import type { EditPlan } from "../revisions/types";
import { applyStrategy, classifyFailure, escalate, NO_STRATEGY } from "../revisions/heal";
import { captureSource, reconstructConcept, restoreSource } from "../revisions/source";
import { saveRevision } from "../revisions/history";
import { sendChangesReceivedEmail } from "../publishing/review-notify";
import { stripMarkers } from "../revisions/text";

const HAVE_DB = Boolean(process.env.STUDIO_TEST_DATABASE_URL);

// ---- fixtures: the real BoatingChicago and MicStage scripts the owner reviewed ----------------------------------------------------------------

const brand = { name: "BoatingChicago", accent: "#0b6fb8", dark: "#0a1f33", light: "#ffffff" };
const discoveries: PageDiscovery[] = [
  {
    path: "/marinas", url: "https://boatingchicago.com/marinas", title: "Marinas", discoveredAt: "2026-11-01T00:00:00Z", ctas: [], links: [], searches: [],
    lines: ["Marinas & Harbors Near Chicago", "13 verified marinas & harbors", "Belmont Harbor", "Burnham Harbor"],
    groups: [
      { id: "/marinas#1", path: "/marinas", heading: "Marinas & Harbors Near Chicago", controls: [{ index: 5, name: "All waters" }, { index: 6, name: "Lake Michigan" }, { index: 7, name: "Inland lakes / chain" }], sequence: [{ control: 5, newText: "" }, { control: 6, newText: "Showing 13 of 13 verified marinas on Lake Michigan." }, { control: 7, newText: "Showing 0 of 13 verified marinas on inland lakes or the Fox River chain." }, { control: 5, newText: "Showing 13 of 13 verified marinas." }] },
      { id: "/marinas#0", path: "/marinas", heading: "Marinas & Harbors Near Chicago", controls: [{ index: 1, name: "Fuel" }, { index: 2, name: "Pump-out" }, { index: 3, name: "Transient dockage" }, { index: 4, name: "Boat launch ramp" }], sequence: [{ control: 1, newText: "Showing 4 of 13 verified marinas with confirmed fuel." }, { control: 2, newText: "Showing 5 of 13 verified marinas with confirmed pump-out." }, { control: 3, newText: "Showing 3 of 13 verified marinas with confirmed transient dockage." }, { control: 4, newText: "Showing 4 of 13 verified marinas with confirmed boat launch ramp." }] },
    ],
  },
  {
    path: "/map", url: "https://micstage.com/map", title: "Map", discoveredAt: "2026-11-01T00:00:00Z", ctas: [], links: [], searches: [], lines: ["Open mic map"],
    groups: [{ id: "/map#0", path: "/map", heading: "Open mic map", controls: [{ index: 3, name: "Wed" }, { index: 4, name: "Thu" }], sequence: [{ control: 3, newText: "Map: 87 in view · List: 15 match filters · Total: 87 on map | Tandem San Antonio | San Antonio, TX" }, { control: 4, newText: "Open Mic Night at DALEEE KTAOS | Taos, NM | Open mic: Thursday | Third Coast Comedy Club | Nashville, TN" }] }],
  },
];

type Step = Concept["capturePlan"][number]["clicks"][number];
const click = (control: number, name: string, payoff: string): Step => ({ kind: "click", control, name, payoff });
const plate = (id: string, path: string, groupId: string, heading: string, a: Step, b: Step): Concept["capturePlan"][number] => ({ id, path, groupId, heading, prefix: [], controls: [], clicks: [a, b] });

/** A video of `n` scenes: the hook and its two taps, then every further scene with two taps and a closing line, then the closing card. */
function marina(n = 2): Concept {
  const plates = [
    plate("p1", "/marinas", "/marinas#0", "Marinas & Harbors Near Chicago", click(1, "Fuel", "Showing 4 of 13 verified marinas with confirmed fuel."), click(2, "Pump-out", "Showing 5 of 13 verified marinas with confirmed pump-out.")),
    plate("p2", "/marinas", "/marinas#0", "Marinas & Harbors Near Chicago", click(3, "Transient dockage", "Showing 3 of 13 verified marinas with confirmed transient dockage."), click(4, "Boat launch ramp", "Showing 4 of 13 verified marinas with confirmed boat launch ramp.")),
    plate("p3", "/marinas", "/marinas#1", "Marinas & Harbors Near Chicago", click(6, "Lake Michigan", "Showing 13 of 13 verified marinas on Lake Michigan."), click(7, "Inland lakes / chain", "Showing 0 of 13 verified marinas on inland lakes or the Fox River chain.")),
  ].slice(0, n);
  const narration: Concept["narration"] = [{ id: "L1", sceneId: "a1", spoken: "Need fuel and a slip?", claims: ["c-ctx1"] }];
  const claims: Concept["claims"] = [];
  const claimsUsed: Concept["claimsUsed"] = [];
  const onScreen: Concept["onScreen"] = [{ sceneId: "a1", kind: "headline", text: "Need fuel and a slip?", claim: "c-ctx1" }];
  const lines: Array<[string, string, string, string]> = [
    ["a1", "{a1}Tap Fuel and marinas with confirmed fuel show up.", "c-ctx1,c-pay1a", "L2"],
    ["a1", "{b1}Try Pump-out next, and marinas with confirmed pump-out appear.", "c-ctx1,c-pay1b", "L3"],
    ["a2", "{a2}Pick Transient dockage for confirmed transient dockage.", "c-ctx2,c-pay2a", "L4"],
    ["a2", "{b2}Tap Boat launch ramp for a confirmed launch ramp.", "c-ctx2,c-pay2b", "L5"],
    ["a2", "Pick your harbor, then go.", "c-ctx2", "L6"],
    ["a3", "{a3}Tap Lake Michigan and see all thirteen verified marinas.", "c-ctx3,c-pay3a", "L7"],
    ["a3", "{b3}Pick inland lakes and the page shows none, so you know where to skip.", "c-ctx3,c-pay3b", "L8"],
  ];
  const want = lines.filter((l) => Number(l[0].slice(1)) <= n);
  for (const [scene, spoken, cl, id] of want) narration.push({ id, sceneId: scene, spoken, claims: cl.split(",") });
  narration.push({ id: "L10", sceneId: "end", spoken: "Find your harbor now, at Boating Chicago dot com.", caption: "Find your harbor now, at boatingchicago.com.", claims: ["c-cta"] });
  plates.forEach((p, i) => {
    const k = i + 1;
    claims.push({ id: `c-ctx${k}`, text: `The product has a "${p.heading}" area, shown with: ${p.clicks[0].kind === "scroll" ? "" : (p.clicks[0] as { name: string }).name} and ${(p.clicks[1] as { name: string }).name}.`, facts: [p.heading], sources: [{ plate: p.id, quote: p.heading }] });
    p.clicks.forEach((s, j) => {
      const id = `c-pay${k}${j === 0 ? "a" : "b"}`;
      claims.push({ id, text: `After opening "${(s as { name: string }).name}" the page shows: ${s.payoff}`, facts: [s.payoff], sources: [{ plate: p.id, quote: s.payoff }] });
      claimsUsed.push({ id, text: `After opening "${(s as { name: string }).name}" the page shows: ${s.payoff}`, quote: s.payoff, path: p.path });
      onScreen.push({ sceneId: `a${k}`, kind: "label", text: (s as { name: string }).name, claim: id });
    });
    claimsUsed.push({ id: `c-ctx${k}`, text: claims[claims.length - 3].text, quote: p.heading, path: p.path });
  });
  claims.push({ id: "c-cta", text: "The invitation leads to https://boatingchicago.com/marinas.", facts: ["Marinas & Harbors Near Chicago"], sources: [{ plate: "p1", quote: "Marinas & Harbors Near Chicago" }] });
  onScreen.push({ sceneId: "end", kind: "headline", text: "Find your harbor now.", claim: "c-cta" }, { sceneId: "end", kind: "cta", text: "Explore BoatingChicago", claim: "c-cta" });
  const c: Concept = {
    version: 1, specId: "boatingchicago:marina-and-launch-directories", slug: "boatingchicago", productName: "BoatingChicago", variant: 0,
    angle: { id: "a", role: "A", title: "Marina and launch directories", funnel: "x" }, personality: "boating_travel", hookStyle: "question",
    hook: "Need fuel and a slip?", audience: "boaters", problem: "finding a marina with the right amenities fast", payoff: [], whyItMatters: "find the right harbor quickly", tone: "t", pacing: "1", structure: "s",
    cta: { text: "Explore BoatingChicago", url: "https://boatingchicago.com/marinas", display: "boatingchicago.com" },
    capturePlan: plates, claimsUsed, title: "BoatingChicago: marina and launch directories", narration, claims, facts: plates.flatMap((p) => p.clicks.map((s) => ({ plate: p.id, value: s.payoff }))), onScreen,
    sceneMeta: Object.fromEntries(plates.map((p, i) => [`a${i + 1}`, { plate: p.id, purpose: "p", motion: ["a", "b", "c"], note: "n" }])),
    headlines: { ...Object.fromEntries(plates.map((_, i) => [`a${i + 1}`, i === 0 ? "Need fuel and a slip?" : "Marinas & Harbors Near Chicago"])), end: "Find your harbor now." },
    brand, origin: "https://boatingchicago.com", ctaHost: "boatingchicago.com", estSeconds: 0, estFirstTapMs: 0,
  };
  c.payoff = plates.flatMap((p) => p.clicks.map((s) => s.payoff));
  Object.assign(c, timing(c.narration, personalityFor(c.slug)));
  return c;
}

/** MicStage: the Thursday tap shows a place the owner did not recognise, and the control labels are abbreviated. */
function micstage(): Concept {
  const c = marina(2);
  c.slug = "micstage";
  c.productName = "MicStage";
  c.specId = "micstage:slot-4";
  c.origin = "https://micstage.com";
  c.ctaHost = "micstage.com";
  c.capturePlan = [plate("p1", "/map", "/map#0", "Open mic map", click(3, "Wed", "Map: 87 in view · List: 15 match filters · Total: 87 on map"), click(4, "Thu", "Open Mic Night at DALEEE KTAOS")), c.capturePlan[1]];
  c.claims = c.claims.map((x) => (x.id === "c-pay1a" ? { ...x, text: 'After opening "Wed" the page shows: Map: 87 in view · List: 15 match filters · Total: 87 on map', facts: ["Map: 87 in view · List: 15 match filters · Total: 87 on map"], sources: [{ plate: "p1", quote: "Map: 87 in view · List: 15 match filters · Total: 87 on map" }] } : x.id === "c-pay1b" ? { ...x, text: 'After opening "Thu" the page shows: Open Mic Night at DALEEE KTAOS', facts: ["Open Mic Night at DALEEE KTAOS"], sources: [{ plate: "p1", quote: "Open Mic Night at DALEEE KTAOS" }] } : x));
  c.claimsUsed = c.claimsUsed.map((u) => (u.id === "c-pay1a" ? { ...u, quote: "Map: 87 in view · List: 15 match filters · Total: 87 on map", path: "/map" } : u.id === "c-pay1b" ? { ...u, quote: "Open Mic Night at DALEEE KTAOS", path: "/map" } : u));
  c.facts = [{ plate: "p1", value: "Map: 87 in view · List: 15 match filters · Total: 87 on map" }, { plate: "p1", value: "Open Mic Night at DALEEE KTAOS" }, ...c.facts.filter((f) => f.plate !== "p1")];
  c.onScreen = c.onScreen.map((o) => (o.text === "Fuel" ? { ...o, text: "Wed" } : o.text === "Pump-out" ? { ...o, text: "Thu" } : o));
  c.narration[0].spoken = "Open mic tonight? Find one nearby";
  c.narration.find((l) => l.id === "L2")!.spoken = "{a1}Tap Wed and watch the map fill with matching open mics.";
  c.narration.find((l) => l.id === "L3")!.spoken = "{b1}Pick Thu and land on Open Mic Night at DALEEE KTAOS.";
  c.narration[c.narration.length - 1].spoken = "Find your open mic, at Mic Stage dot com.";
  c.narration[c.narration.length - 1].caption = "Find your open mic, at micstage.com.";
  c.hook = "Open mic tonight? Find one nearby";
  c.headlines.a1 = c.hook;
  c.onScreen = c.onScreen.map((o) => (o.kind === "headline" && o.sceneId === "a1" ? { ...o, text: c.hook } : o));
  c.payoff = c.capturePlan.flatMap((p) => p.clicks.map((s) => s.payoff));
  Object.assign(c, timing(c.narration, personalityFor(c.slug)));
  return c;
}

const ctxFor = (c: Concept, over: Partial<ApplyContext> = {}): ApplyContext => ({ candidates: candidatesFor(c, discoveries, over.flagged ?? []), vocabulary: pageVocabulary(discoveries), factText: discoveries.flatMap((d) => [...d.lines, ...d.groups.flatMap((g) => g.sequence.map((s) => s.newText.replace(/ \| /g, " ")))]).join(" ").toLowerCase(), prohibited: [], flagged: [], ...over });
const plan = (ops: EditPlan["ops"], over: Partial<EditPlan> = {}): EditPlan => ({ summary: ["edit"], ops, ...over });
const ok = (r: ReturnType<typeof applyPlan>) => {
  assert.ok(r.ok, r.ok ? "" : r.reason);
  return r as Extract<ReturnType<typeof applyPlan>, { ok: true }>;
};
const plain = (s: string) => s.replace(/\{[a-z0-9_-]+\}/gi, "");
const markersOf = (c: Concept) => c.narration.flatMap((l) => [...l.spoken.matchAll(/\{([a-z0-9_-]+)\}/gi)].map((m) => m[1]));

const synthManifest = (c: Concept): Manifest =>
  ({
    logo: { file: "logo.png", w: 100, h: 100 },
    plates: Object.fromEntries(c.capturePlan.map((p) => [p.id, { id: p.id, url: "u", title: "t", capturedAt: "", text: "", w: 390, h: 1000, states: { s0: { file: "s0.png", label: "" }, a: { file: "a.png", label: "" }, b: { file: "b.png", label: "" } }, rects: { head: [0, 0, 390, 60], cA: [20, 100, 150, 40], boxA: [20, 160, 350, 120], cB: [200, 100, 150, 40], boxB: [20, 300, 350, 120] } }])),
  }) as unknown as Manifest;
const timelineOf = (c: Concept) => {
  const dur = Object.fromEntries(c.narration.map((l) => [l.id, plain(l.spoken).split(/\s+/).length * 330]));
  const lt = layoutConcept(c)(dur);
  return { lt, built: buildConceptTimeline(c)(synthManifest(c), lt) };
};

describe("change requests V2: text and structure edits (pure)", () => {
  test("remove a sentence: the clause goes, the rest is tidy and the timing markers survive", () => {
    const line = "Build it with simple blocks, check the {mob}phone preview, and {sc}Send Confidence flags problems, like a missing unsubscribe link.";
    const r = removePhrase(line, "like a missing unsubscribe link");
    assert.equal(r?.text, "Build it with simple blocks, check the {mob}phone preview, and {sc}Send Confidence flags problems.");
    const fuzzy = removePhrase(line, "missing unsubscribe link");
    assert.equal(fuzzy?.text, "Build it with simple blocks, check the {mob}phone preview, and {sc}Send Confidence flags problems.");
    assert.equal(removePhrase(line, "pricing and discounts"), null, "a phrase the line does not say is reported, not guessed");
  });

  test("remove a phrase with an owner-style request: the rules find the line and cut the clause", () => {
    const c = marina(2);
    c.narration.find((l) => l.id === "L6")!.spoken = "Pick your harbor, then go, whatever the weather.";
    const view = view_(c);
    const { plan: p, unresolved } = rulesPlan("Remove the part about the weather", view);
    assert.deepEqual(unresolved, []);
    assert.deepEqual(p.ops, [{ op: "remove_text", line: "L6", phrase: "whatever the weather" }]);
    const r = ok(applyPlan(c, p, ctxFor(c)));
    assert.equal(plain(r.concept.narration.find((l) => l.id === "L6")!.spoken), "Pick your harbor, then go.");
  });

  test("remove a scene: its plate, lines, claims and on-screen text go; later scenes are renumbered and every marker stays unique", () => {
    const c = marina(3);
    const r = ok(applyPlan(c, plan([{ op: "remove_scene", scene: "a2" }]), ctxFor(c)));
    assert.equal(r.concept.capturePlan.length, 2);
    assert.deepEqual(r.concept.capturePlan.map((p) => p.id), ["p1", "p3"]);
    assert.ok(!r.concept.narration.some((l) => /transient|launch/i.test(l.spoken)));
    assert.deepEqual(r.concept.narration.filter((l) => l.sceneId === "a2").map((l) => l.id), ["L7", "L8"], "the old third scene is now the second");
    const m = markersOf(r.concept).sort();
    assert.deepEqual(m, ["a1", "a2", "b1", "b2"]);
    assert.ok(r.concept.claims.some((x) => x.id === "c-pay2a" && /Lake Michigan/.test(x.text)), "claim ids follow the scene numbers");
    assert.ok(!r.concept.onScreen.some((o) => /Transient/.test(o.text)));
    assert.ok(r.affected.includes("a2"));
  });

  test("removing the first scene keeps the hook and moves it to the new first scene", () => {
    const c = marina(3);
    const r = ok(applyPlan(c, plan([{ op: "remove_scene", scene: "a1" }]), ctxFor(c)));
    assert.equal(r.concept.narration[0].id, "L1");
    assert.equal(r.concept.narration[0].sceneId, "a1");
    assert.deepEqual(markersOf(r.concept).sort(), ["a1", "a2", "b1", "b2"]);
  });

  test("removing a scene that would leave the video too short is refused with the numbers (the engine then asks for a replacement instead)", () => {
    const c = marina(2);
    const r = applyPlan(c, plan([{ op: "remove_scene", scene: "a2" }]), ctxFor(c));
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.reason, /too short|spoken lines/);
  });

  test("rewrite a line: only that line changes, its marker stays, and the words must come from the product", () => {
    const c = marina(2);
    const r = ok(applyPlan(c, plan([{ op: "rewrite_line", line: "L2", spoken: "Tap Fuel and watch the list narrow to marinas with confirmed fuel." }]), ctxFor(c)));
    assert.match(r.concept.narration.find((l) => l.id === "L2")!.spoken, /^\{a1\}Tap Fuel and watch/);
    const bad = applyPlan(c, plan([{ op: "rewrite_line", line: "L2", spoken: "Tap Fuel and save forty percent on every guaranteed slip." }]), ctxFor(c));
    assert.equal(bad.ok, false, "an invented figure or promise is never accepted");
  });

  test("consolidate a repeated phrase into one line per scene while every tap keeps its line and marker", () => {
    const c = marina(2);
    const r = ok(
      applyPlan(c, plan([
        { op: "rewrite_line", line: "L2", spoken: "Tap Fuel, then Pump-out, and each list narrows to marinas with that confirmed." },
        { op: "remove_line", line: "L3" },
        { op: "rewrite_line", line: "L4", spoken: "Pick Transient dockage or Boat launch ramp and the list narrows the same way." },
        { op: "remove_line", line: "L5" },
      ], { sentiment: "positive" }), ctxFor(c)),
    );
    assert.deepEqual(markersOf(r.concept).sort(), ["a1", "a2", "b1", "b2"], "the taps still land on words of the new lines");
    assert.ok(r.concept.narration.length < c.narration.length);
    const said = r.concept.narration.map((l) => plain(l.spoken)).join(" ");
    assert.equal((said.match(/confirmed/gi) ?? []).length, 1, "the repeated phrase is said once");
    // consolidate op: merge two lines of one scene
    const m = ok(applyPlan(c, plan([{ op: "consolidate", lines: ["L2", "L3"], spoken: "Tap Fuel, then Pump-out, and marinas with each confirmed show up." }]), ctxFor(c)));
    assert.ok(m.concept.narration.find((l) => l.id === "L2")!.spoken.includes("{b1}") && !m.concept.narration.some((l) => l.id === "L3"));
    assert.equal(applyPlan(c, plan([{ op: "consolidate", lines: ["L2", "L4"], spoken: "Tap Fuel." }]), ctxFor(c)).ok, false, "lines of different scenes are never merged");
  });

  test("replace a location or example with a verified one: only a real probed alternative can be chosen, and the claim, fact and payoff follow", () => {
    const c = micstage();
    const cx = ctxFor(c);
    const pick = cx.candidates.find((x) => x.plate === "p1" && x.step === 2 && x.def.kind === "click" && x.def.payoff === "Nashville, TN");
    assert.ok(pick, "Nashville is a real result the page showed after tapping Thu");
    const r = ok(applyPlan(c, plan([{ op: "replace_step", plate: "p1", step: 2, candidate: pick!.id }, { op: "rewrite_line", line: "L3", spoken: "Pick Thu and see Nashville, TN on the list." }]), cx));
    assert.equal(r.concept.capturePlan[0].clicks[1].payoff, "Nashville, TN");
    assert.match(r.concept.claims.find((x) => x.id === "c-pay1b")!.text, /Nashville, TN/);
    assert.ok(r.concept.facts.some((f) => f.value === "Nashville, TN") && !r.concept.facts.some((f) => /KTAOS/.test(f.value)));
    assert.ok(!JSON.stringify(r.concept).includes("KTAOS"), "the place the owner did not know is gone from the whole script");
    assert.ok(r.concept.payoff.includes("Nashville, TN"));
    assert.equal(applyPlan(c, plan([{ op: "replace_step", plate: "p1", step: 2, candidate: "made.up.id" }]), cx).ok, false, "an invented alternative is refused");
  });

  test("spell out abbreviations: narration, captions, on-screen text and the focus label say the full word", () => {
    const c = micstage();
    assert.deepEqual(abbreviationsIn("Tap Wed or Thu then Sat."), ["Wed", "Thu", "Sat"]);
    assert.equal(expandAbbreviations("Pick {b1}Thu and Wed."), "Pick {b1}Thursday and Wednesday.");
    const r = ok(applyPlan(c, plan([{ op: "expand_abbreviations", words: ["Wed", "Thu"] }]), ctxFor(c)));
    const said = r.concept.narration.map((l) => plain(l.spoken)).join(" ");
    assert.match(said, /Tap Wednesday/);
    assert.match(said, /Pick Thursday/);
    assert.ok(!/\b(Wed|Thu)\b/.test(said));
    assert.ok(r.concept.onScreen.some((o) => o.text === "Wednesday") && r.concept.onScreen.some((o) => o.text === "Thursday"));
    assert.equal((r.concept.capturePlan[0].clicks[0] as { display?: string }).display, "Wednesday", "the label on the video says Wednesday while the control it taps is still found by its real name");
    assert.equal((r.concept.capturePlan[0].clicks[0] as { name: string }).name, "Wed");
  });

  test("pronunciation and pacing become voice settings, not script edits; a respelled word is refused", () => {
    const c = marina(2);
    const r = ok(applyPlan(c, plan([{ op: "pronunciation", written: "boatingchicago", spoken: "Boating Chicago" }, { op: "pace", direction: "slower", amount: "slightly" }, { op: "zoom", direction: "closer" }]), ctxFor(c)));
    assert.deepEqual(r.intents.map((i) => i.type).sort(), ["lexicon", "pace"]);
    const ov = mergeOverrides(emptyOverrides(), r.intents, "x");
    assert.equal(ov.lexicon.boatingchicago, "Boating Chicago");
    assert.ok(ov.paceFactor < 1);
    assert.equal(r.concept.zoomBias, 0.06);
    assert.equal(applyPlan(c, plan([{ op: "pronunciation", written: "boatingchicago", spoken: "Chicago Boats" }]), ctxFor(c)).ok, false);
    assert.deepEqual(r.concept.narration.map((l) => l.spoken), c.narration.map((l) => l.spoken), "the written script is untouched by a voice edit");
  });

  test("unaffected scenes, lines and taps are left exactly as they were", () => {
    const c = marina(3);
    const r = ok(applyPlan(c, plan([{ op: "remove_text", line: "L8", phrase: "so you know where to skip" }]), ctxFor(c)));
    for (const id of ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L10"]) assert.deepEqual(r.concept.narration.find((l) => l.id === id), c.narration.find((l) => l.id === id));
    assert.deepEqual(r.concept.capturePlan, c.capturePlan);
    assert.deepEqual(r.changedLines, ["L8"]);
  });

  test("factual concern: the claim is removed from the video whether or not the page still shows it, and nothing in the result repeats it", () => {
    const c = marina(3);
    const view = view_(c);
    const { plan: p } = rulesPlan("Remove the part about inland lakes, it looks like that's an error on the website", view);
    assert.equal(p.ops[0].op, "remove_step", "the inland-lakes line is a tap, so the tap itself is replaced");
    assert.ok(p.factual && p.factual.phrases.some((x) => /inland lakes/i.test(x)));
    const cx = ctxFor(c, { flagged: p.factual!.phrases });
    const r = ok(applyPlan(c, plan([...p.ops, { op: "rewrite_line", line: "L8", spoken: "Switch to All waters and see all 13 verified marinas." }], { factual: p.factual }), cx));
    assert.ok(!/inland|fox river/i.test(JSON.stringify(r.concept)), "no sign of the doubted claim is left anywhere in the script");
    assert.equal(r.concept.capturePlan[2].clicks[1].payoff, "Showing 13 of 13 verified marinas.");
    // a plan that leaves it in is refused
    const stays = applyPlan(c, plan([{ op: "rewrite_line", line: "L6", spoken: "Pick your harbor, then go." }], { factual: p.factual }), cx);
    assert.equal(stays.ok, false);
  });

  test("with the model unavailable, praise is not an error and an unresolved sentence is reported back, never dropped", async () => {
    const c = marina(2);
    const out = await interpretNote("I like this, but it's too repetitive. Can you list all the options once instead of the repeated phrase?", view_(c), {});
    assert.equal(out.plan.sentiment, "positive");
    assert.deepEqual(out.plan.ops, []);
    assert.ok(out.plan.unresolved?.some((s) => /repetitive/.test(s)) && !out.plan.unresolved?.some((s) => /^I like this/.test(s)));
  });

  test("a multi-part note: the rules take the plain parts, the model gets the rest, and one qualitative sentence never rejects the whole note", async () => {
    const c = micstage();
    const note = "Utilize places in united states, I dont know the city you mentioned. also instead of using the abbreviated word (like Wed  or Thu) use the full word, like Wednesday or Thursday";
    let seen = "";
    const planner: Planner = async (i) => {
      seen = modelInput(i);
      const pick = i.view.candidates.find((x) => x.label.includes("Nashville, TN"))!;
      return { micros: 4200, plan: { sentiment: "neutral", summary: ["show a familiar U.S. city"], ops: [{ op: "replace_step", plate: "p1", step: 2, candidate: pick.id }, { op: "rewrite_line", line: "L3", spoken: "Pick Thu and see Nashville, TN on the list." }] } };
    };
    const out = await interpretNote(note, view_(c), { planner, hints: { kinds: ["example"] } });
    assert.equal(out.by, "both");
    assert.equal(out.micros, 4200);
    assert.deepEqual(out.plan.ops.map((o) => o.op), ["expand_abbreviations", "replace_step", "rewrite_line"]);
    assert.ok(seen.includes("\"hints\"") && seen.includes("CANDIDATES"), "the model is shown the note, the script, the real alternatives and the hints only");
    const r = ok(applyPlan(c, out.plan, ctxFor(c)));
    const said = r.concept.narration.map((l) => plain(l.spoken)).join(" ");
    assert.match(said, /Wednesday/);
    assert.match(said, /Nashville, TN/);
    assert.ok(!/Taos|KTAOS|\bThu\b/.test(JSON.stringify(r.concept.narration)));
  });

  test("the timeline is recalculated from the edited script: it gets shorter, captions follow the new words, later lines start earlier", () => {
    const c = marina(3);
    const before = timelineOf(c);
    const r = ok(applyPlan(c, plan([{ op: "remove_text", line: "L8", phrase: "so you know where to skip" }, { op: "rewrite_line", line: "L7", spoken: "Tap Lake Michigan and see all thirteen verified marinas." }]), ctxFor(c)));
    const after = timelineOf(r.concept);
    assert.ok(after.built.timeline.durationMs < before.built.timeline.durationMs, "shorter script, shorter video");
    assert.ok(after.lt.L10.start < before.lt.L10.start, "everything after the edit moves up");
    assert.equal(after.lt.L1.start, before.lt.L1.start, "before the edit nothing moves");
    const caption = after.built.timeline.captions.map((x) => x.words.map((w) => w.text).join(" ")).join(" ");
    assert.ok(!/skip/.test(caption) && /see all thirteen/.test(caption), "captions are regenerated from the new script");
    // narration timing is regenerated for a removed line
    const gone = ok(applyPlan(c, plan([{ op: "remove_line", line: "L6" }]), ctxFor(c)));
    assert.equal(timelineOf(gone.concept).lt.L6, undefined);
    assert.ok(timelineOf(gone.concept).built.timeline.durationMs < before.built.timeline.durationMs);
  });

  test("the estimated length is recalculated after an edit", () => {
    const c = marina(3);
    const r = ok(applyPlan(c, plan([{ op: "remove_text", line: "L8", phrase: "so you know where to skip" }]), ctxFor(c)));
    assert.ok(c.estSeconds > 0 && r.concept.estSeconds < c.estSeconds, `${r.concept.estSeconds} should be shorter than ${c.estSeconds}`);
  });

  test("a revision that comes out too short gets air between lines instead of failing the length gate", () => {
    const c = marina(3);
    const r = ok(applyPlan(c, plan([{ op: "remove_line", line: "L6" }]), ctxFor(c)));
    if (r.concept.gapExtraMs) {
      assert.ok(r.concept.estSeconds >= 22.5, `padded to ${r.concept.estSeconds}`);
      assert.ok(r.concept.gapExtraMs <= 4500);
    } else assert.ok(r.concept.estSeconds >= 23 || r.concept.estSeconds < 15);
    const plain = { ...r.concept, gapExtraMs: undefined };
    assert.ok(timelineOf(r.concept).built.timeline.durationMs >= timelineOf(plain).built.timeline.durationMs, "the render timeline uses the extra gap");
  });

  test("a tap marker that ended up on a line about something else is moved onto the line that says what the tap shows", () => {
    const c = marina(3);
    const owner = c.narration.find((l) => l.claims.includes("c-pay1b"))!;
    owner.spoken = withoutMarker(owner.spoken, "b1");
    c.narration[0].spoken = placeMarker(c.narration[0].spoken, "b1", "start");
    assert.deepEqual(ensureMarkers(c), []);
    assert.ok(markersIn(owner.spoken).includes("b1"));
    assert.ok(!markersIn(c.narration[0].spoken).includes("b1"));
  });

  test("a hand-written script (SendFable) is edited line by line over its own timeline, and the edit is stored as the difference from the original", () => {
    const spec = DEMO_SPECS.sendfable;
    applyScriptEdits(spec, null);
    const hand: PlanView = { product: "SendFable", productHost: "sendfable.com", cta: spec.cta, lines: spec.narration.map((l) => ({ id: l.id, scene: l.sceneId, text: plain(l.spoken), ...(l.caption ? { caption: l.caption } : {}), claims: l.claims })), taps: [], candidates: [], facts: [], prohibited: [], earlier: [], estSeconds: 0, structure: "hand_written", voiceFacts: [] };
    const { plan: p, unresolved } = rulesPlan("Remove the part about missing unsubscribe link", hand);
    assert.deepEqual(unresolved, []);
    assert.deepEqual(p.ops, [{ op: "remove_text", line: "L4", phrase: "like a missing unsubscribe link" }]);
    const r = planHandwritten(spec, p);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(Object.keys(r.edits.lines), ["L4"], "only the one line differs from the original");
    try {
      applyScriptEdits(spec, r.edits);
      const l4 = spec.narration.find((l) => l.id === "L4")!;
      assert.equal(l4.spoken, "Build it with simple blocks, check the {mob}phone preview, and {sc}Send Confidence flags problems.");
      assert.ok(!/unsubscribe/i.test(spec.claims.find((x) => x.id === "c-builder")!.text), "the claim no longer promises it either");
      assert.ok(l4.spoken.includes("{mob}") && l4.spoken.includes("{sc}"), "the timeline anchors survive, so the timeline rebuilds from the new audio");
    } finally {
      applyScriptEdits(spec, null);
    }
    assert.match(spec.narration.find((l) => l.id === "L4")!.spoken, /unsubscribe link./, "the original text is restored when the edits are cleared");
    assert.equal(planHandwritten(spec, { summary: ["x"], ops: [{ op: "remove_scene", scene: "a1" }] }).ok, false, "whole scenes need a generated script the engine can rebuild");
  });

  test("listing the options once: the second tap lands on the word that names it, its claim stays with the scene's spoken line, and a qualifier is never dropped", () => {
    const c = marina(2);
    const merged = ok(applyPlan(c, plan([{ op: "rewrite_line", line: "L2", spoken: "Tap Fuel, then Pump-out, and the list narrows to marinas with each one confirmed." }, { op: "remove_line", line: "L3" }]), ctxFor(c)));
    const l2 = merged.concept.narration.find((l) => l.id === "L2")!;
    assert.match(l2.spoken, /^\{a1\}Tap Fuel, then \{b1\}Pump-out/, "the first tap at the start, the second on the word Pump-out");
    assert.ok(l2.claims.includes("c-pay1b"), "the claim of the removed line moved to the remaining line of its scene");
    assert.ok(merged.concept.claims.some((x) => x.id === "c-pay1b"));
    const dropped = applyPlan(c, plan([{ op: "rewrite_line", line: "L2", spoken: "Tap Fuel and the list narrows to marinas with fuel." }, { op: "rewrite_line", line: "L3", spoken: "Try Pump-out next, and marinas with pump-out show up." }, { op: "rewrite_line", line: "L4", spoken: "Pick Transient dockage, and marinas with transient dockage appear." }, { op: "rewrite_line", line: "L5", spoken: "Tap Boat launch ramp, and marinas with a launch ramp appear." }]), ctxFor(c));
    assert.equal(dropped.ok, false, "removing every 'confirmed' weakens what the page says");
    assert.match(dropped.ok ? "" : dropped.reason, /confirmed/);
  });

  test("quick controls help classification and never restrict the note", () => {
    assert.deepEqual(hintsFromForm(["remove", "bogus", "remove", "shorter"], "middle", "second scene"), { kinds: ["remove", "shorter"], where: "middle", at: "second scene" });
    assert.equal(hintsFromForm([], "", ""), undefined, "no controls ticked is fine");
    assert.deepEqual(hintsFromForm([], "nonsense", ""), undefined);
  });

  test("a revision of the same video never uses another allowance: the second version of a script is a replacement", () => {
    const day = 86_400_000;
    const now = Date.UTC(2026, 10, 12);
    const ent = { plan: "starter", label: "Starter", period: "month" as const, videosPerPeriod: 1, minSpacingDays: 5, carryOver: false };
    const events = (extra: VideoEvent[]) => computeAllowance(ent as never, [{ at: now - 3 * day, kind: "new" }, ...extra], now);
    const a = events([]);
    const b = events([{ at: now - day, kind: "replacement" }, { at: now - 0.5 * day, kind: "replacement" }]);
    assert.equal(b.generated, a.generated);
    assert.equal(b.remaining, a.remaining);
    assert.equal(b.replacements, 2);
  });

  test("the revised copy: a clean title, and a description rebuilt from the revised script", () => {
    const c = micstage();
    const copy = copyFor(c, "MicStage: objection or feature payoff (open slot)");
    assert.equal(copy.title, "MicStage: Open mic tonight? Find one nearby");
    assert.ok(copy.description.startsWith("Open mic tonight? Find one nearby. "), copy.description);
    assert.match(copy.description, /https:\/\/boatingchicago\.com\/marinas$/);
    assert.equal(copyFor(c, "MicStage: run your open mic").title, "MicStage: run your open mic");
    const scrubbed = scrubDescription("Staring at a blank email? Send Confidence flags problems, like a missing unsubscribe link.\n\nStart free: https://sendfable.com/signup", plan([{ op: "remove_text", line: "L4", phrase: "like a missing unsubscribe link" }]));
    assert.equal(scrubbed, "Staring at a blank email? Send Confidence flags problems.\n\nStart free: https://sendfable.com/signup");
  });
});

function view_(c: Concept): PlanView {
  return {
    product: c.productName, productHost: new URL(c.origin).host, cta: { text: c.cta.text, url: c.cta.url },
    lines: c.narration.map((l) => ({ id: l.id, scene: l.sceneId, text: plain(l.spoken), ...(l.caption ? { caption: l.caption } : {}), claims: l.claims })),
    taps: c.capturePlan.flatMap((p, pi) => p.clicks.map((k, ki) => ({ plate: p.id, step: (ki + 1) as 1 | 2, scene: `a${pi + 1}`, name: (k as { name: string }).name, shows: k.payoff, line: c.narration.find((l) => l.claims.includes(`c-pay${pi + 1}${ki === 0 ? "a" : "b"}`))?.id }))),
    candidates: candidatesFor(c, discoveries), facts: c.claimsUsed.map((u) => u.quote), prohibited: [], earlier: [], estSeconds: c.estSeconds, structure: "generated", voiceFacts: [],
  };
}

describe("change requests V2: Product Truth recheck and the whole loop (database)", { skip: !HAVE_DB }, () => {
  const db = () => requireStudioDb();
  let productId = "";
  const specId = "boatingchicago:test-revision";
  const KEY = "k";
  void KEY;

  before(async () => {
    for (const t of [ms.msAuditEvents, ms.msPublications, ms.msSettings, ms.msProductFacts, ms.msProducts]) await db().delete(t);
    productId = (await createProduct(INTERNAL_SCOPE, "t", { name: "BoatingChicago", kind: "website", publicUrl: "https://boatingchicago.com/" })).id;
  });
  after(async () => {
    await closeStudioDb();
  });

  async function storeConcept(c: Concept) {
    await setSetting(conceptKey(specId), { specId, status: "ready", concept: { ...c, specId }, alternates: [], nextVariant: 1, attempts: [], generatedAt: new Date().toISOString() }, "t", db());
    await setSetting("video_discovery_boatingchicago", discoveries, "t", db());
    await setSetting(flagsKey(productId), [], "t", db());
    delete DEMO_SPECS[specId];
  }

  test("a factual concern re-checks the claim against the live page, removes it, and flags the fact so it is never used again", async () => {
    const c = marina(3);
    const fact = await db().insert(ms.msProductFacts).values({ productId, factKey: "capability", factValue: "Showing 0 of 13 verified marinas on inland lakes or the Fox River chain.", sourceKind: "public_page", sourceUrl: "https://boatingchicago.com/marinas", contentHash: "h1", verifiedBy: "t", verifiedAt: new Date() }).returning();
    const p: EditPlan = { summary: ["x"], ops: [{ op: "remove_step", plate: "p3", step: 2 }], factual: { concern: "error on the website", phrases: ["inland lakes"] } };
    const r = ok(applyPlan(c, plan([...p.ops, { op: "rewrite_line", line: "L8", spoken: "Switch to All waters and see all 13 verified marinas." }], { factual: p.factual }), ctxFor(c, { flagged: ["inland lakes"] })));
    let asked = "";
    const re = await recheckProductTruth(db(), { productId, origin: c.origin, before: c, after: r.concept, plan: p, note: "Remove the part about inland lakes, it looks like that's an error on the website", fetchText: async (u) => ((asked = u), "Marinas & Harbors Near Chicago Showing 0 of 13 verified marinas on inland lakes or the Fox River chain.") });
    assert.equal(asked, "https://boatingchicago.com/marinas", "the live page is fetched");
    assert.equal(re.ownerConcern, true);
    const inland = re.entries.find((e) => /inland/.test(e.quote))!;
    assert.deepEqual([inland.onLivePage, inland.action], [null, "removed"], "that line only appears after a tap, so the capture verifies it live; it is removed because the owner doubted it");
    const ctxEntry = re.entries.find((e) => e.claimId === "c-ctx3");
    assert.equal(ctxEntry?.onLivePage, true, "a heading on the page as first loaded is checked against the fetched page");
    assert.ok(re.flagged.length >= 1);
    assert.ok((await flagForCorrection(db(), productId, re, "note")) >= 1);
    assert.ok((await listFlags(db(), productId)).some((f) => /inland/.test(f.phrase) && f.status === "flagged"));
    const facts = await listFacts(INTERNAL_SCOPE, productId, db());
    assert.equal(facts.find((f) => f.id === fact[0].id)?.status, "superseded", "the fact is out of use");
    assert.equal(await flagForCorrection(db(), productId, re, "again"), 0, "flagging twice adds nothing");
    assert.equal(await fetchPageText("http://127.0.0.1:1/x"), null);
  });

  test("the loop: note -> plan -> rebuilt source -> revision history; a retry reuses it; a second round keeps the first note", async () => {
    const c = marina(3);
    await storeConcept(c);
    let calls = 0;
    const planner: Planner = async () => {
      calls++;
      return { micros: 3000, plan: { sentiment: "neutral", summary: ["shorter ending"], ops: [{ op: "remove_text", line: "L8", phrase: "so you know where to skip" }] } };
    };
    const base = { productId, slug: "boatingchicago", productName: "BoatingChicago", origin: "https://boatingchicago.com", specId, supersedes: "pub-1", note: "Make the lake line shorter, cut the part about where to skip." };
    const first = await prepareRevision(db(), base, { planner, fetchText: async () => "" });
    assert.ok(first.ok);
    if (!first.ok) return;
    assert.equal(first.revision.status, "applied");
    assert.equal(first.revision.round, 1);
    assert.equal(first.revision.aiMicros, 0, "the plain request was understood by the rules and cost nothing");
    assert.ok(first.concept && !/where to skip/.test(JSON.stringify(first.concept.narration)));
    assert.ok(first.revision.before.seconds > first.revision.after.seconds, "the length is recorded before and after");
    assert.deepEqual(first.revision.scenesAffected, ["a3"]);
    // the stored source is the revised script: the next render uses it
    await (await import("../video/concepts/registry")).ensureSpec(db(), specId);
    assert.ok(!/where to skip/.test(JSON.stringify(demoSpecFor(specId).narration)));
    // a retry of the same request does not interpret or rebuild again
    const again = await prepareRevision(db(), base, { planner });
    assert.ok(again.ok && again.revision.id === first.revision.id);
    assert.equal(calls, 0);
    // round two keeps round one's feedback in the history and in what the model sees
    let seenEarlier = "";
    const p2: Planner = async (i) => ((seenEarlier = JSON.stringify(i.view.earlier)), { micros: 1000, plan: { sentiment: "neutral", summary: ["wording"], ops: [{ op: "rewrite_line", line: "L6", spoken: "Pick your harbor, then go sooner." }] } });
    const second = await prepareRevision(db(), { ...base, supersedes: "pub-2", note: "Make the ending less generic." }, { planner: p2 });
    assert.ok(second.ok && second.revision.round === 2);
    assert.match(seenEarlier, /cut the part about where to skip/);
    assert.equal((await listRevisions(db(), specId)).length, 2);
  });

  test("a note that needs the owner names the exact open choice and offers simple options; praise alone is not an edit", async () => {
    const c = marina(3);
    await storeConcept(c);
    const base = { productId, slug: "boatingchicago", productName: "BoatingChicago", origin: "https://boatingchicago.com", specId, supersedes: "pub-9", note: "I like this." };
    const r = await prepareRevision(db(), base, { planner: async () => ({ micros: 0, plan: { summary: [], ops: [] } }) });
    assert.ok(!r.ok && r.kind === "needs_owner" && r.options.length >= 2);
    const contradictory = await prepareRevision(db(), { ...base, supersedes: "pub-10", note: "Make it longer and also much shorter." }, { planner: async () => ({ micros: 0, plan: { summary: [], ops: [], needsOwner: { reason: "You asked for both a longer and a shorter video.", options: ["Make it shorter", "Make it longer"] } } }) });
    assert.ok(!contradictory.ok && contradictory.kind === "needs_owner" && /longer and a shorter/.test(contradictory.reason) && contradictory.options.length === 2);
    // the AI step being unavailable is a retry, not a failure of the request
    const down = await prepareRevision(db(), { ...base, supersedes: "pub-11", note: "Use a friendlier tone." }, { planner: async () => { throw new Error("OPENROUTER_API_KEY is not set"); } });
    assert.ok(!down.ok && down.kind === "retry");
  });

  test("a bad plan gets one repair attempt with the exact problems, and an unsafe wording is never rendered", async () => {
    const c = marina(3);
    await storeConcept(c);
    const base = { productId, slug: "boatingchicago", productName: "BoatingChicago", origin: "https://boatingchicago.com", specId, supersedes: "pub-20", note: "Make the Lake Michigan line more exciting." };
    let n = 0;
    const planner: Planner = async (i) => {
      n++;
      if (n === 1) return { micros: 100, plan: { summary: ["x"], ops: [{ op: "rewrite_line", line: "L7", spoken: "Tap Lake Michigan and save forty percent on every guaranteed slip." }] } };
      assert.ok(i.problems && i.problems.length, "the second attempt is told what was wrong");
      return { micros: 100, plan: { summary: ["x"], ops: [{ op: "rewrite_line", line: "L7", spoken: "Tap Lake Michigan and watch all thirteen verified marinas fill in." }] } };
    };
    const r = await prepareRevision(db(), base, { planner });
    assert.ok(r.ok, r.ok ? "" : r.reason);
    assert.equal(n, 2);
    const never = await prepareRevision(db(), { ...base, supersedes: "pub-21" }, { planner: async () => ({ micros: 0, plan: { summary: ["x"], ops: [{ op: "rewrite_line", line: "L7", spoken: "Guaranteed best slips, unlimited fuel, instantly." }] } }) });
    assert.ok(!never.ok && never.kind === "needs_owner", "after one repair attempt that still fails, the owner gets a clear question");
  });

  test("the replacement sends one new review email, leaves the reviewed video superseded and unlisted, and nothing is published", async () => {
    let n = 0;
    const mk = async (title: string) => {
      n++;
      const videoId = `vid${String(n).padStart(8, "0")}`.slice(0, 11);
      const conn = await connectAccount(INTERNAL_SCOPE, "t", productId, { platform: "youtube", accountLabel: "iScream Studio (@iscreamstudio)", externalAccountId: `UC_v2_channel${n}`, tokens: { accessToken: "ya29.fake", refreshToken: "1//fake", accessExpiresAt: Date.now() + 3_000_000 }, scopes: [YT_SCOPE_UPLOAD, YT_SCOPE_READ, YT_SCOPE_MANAGE], tokenExpiresAt: null });
      const [pub] = await db().insert(ms.msPublications).values({ productId, assetId: randomUUID(), connectionId: conn.id, platform: "youtube", mode: "direct", status: "published", title, caption: `${title} https://boatingchicago.com/marinas?utm_source=youtube`, ctaUrl: "https://boatingchicago.com/marinas?utm_source=youtube", dedupeKey: randomUUID(), externalPostId: videoId, publishedAt: new Date() }).returning();
      return { pub, review: await recordUnlistedReview(db(), "t", { publicationId: pub.id, productId, productName: "BoatingChicago", videoRowId: randomUUID(), videoId, title, description: pub.caption, durationSec: 30, ctaText: "Go", ctaUrl: "https://boatingchicago.com/marinas?utm_source=youtube", intendedUse: "t", specHash: "h1", specId: "boatingchicago:loop" }, "home") };
    };
    const old = await mk("Old version");
    await requestChanges("t", old.pub.id, "Remove the part about inland lakes", db());
    const job = await queueReplacement(db(), "t", (await getReview(db(), old.pub.id))!);
    let emails = 0;
    let uploads = 0;
    const deps: ReplacementDeps = {
      currentSpecHash: () => "h2",
      slugFor: async () => "boatingchicago",
      render: async () => ({ ok: true as const, videoRowId: randomUUID() }),
      upload: async () => {
        uploads++;
        const fresh = await mk("New version");
        emails++;
        return { publicationId: fresh.pub.id, videoId: fresh.review.videoId, emailed: true };
      },
    };
    const out = await runReplacementJob(db(), job, (await getReview(db(), old.pub.id))!, deps, { final: false });
    assert.equal(out.job.status, "done");
    assert.deepEqual([uploads, emails], [1, 1]);
    const again = await runReplacementJob(db(), out.job, (await getReview(db(), old.pub.id))!, deps, { final: false });
    assert.equal(again.job.status, "done");
    assert.deepEqual([uploads, emails], [1, 1], "running it again sends nothing more");
    const oldNow = await getReview(db(), old.pub.id);
    assert.ok(oldNow && ["superseded", "changes_requested"].includes(oldNow.status), "the reviewed copy is superseded and was never made public");
    assert.equal((await getReview(db(), out.job.newPublicationId!))?.status, "unlisted_live", "the new copy waits unlisted for the owner");
    assert.ok((await listReviewsByStatus("approved_public")) === 0, "nothing was published automatically");
  });

  let channel = 0;
  const reviewOf = async (title: string) => {
    channel++;
    const videoId = `vsrc${String(channel).padStart(7, "0")}`.slice(0, 11);
    const conn = await connectAccount(INTERNAL_SCOPE, "t", productId, { platform: "youtube", accountLabel: "iScream Studio (@iscreamstudio)", externalAccountId: `UC_v3_channel${channel}`, tokens: { accessToken: "ya29.fake", refreshToken: "1//fake", accessExpiresAt: Date.now() + 3_000_000 }, scopes: [YT_SCOPE_UPLOAD, YT_SCOPE_READ, YT_SCOPE_MANAGE], tokenExpiresAt: null });
    const [pub] = await db().insert(ms.msPublications).values({ productId, assetId: randomUUID(), connectionId: conn.id, platform: "youtube", mode: "direct", status: "published", title, caption: title, ctaUrl: "https://boatingchicago.com/marinas", dedupeKey: randomUUID(), externalPostId: videoId, publishedAt: new Date() }).returning();
    await recordUnlistedReview(db(), "t", { publicationId: pub.id, productId, productName: "BoatingChicago", videoRowId: randomUUID(), videoId, title, description: title, durationSec: 30, ctaText: "Go", ctaUrl: "https://boatingchicago.com/marinas", intendedUse: "t", specHash: "h1", specId: "boatingchicago:loop-v3" }, "home");
    await requestChanges("t", pub.id, "Remove the part about inland lakes", db());
    return { pub, review: (await getReview(db(), pub.id))! };
  };
  const storedConcept = async () => (await import("../runtime")).getSetting<{ concept: Concept } | null>(conceptKey(specId), null, db());

  test("every attempt starts from the saved source: a failed attempt never becomes the new starting point", async () => {
    const c = marina(3);
    await storeConcept(c);
    const old = await reviewOf("Source test");
    const src = await captureSource(db(), { specId, publicationId: old.pub.id, productId });
    assert.equal(src.origin, "request");
    assert.deepEqual(src.concept?.narration, { ...c, specId }.narration, "the accepted script is what was saved");
    const base = { productId, slug: "boatingchicago", productName: "BoatingChicago", origin: "https://boatingchicago.com", specId, supersedes: old.pub.id, note: "Make the Lake Michigan line more exciting." };
    const planner: Planner = async () => ({ micros: 0, plan: { summary: ["x"], ops: [{ op: "rewrite_line", line: "L7", spoken: "Tap Lake Michigan and watch all thirteen verified marinas fill in." }] } });
    const first = await prepareRevision(db(), { ...base, fresh: true }, { planner, replan: true });
    assert.ok(first.ok);
    assert.notDeepEqual((await storedConcept())!.concept.narration, c.narration, "the attempt rewrote the stored script");
    // the render of that attempt failed: the next one restores the source first
    await restoreSource(db(), productId, src);
    assert.deepEqual((await storedConcept())!.concept.narration, c.narration, "the stored script is the source again, not the failed attempt");
    const again = await prepareRevision(db(), { ...base, fresh: true }, { planner, replan: true });
    assert.ok(again.ok && first.ok && JSON.stringify(again.revision.after) === JSON.stringify(first.revision.after), "planning again from the source gives a clean result");
    assert.equal((await captureSource(db(), { specId, publicationId: old.pub.id, productId })).savedAt, src.savedAt, "the source is saved once");
  });

  test("a plan that fails validation is replanned (not sent to the owner) when the loop asks for it", async () => {
    const c = marina(3);
    await storeConcept(c);
    const base = { productId, slug: "boatingchicago", productName: "BoatingChicago", origin: "https://boatingchicago.com", specId, supersedes: "pub-replan", note: "Make the Lake Michigan line more exciting.", fresh: true };
    const bad: Planner = async () => ({ micros: 0, plan: { summary: ["x"], ops: [{ op: "rewrite_line", line: "L7", spoken: "Guaranteed best slips, unlimited fuel, instantly." }] } });
    const r = await prepareRevision(db(), base, { planner: bad, replan: true });
    assert.ok(!r.ok && r.kind === "replan", "the loop tries again with the exact problems instead of asking the owner");
  });

  test("a planner that asks the owner about something it can settle is sent back to plan again, not forwarded to the customer", async () => {
    const c = marina(3);
    await storeConcept(c);
    const base = { productId, slug: "boatingchicago", productName: "BoatingChicago", origin: "https://boatingchicago.com", specId, supersedes: "pub-ask", note: "Make the Lake Michigan line more exciting.", fresh: true };
    const asks: Planner = async () => ({ micros: 0, plan: { summary: ["x"], ops: [], needsOwner: { reason: "which wording do you prefer?", options: ["a", "b"] } } });
    const looped = await prepareRevision(db(), base, { planner: asks, replan: true });
    assert.ok(!looped.ok && looped.kind === "replan" && looped.options?.length === 2, "inside the loop it plans again first");
    const direct = await prepareRevision(db(), { ...base, supersedes: "pub-ask2" }, { planner: asks });
    assert.ok(!direct.ok && direct.kind === "needs_owner", "outside the loop (a preview) the question is shown as before");
  });

  test("technical failures are rebuilt automatically and never reach the customer; only a real decision does", async () => {
    const old = await reviewOf("Loop test");
    let job = await queueReplacement(db(), "t", old.review);
    const depsFailing = (reason: string): ReplacementDeps => ({ currentSpecHash: () => "h-new", slugFor: async () => "boatingchicago", render: async () => ({ ok: false as const, reason }), upload: async () => { throw new Error("must not upload"); } });
    let out = await runReplacementJob(db(), job, old.review, depsFailing("QA did not pass: no_dead_air: pause of 0.76s between spoken lines"), { final: false });
    assert.equal(out.job.status, "queued");
    assert.equal(out.retry, true);
    assert.ok((out.job.strategy?.gapScale ?? 1) < 1, "the next build tightens the pauses");
    assert.equal(out.job.failures?.length, 1);
    out = await runReplacementJob(db(), out.job, old.review, depsFailing("QA did not pass: duration: 19.3s (target 20 to 35s, planned 19.3s)"), { final: false });
    assert.ok((out.job.strategy?.holdMs ?? 0) >= 2200, `hold ${out.job.strategy?.holdMs}`);
    assert.equal(out.job.status, "queued");
    out = await runReplacementJob(db(), out.job, old.review, depsFailing("QA did not pass: visual_alignment: line L2 runs ahead of the screen"), { final: true });
    assert.equal(out.job.status, "internal_failure", "an internal problem that survives every attempt is for operations, not for the customer");
    assert.equal(out.retry, false);
    job = await (await import("../publishing/review-replacement")).requeueReplacement(db(), old.pub.id);
    out = await runReplacementJob(db(), job, old.review, depsFailing("made-for-kids declared by the owner: not set"), { final: false });
    assert.equal(out.job.status, "needs_attention", "a declaration only the owner can make is the one thing that escalates");
  });

  test("the posting allowance being used is a wait with the finished video kept, never a failure, and does not use up an attempt", async () => {
    const old = await reviewOf("Allowance test");
    const job = await queueReplacement(db(), "t", old.review);
    const until = new Date(Date.now() + 3_600_000);
    const deps: ReplacementDeps = { currentSpecHash: () => "h-new", slugFor: async () => "boatingchicago", render: async () => ({ ok: true as const, videoRowId: randomUUID() }), upload: async () => { throw new AllowanceWait(until); } };
    const out = await runReplacementJob(db(), job, old.review, deps, { final: true });
    assert.equal(out.job.status, "queued");
    assert.equal(out.retry, false);
    assert.equal(out.waitUntil?.getTime(), until.getTime());
    assert.equal(out.job.attempts, 0, "no attempt was used");
    assert.equal(out.job.failures, undefined, "nothing is recorded as a failure");
  });

  test("a legacy request whose script an older attempt already rewrote is never trusted as a source", async () => {
    const c = marina(3);
    await storeConcept(c);
    const old = await reviewOf("Legacy test");
    await saveRevision(db(), specId, { id: "rev-legacy", round: 1, at: new Date().toISOString(), supersedes: old.pub.id, note: "x", interpretedBy: "rules", aiMicros: 0, plan: { summary: [], ops: [] }, before: snapshotOf(c), after: snapshotOf(c), scenesAffected: [], status: "applied", updatedAt: new Date().toISOString() } as never);
    const src = await captureSource(db(), { specId, publicationId: old.pub.id, productId });
    assert.equal(src.origin, "unrecoverable", "with no approved-video record to rebuild from, it is reported rather than guessed");
  });

  test("Changes received: one acknowledgement email per request, then nothing more", async () => {
    const old = await reviewOf("Ack test");
    await queueReplacement(db(), "t", old.review);
    process.env.RESEND_API_KEY = "re_test";
    const sent: Array<{ subject: string; text: string }> = [];
    const fake = (async (_u: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const one = await sendChangesReceivedEmail(db(), old.pub.id, fake);
    const two = await sendChangesReceivedEmail(db(), old.pub.id, fake);
    delete process.env.RESEND_API_KEY;
    assert.equal(one.sent, true);
    assert.equal(two.sent, false);
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /Changes received. GravyBlock is creating your updated video./);
  });
});

describe("autonomous revision loop: failure handling and source rebuild (pure)", () => {
  test("failures are classified: technical ones are ours to fix, only declarations and missing assets go to the owner", () => {
    for (const m of ["no_dead_air: pause of 0.76s between spoken lines", "duration: 19.3s (target 20 to 35s, planned 19.3s)", 'visual_alignment: line L2 runs ahead of the screen: "tuesday" only appears later', 'capture: after "Tue" the page no longer shows "Texas Union"', "ffmpeg exited with code 1", "marker b2 missing", "cached old script"]) assert.equal(classifyFailure(m).kind, "internal", m);
    for (const m of ["made-for-kids declared by the owner: not set", "no logo was supplied"]) assert.equal(classifyFailure(m).kind, "owner", m);
  });

  test("each failure changes the next attempt: tighter pauses, a longer hold, a different capture, a cut that removes what the voice ran ahead on", () => {
    let s = escalate(NO_STRATEGY, "no_dead_air: pause of 0.76s");
    assert.ok(s.gapScale < 1);
    s = escalate(s, "duration: 19.3s (target 20 to 35s, planned 19.3s)");
    assert.ok(s.holdMs >= 2200);
    s = escalate(s, 'capture: after "Tue" the page no longer shows "Texas Union Building (UNB)"');
    assert.deepEqual(s.avoid, ["Texas Union Building (UNB)"]);
    s = escalate(s, 'visual_alignment: line L4 runs ahead of the screen: "confirmed, dockage" only appears later');
    assert.deepEqual(s.dropWords.map((d) => d.word), ["confirmed", "dockage"]);
    assert.equal(s.rounds, 4);
  });

  test("the strategy is applied to the rebuilt script: pauses scale, the closing frame holds, ahead-of-screen wording is cut and the taps keep their words", () => {
    const c = marina(2);
    const before = timing(c.narration, personalityFor(c.slug)).estSeconds;
    const problems = applyStrategy(c, { ...NO_STRATEGY, gapScale: 0.5, holdMs: 1500, dropWords: [{ line: "L4", word: "for confirmed transient dockage" }] });
    assert.deepEqual(problems, []);
    assert.equal(c.gapScale, 0.5);
    assert.equal(c.gapExtraMs, 1500);
    assert.ok(!/confirmed transient dockage/.test(stripMarkers(c.narration.find((l) => l.id === "L4")!.spoken)));
    assert.ok(markersIn(c.narration.find((l) => l.id === "L4")!.spoken).includes("a2"), "the tap marker survives the cut");
    assert.ok(c.estSeconds > 0 && Math.abs(c.estSeconds - before) < 6);
  });

  test("a tap that still shows wording reported as wrong is swapped by the engine for a real alternative, with the stale line rewrite dropped", () => {
    const stepOf = (control: number, name: string, payoff: string) => ({ kind: "click" as const, control, name, payoff });
    const view = {
      taps: [
        { plate: "p1", step: 1 as const, scene: "a1", name: "Wed", shows: "Map: 87 in view", line: "L2" },
        { plate: "p1", step: 2 as const, scene: "a1", name: "Thu", shows: "Open Mic Night at DALEEE KTAOS", line: "L3" },
      ],
      candidates: [
        { id: "p1.2.4.1", plate: "p1", step: 2 as const, sameControl: true, def: stepOf(4, "Thu", "x"), label: "same tap, the page shows: Open Mic Night at DALEEE KTAOS" },
        { id: "p1.2.5.0", plate: "p1", step: 2 as const, sameControl: false, def: stepOf(5, "Fri", "Third Coast Comedy Club"), label: 'tap "Fri", the page shows: Third Coast Comedy Club' },
      ],
    } as unknown as PlanView;
    const bad = plan([{ op: "replace_step", plate: "p1", step: 1, candidate: "p1.1.2.1" }, { op: "rewrite_line", line: "L3", spoken: "Pick Thursday and land on Open Mic Night at DALEEE KTAOS." }]);
    const fixed = swapFlaggedTaps(bad, '"Open Mic Night at DALEEE KTAOS" is reported as wrong but is still in the video', view)!;
    assert.ok(fixed, "a fix is found");
    assert.deepEqual(fixed.ops.filter((o) => o.op === "replace_step").map((o) => (o as { candidate: string }).candidate), ["p1.1.2.1", "p1.2.5.0"]);
    assert.ok(!fixed.ops.some((o) => o.op === "rewrite_line"), "the old line rewrite is dropped so the line is rebuilt from the new result");
    assert.equal(swapFlaggedTaps(bad, '"Something else" is reported as wrong but is still in the video', view), null, "nothing to swap when no tap shows it");
  });

  test("a plan that would make both taps the same control is repaired by the engine with a different control for the second tap", () => {
    const stepOf = (control: number, name: string, payoff: string) => ({ kind: "click" as const, control, name, payoff });
    const view = {
      taps: [
        { plate: "p1", step: 1 as const, scene: "a1", name: "Wed", shows: "x", line: "L2", control: 3 },
        { plate: "p1", step: 2 as const, scene: "a1", name: "Thu", shows: "y", line: "L3", control: 4 },
      ],
      candidates: [
        { id: "p1.1.2.1", plate: "p1", step: 1 as const, sameControl: false, def: stepOf(2, "Tue", "Texas Union Building (UNB)"), label: "a" },
        { id: "p1.2.2.2", plate: "p1", step: 2 as const, sameControl: false, def: stepOf(2, "Tue", "Open mic: Tuesday"), label: "b" },
        { id: "p1.2.5.0", plate: "p1", step: 2 as const, sameControl: false, def: stepOf(5, "Fri", "Third Coast Comedy Club"), label: "c" },
      ],
    } as unknown as PlanView;
    const bad = plan([{ op: "replace_step", plate: "p1", step: 1, candidate: "p1.1.2.1" }, { op: "replace_step", plate: "p1", step: 2, candidate: "p1.2.2.2" }, { op: "rewrite_line", line: "L3", spoken: "Pick Tuesday and land on Texas Union Building." }]);
    const fixed = swapDuplicateTaps(bad, 'both taps of p1 would be "Tue"; pick two different taps', view)!;
    assert.deepEqual(fixed.ops.filter((o) => o.op === "replace_step").map((o) => (o as { candidate: string }).candidate), ["p1.1.2.1", "p1.2.5.0"]);
    assert.ok(!fixed.ops.some((o) => o.op === "rewrite_line"));
  });

  test("a scroll step's internal name is never a quote of a claim: QA checks quotes against the live page", () => {
    const c = marina(2);
    c.capturePlan[1].clicks[1] = { kind: "scroll", name: "scroll-/marinas-2", payoff: "Showing 4 of 13 verified marinas with confirmed boat launch ramp." };
    const ctx = c.claims.find((x) => x.id === "c-ctx2")!;
    ctx.sources = [{ plate: "p2", quote: "Marinas & Harbors Near Chicago" }, { plate: "p2", quote: "scroll-/marinas-2" }];
    const r = ok(applyPlan(c, plan([{ op: "rewrite_line", line: "L6", spoken: "Pick your harbor and go." }]), ctxFor(c)));
    assert.deepEqual(r.concept.claims.find((x) => x.id === "c-ctx2")!.sources.map((q) => q.quote), ["Marinas & Harbors Near Chicago"]);
  });

  test("a script is rebuilt from the approved video's own record, not from a half-edited stored copy", () => {
    const orig = marina(2);
    const board = {
      transcript: orig.narration.map((l) => ({ id: l.id, text: stripMarkers(l.spoken), ...(l.caption ? { caption: l.caption } : {}), sceneId: l.sceneId })),
      claims: orig.claims.map((x) => ({ id: x.id, text: x.text, sources: x.sources.map((q) => ({ quote: q.quote })) })),
    };
    const edited = ok(applyPlan(orig, plan([{ op: "consolidate", lines: ["L2", "L3"], spoken: "Tap Fuel, then Pump-out, and the list narrows to marinas with each one confirmed." }]), ctxFor(orig))).concept;
    assert.notEqual(edited.narration.length, orig.narration.length);
    const rebuilt = reconstructConcept(edited, board);
    assert.ok(rebuilt, "rebuilt");
    assert.deepEqual(rebuilt!.narration.map((l) => [l.id, stripMarkers(l.spoken), l.claims]), orig.narration.map((l) => [l.id, stripMarkers(l.spoken), l.claims]), "every line, and the claim it carries, is back as approved");
    assert.deepEqual(rebuilt!.capturePlan.map((p) => p.clicks.map((k) => [k.name, k.payoff])), orig.capturePlan.map((p) => p.clicks.map((k) => [k.name, k.payoff])));
    assert.deepEqual(ensureMarkers(rebuilt!), []);
  });
});

async function listReviewsByStatus(status: string) {
  const { listReviews } = await import("../publishing/video-review");
  return (await listReviews(requireStudioDb())).filter((r) => r.status === status).length;
}

void snapshotOf;

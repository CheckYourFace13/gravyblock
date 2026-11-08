import "./setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildConceptTimeline, layoutConcept, specFromConcept } from "../video/concepts/build";
import { fragmentsOf, generateConcept, speakable, spokenHost, spokenName } from "../video/concepts/generate";
import { DESIRABILITY_CHECKS, openingKey, personalityFor, PERSONALITIES, standardRecord } from "../video/concepts/standard";
import type { GeneratorInput, PageDiscovery } from "../video/concepts/types";
import { evaluateRecord, hookProblems, scriptProblems } from "../video/concepts/validate";

const page = (path: string, groups: PageDiscovery["groups"], lines: string[]): PageDiscovery => ({ path, url: `https://micstage.com${path}`, title: "t", lines, groups, ctas: [{ text: "Find an open mic", url: "https://micstage.com/find-open-mics" }], discoveredAt: "2026-11-08" });

const discoveries: PageDiscovery[] = [
  page(
    "/find-open-mics",
    [
      { id: "/find-open-mics#0", path: "/find-open-mics", heading: "Browse by city", controls: [{ index: 0, name: "Chicago" }, { index: 1, name: "Austin" }, { index: 2, name: "Denver" }], sequence: [{ control: 0, newText: "Chicago open mics | Tuesday comedy night at the corner bar starts with sign up at seven" }, { control: 1, newText: "Austin open mics | Songwriters share new tunes on the patio every Thursday" }, { control: 2, newText: "Denver open mics | Poetry circle meets in the back room on Sundays" }] },
      { id: "/find-open-mics#1", path: "/find-open-mics", heading: "Common questions", controls: [{ index: 3, name: "Is it free?" }, { index: 4, name: "Can I bring a friend?" }], sequence: [{ control: 3, newText: "Finding a listing is free for performers and always has been" }, { control: 4, newText: "Friends are welcome at nearly every listed night, so bring someone along" }] },
    ],
    ["Browse by city", "Chicago", "Austin", "Denver", "Common questions", "Is it free?", "Can I bring a friend?", "Find an open mic"],
  ),
];

const input = (over: Partial<GeneratorInput> = {}): GeneratorInput => ({
  specId: "micstage:find-an-open-mic",
  slug: "micstage",
  productName: "MicStage",
  origin: "https://micstage.com",
  home: "https://micstage.com/",
  brand: { primary: "#7a3cff" },
  angle: { id: "micstage-find-an-open-mic", role: "A", title: "MicStage: find an open mic, free", hook: "Want to perform but can't find an open mic?", goal: "introduce MicStage to a performer who does not know where to start", audience: "comedian, singer or poet looking for a stage", coreBenefit: "find a free open mic night in your city", features: ["browse by city", "common questions"], scenes: ["cities", "faq"], cta: { text: "Find an open mic", url: "https://micstage.com/find-open-mics" }, funnel: "cold" },
  discoveries,
  verifiedFacts: [],
  prohibited: ["guaranteed stage time"],
  takenHooks: [],
  consumed: [],
  usedControls: [],
  variant: 0,
  ...over,
});

describe("creative standard", () => {
  test("the standard is stored with ten checks and a personality for every kind of product", () => {
    assert.equal(DESIRABILITY_CHECKS.length, 10);
    const rec = standardRecord();
    assert.equal(rec.checks.length, 10);
    assert.ok(Object.keys(PERSONALITIES).length >= 8);
    assert.equal(personalityFor("scribblezap").id, "game");
    assert.equal(personalityFor("seestew").id, "history_editorial");
    assert.notEqual(personalityFor("gravyblock").music.bpm, personalityFor("seestew").music.bpm);
  });
});

describe("hook gate", () => {
  test("rejects greetings, logo-first openings and flat statements; accepts a real question", () => {
    assert.ok(hookProblems("Welcome to MicStage, the place for open mics", "MicStage").length > 0);
    assert.ok(hookProblems("MicStage lists open mics near you", "MicStage").length > 0);
    assert.ok(hookProblems("Open mics are listed on this site", "MicStage").length > 0);
    assert.deepEqual(hookProblems("Want to perform but can't find an open mic?", "MicStage"), []);
    assert.ok(hookProblems("Want to perform but cannot find an open mic anywhere near you tonight or tomorrow or ever?", "MicStage").length > 0);
  });
});

describe("script gates", () => {
  test("documentation language, superlatives and prohibited claims are all rejected", () => {
    assert.ok(scriptProblems([{ spoken: "This page gives you a comprehensive overview." }], [], []).length >= 1);
    assert.ok(scriptProblems([{ spoken: "The best open mic app, instantly." }], [], []).length >= 1);
    assert.ok(scriptProblems([{ spoken: "Get guaranteed stage time tonight." }], [], ["guaranteed stage time"]).length >= 1);
    assert.deepEqual(scriptProblems([{ spoken: "Tap Chicago. Look at that." }], ["Chicago"], ["guaranteed stage time"]), []);
  });
  test("only readable page sentences may be spoken", () => {
    assert.ok(speakable("Songwriters share new tunes on the patio every Thursday"));
    assert.ok(!speakable("Only $19.99/month, billed yearly"));
    assert.ok(!speakable("Save time in minutes"));
    assert.ok(!speakable("OK"));
    assert.ok(!speakable("A seamless all-in-one solution for everyone here"));
  });
  test("a probe's new text yields fragments without the control labels", () => {
    const f = fragmentsOf("Chicago | Tuesday comedy night at the corner bar | Austin", ["Chicago", "Austin"], new Set(["comedy"]), []);
    assert.deepEqual(f, ["Tuesday comedy night at the corner bar"]);
  });
  test("names are said as words", () => {
    assert.equal(spokenName("MicStage"), "Mic Stage");
    assert.equal(spokenHost("micstage.com"), "Micstage dot com");
  });
});

describe("generator", () => {
  test("builds a complete concept from what discovery saw, and every claim is a verbatim page line", () => {
    const { concept, attempts } = generateConcept(input());
    assert.ok(concept, JSON.stringify(attempts));
    const c = concept!;
    assert.equal(c.personality, "music_events");
    assert.equal(c.capturePlan.length, 2);
    assert.equal(c.capturePlan.flatMap((p) => p.clicks).length, 4);
    assert.ok(c.hook && c.problem && c.audience && c.whyItMatters && c.cta.url.startsWith("https://micstage.com"));
    assert.ok(c.narration.every((l) => l.claims.length > 0), "every spoken line has a claim");
    const text = discoveries[0].lines.join(" ") + " " + discoveries[0].groups.flatMap((g) => g.sequence.map((s) => s.newText)).join(" ");
    for (const u of c.claimsUsed) assert.ok(text.toLowerCase().includes(u.quote.toLowerCase()), `unsupported quote ${u.quote}`);
    assert.ok(c.estSeconds >= 22 && c.estSeconds <= 33, `length ${c.estSeconds}`);
    assert.ok(c.estFirstTapMs <= 4300, `first tap ${c.estFirstTapMs}`);
    assert.equal(c.gate?.ok, true);
    assert.equal(c.gate?.checks.length, 10);
  });
  test("a concept becomes a spec the renderer accepts, with the personality's pace and music", () => {
    const { concept } = generateConcept(input());
    const spec = specFromConcept(concept!);
    assert.equal(spec.pace, personalityFor("micstage").pace);
    assert.equal(spec.music?.bpm, personalityFor("micstage").music.bpm);
    assert.ok(spec.concept);
    const lt = layoutConcept(concept!)(Object.fromEntries(concept!.narration.map((l) => [l.id, 3000])));
    assert.equal(Object.keys(lt).length, concept!.narration.length);
    assert.equal(typeof buildConceptTimeline(concept!), "function");
  });
  test("the duplicate gate and the opening rule reject a repeat; a control already shown is not reused", () => {
    const again = generateConcept(input({ takenHooks: ["Want to perform but nowhere to go?"] }));
    assert.ok(again.attempts.some((a) => a.reasons.some((r) => /already used/.test(r))) || again.concept?.hook !== "Want to perform but can't find an open mic?");
    const dup = generateConcept(input({ consumed: [{ id: "other", slug: "micstage", role: "B", title: "MicStage: find an open mic, free", hook: "Want to perform but can't find an open mic?", goal: "introduce MicStage to a performer who does not know where to start", coreBenefit: "find a free open mic night in your city", features: ["browse by city", "common questions"], scenes: ["cities", "faq"], cta: { text: "Find an open mic", url: "https://micstage.com/find-open-mics" }, status: "public" }] }));
    assert.equal(dup.concept, undefined, "a concept that repeats a consumed angle is rejected");
    const used = generateConcept(input({ usedControls: ["Chicago", "Austin", "Denver", "Is it free?", "Can I bring a friend?"] }));
    assert.equal(used.concept, undefined);
  });
  test("a product with no real interaction cannot be demonstrated and is refused", () => {
    const r = generateConcept(input({ discoveries: [page("/", [], ["Home"])] }));
    assert.equal(r.concept, undefined);
    assert.match(r.attempts[0].reasons[0], /cannot be demonstrated/);
  });
  test("unsupported wording in the source text is never spoken", () => {
    const poisoned: PageDiscovery[] = [page("/find-open-mics", [{ id: "x#0", path: "/find-open-mics", heading: "Why us", controls: [{ index: 0, name: "Speed" }, { index: 1, name: "Reach" }], sequence: [{ control: 0, newText: "The fastest way to book the best open mic instantly" }, { control: 1, newText: "Trusted by thousands of performers every single week" }] }], ["Why us", "Speed", "Reach"])];
    assert.equal(generateConcept(input({ discoveries: poisoned })).concept, undefined);
  });
});

describe("post-render gate", () => {
  const base = { specId: "x:y", slug: "micstage", productName: "MicStage", transcript: [{ text: "Want to perform but can't find an open mic?" }, { text: "Tap Chicago. Found one. Tuesday comedy night at the corner bar." }, { text: "Then Austin. Look at that. Songwriters share new tunes." }, { text: "Pick a night and go." }, { text: "Find your stage, at micstage.com." }], durationMs: 28_000, firstActionMs: 3200, stateChanges: 4, interactivePlates: 2, verifiedClaims: 6, ctaText: "Find an open mic", onScreen: ["Browse by city"], takenOpenings: [], concept: null, prohibited: [] };
  test("passes a punchy video and flags a slow one and a repeated opening", () => {
    assert.equal(evaluateRecord(base).ok, true);
    const slow = evaluateRecord({ ...base, firstActionMs: 9000 });
    assert.equal(slow.ok, false);
    assert.match(slow.reasons.join(" "), /first real action/);
    assert.equal(evaluateRecord({ ...base, takenOpenings: [openingKey("Want to perform but can't find an open mic?")] }).ok, false);
    assert.equal(evaluateRecord({ ...base, transcript: [{ text: "Welcome to MicStage, a comprehensive overview." }, ...base.transcript.slice(1)] }).ok, false);
  });
  test("a script written by hand before the standard is flagged as such, never presented as generated", () => {
    const r = evaluateRecord(base);
    assert.match(r.checks.find((c) => c.id === "personality_fit")!.detail, /written by hand/);
  });
});

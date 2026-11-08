import "./setup";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyCopy } from "../video/concepts/ai-copy";
import { aiGrounding, pageVocabulary, stepAlignment } from "../video/concepts/validate";
import { parseJson } from "../video/concepts/ai";
import { AI_CAP_SETTING, AI_HARD_MAX_USD, AiCapReached, assertRoom, cacheKey, capUsd, monthOf, record, spendNow } from "../video/concepts/ai-budget";
import { buildConcept } from "../video/concepts/generate";
import type { Concept, GeneratorInput, PageDiscovery, PlatePlan } from "../video/concepts/types";

const lines = ["Browse by city", "Chicago open mics", "Tuesday comedy night at the corner bar starts with sign up at seven", "Austin open mics", "Songwriters share new tunes on the patio every Thursday", "Is it free?", "Finding a listing is free for performers"];
const disc: PageDiscovery[] = [{ path: "/find", url: "https://micstage.com/find", title: "t", lines, groups: [], links: [], searches: [], ctas: [], discoveredAt: "2026-11-08" }];
const vocab = pageVocabulary(disc);
const factText = lines.join(" \n ").toLowerCase();
const concept = (spoken: string[]): Concept => ({ narration: spoken.map((s, i) => ({ id: `L${i}`, sceneId: "a1", spoken: s, claims: ["c"] })) }) as unknown as Concept;

describe("model-written copy: deterministic grounding", () => {
  test("plain natural copy passes", () => {
    assert.deepEqual(aiGrounding(concept(["Where can you try out a set?", "Pick {a1}Chicago and look: a Tuesday comedy night at the corner bar."]), vocab, factText), []);
  });
  test("figures, offers, superlatives and capabilities the product never showed are rejected", () => {
    const r = aiGrounding(concept(["Hook line here?", "It finds 500 mics instantly, the best way to book and track your gigs, and it is cheap."]), vocab, factText);
    for (const w of ["500", "instantly", "best", "book", "track", "cheap"]) assert.ok(r.some((x) => x.includes(`"${w}"`)), `expected ${w} to be flagged: ${r.join(" / ")}`);
  });
  test("a word the product itself used is allowed (free is on the page)", () => {
    assert.deepEqual(aiGrounding(concept(["Hook line here?", "Finding a listing is free for performers."]), vocab, factText), []);
  });
  test("the hook may name the viewer's situation but never a figure or an offer", () => {
    assert.deepEqual(aiGrounding(concept(["Want to book a stage?", "Look at Chicago."]), vocab, factText), []);
    assert.ok(aiGrounding(concept(["Win 10 gigs?", "Look at Chicago."]), vocab, factText).some((x) => x.includes("\"10\"")));
    assert.ok(aiGrounding(concept(["The cheapest open mic?", "Look at Chicago."]), vocab, factText).length >= 1);
  });
});

describe("model reply parsing", () => {
  test("tolerates a fenced reply and chatter", () => {
    assert.deepEqual(parseJson<{ a: number }>("Sure!\n```json\n{\"a\": 1}\n```"), { a: 1 });
    assert.equal(parseJson("no json at all"), null);
  });
});

/** A settings table in memory: the key is read from the query's bound parameter, which is all the guard ever filters on. */
function fakeDb() {
  const store = new Map<string, unknown>();
  const keyOf = (cond: { queryChunks: Array<{ value?: unknown }> }) => String(cond.queryChunks.find((c) => typeof c.value === "string")?.value);
  const db = {
    select: () => ({ from: () => ({ where: (cond: never) => ({ limit: async () => (store.has(keyOf(cond)) ? [{ value: store.get(keyOf(cond)) }] : []) }) }) }),
    insert: () => ({ values: (v: { key: string; value: unknown }) => ({ onConflictDoUpdate: async () => void store.set(v.key, v.value) }) }),
  };
  return { db: db as never, store };
}

describe("spend guard", () => {
  test("the hard maximum is five dollars and the owner can only lower the cap", async () => {
    const { db, store } = fakeDb();
    assert.equal(AI_HARD_MAX_USD, 5);
    assert.equal(await capUsd(db), 5);
    store.set(AI_CAP_SETTING, 2);
    assert.equal(await capUsd(db), 2);
    store.set(AI_CAP_SETTING, 50);
    assert.equal(await capUsd(db), 5);
  });
  test("a call that would pass the cap is refused before any money is spent, and spend is tracked exactly per video", async () => {
    const { db } = fakeDb();
    await assertRoom(db, 2_000);
    await record(db, { specId: "a:1", purpose: "copy", model: "m", tokensIn: 100, tokensOut: 50, micros: 1_234 });
    await record(db, { specId: "a:1", purpose: "verify", model: "m", tokensIn: 100, tokensOut: 50, micros: 766 });
    await record(db, { specId: "b:1", purpose: "copy", model: "m", tokensIn: 100, tokensOut: 50, micros: 4_999_000 });
    const s = await spendNow(db);
    assert.equal(s.calls, 3);
    assert.equal(Math.round(s.spentUsd * 1e6), 5_001_000);
    await assert.rejects(() => assertRoom(db, 1), AiCapReached);
  });
  test("the cache key depends on the model, the prompt and the facts, and the ledger is monthly", () => {
    assert.notEqual(cacheKey("m", "s", "u1"), cacheKey("m", "s", "u2"));
    assert.equal(cacheKey("m", "s", "u"), cacheKey("m", "s", "u"));
    assert.match(monthOf(new Date("2026-11-08T00:00:00Z")), /^2026-11$/);
  });
});

describe("applying copy to a concept", () => {
  test("every step line carries exactly one tap marker and the end line keeps the host", () => {
    const plates: PlatePlan[] = [0, 1].map((i) => ({
      id: `p${i + 1}`,
      path: "/find",
      groupId: `g${i}`,
      heading: i === 0 ? "Browse by city" : "Common questions",
      prefix: [],
      controls: [{ index: 0, name: "Chicago" }, { index: 1, name: "Austin" }],
      clicks: [{ kind: "click", control: 0, name: i ? "Is it free?" : "Chicago", payoff: "Tuesday comedy night at the corner bar starts with sign up at seven" }, { kind: "click", control: 1, name: i ? "Can I bring a friend?" : "Austin", payoff: "Songwriters share new tunes on the patio every Thursday" }],
    }));
    const input = { slug: "micstage", productName: "MicStage", home: "https://micstage.com/", origin: "https://micstage.com", brand: {}, angle: { title: "MicStage: find a stage", cta: { text: "Find an open mic", url: "https://micstage.com/find" } }, discoveries: disc } as unknown as GeneratorInput;
    const built = buildConcept(input, plates, { text: "Hook?", style: "question" }, 0, 0);
    assert.ok(!("error" in built));
    const c = applyCopy(built as Concept, { pick: 1, hook: "Where can you get on stage tonight?", steps: ["Tap [tap]Chicago and see a comedy night.", "[tap]Austin has songwriters on a patio.", "Tap [tap]the question and read the answer.", "Then [tap]ask about friends."], close: "Pick a night and go.", cta: "Find your stage" });
    assert.equal(c.narration[0].spoken, "Where can you get on stage tonight?");
    assert.match(c.narration[1].spoken, /\{a1\}Chicago/);
    assert.match(c.narration[2].spoken, /^\{b1\}Austin/);
    assert.match(c.narration[3].spoken, /\{a2\}/);
    assert.match(c.narration[4].spoken, /\{b2\}/);
    assert.match(c.narration.at(-1)!.spoken, /^Find your stage, at /);
    assert.equal(c.hook, "Where can you get on stage tonight?");
    assert.ok(c.estFirstTapMs > 0 && c.estSeconds > 10);
  });
});

describe("step alignment", () => {
  const plan = (lines: string[]) =>
    ({
      capturePlan: [{ clicks: [{ kind: "link", name: "See the demo", payoff: "Wednesday Night Pool League - Round Robin" }, { kind: "scroll", name: "scroll-/-0", payoff: "Friday Night Darts Shootout - Single Elimination" }] }],
      narration: lines.map((spoken, i) => ({ id: `L${i}`, sceneId: "a1", spoken, claims: [i === 0 ? "c-pay1a" : "c-pay1b"] })),
    }) as unknown as Concept;
  test("lines that sit on the wrong tap are rejected", () => {
    assert.equal(stepAlignment(plan(["Choose a format and a QR code appears.", "Jump into the demo and watch the standings take shape."])).length, 2);
  });
  test("lines about their own tap pass", () => {
    assert.deepEqual(stepAlignment(plan(["Jump into the demo and see a Wednesday night pool league.", "Keep going to a Friday night darts shootout."])), []);
  });
});

describe("demo honesty", () => {
  test("a line about a demo page may not call it live or real", async () => {
    const { demoHonesty } = await import("../video/concepts/validate");
    const c = {
      capturePlan: [{ clicks: [{ kind: "link", name: "See the demo", href: "https://x.test/demo", payoff: "Wednesday Night Pool League" }, { kind: "scroll", name: "scroll-/-0", payoff: "Friday Night Darts Shootout" }] }],
      narration: [{ id: "L1", sceneId: "a1", spoken: "Open the demo and a live pool league is on screen.", claims: ["c-pay1a"] }, { id: "L2", sceneId: "a1", spoken: "Keep going to a darts shootout.", claims: ["c-pay1b"] }],
    } as unknown as Concept;
    const input = { discoveries: [{ links: [{ href: "https://x.test/demo", destHeading: "See a venue in action", top: ["Teams and scores are made up."], lower: [] }] }] } as unknown as GeneratorInput;
    assert.equal(demoHonesty(c, input).length, 1);
    c.narration[0].spoken = "Open the demo and a pool league is on screen.";
    assert.deepEqual(demoHonesty(c, input), []);
  });
});

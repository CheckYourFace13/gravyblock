import { test } from "node:test";
import assert from "node:assert/strict";
import { coversIntent, headingsOf, inventoryMatches, normPhrase, ourStrengths, topicGaps, type PageDetail } from "../research";
import { demandStrength, impressionMovers, seasonalAhead, templateLosses } from "../deep";
import { realisticGain } from "../growth";

const page = (over: Partial<PageDetail> = {}): PageDetail => ({
  url: "https://example.com/p", title: "", h1: "", words: 500, h2s: 3, hasFaqSchema: false, hasTool: false, tables: 0, hasVideo: false, images: 0, observedAt: "2026-11-28T00:00:00Z",
  status: 200, headings: [], text: "", indexable: true, canonical: "", ...over,
});

test("a position-8 opportunity outranks a position-60 one with ten times the impressions", () => {
  const near = realisticGain(8, 500, 0.02);
  const far = realisticGain(60, 5000, 0.001);
  const value = (g: ReturnType<typeof realisticGain>) => (Math.log2(1 + g.clicks) * 10 + 1) * g.success;
  assert.ok(value(near) > value(far), `${value(near)} vs ${value(far)}`);
  assert.equal(near.horizon, "quick win");
  assert.equal(far.horizon, "long term");
});

test("a page covers an intent through its headings or the whole phrase, not through one shared word", () => {
  const p = page({ title: "Google Business Profile not showing up? How to fix it", headings: ["Google Maps Doesn't Show My Business: What to Check"], text: normPhrase("If you're thinking my business isn't showing up on Google, the cause is usually fixable") });
  assert.equal(coversIntent(p, ["my business isn't showing up on google"]).covered, true);
  assert.equal(coversIntent(p, ["google business profile not showing"]).covered, true);
  assert.equal(coversIntent(page({ title: "Google reviews guide" }), ["google maps not working"]).covered, false);
});

test("inventory matching finds the site's own page for a search by its address", () => {
  const urls = ["https://rentalnoodle.com/", "https://rentalnoodle.com/tools/rental-property-roi-calculator", "https://rentalnoodle.com/resources/how-to-screen-tenants"];
  assert.deepEqual(inventoryMatches(urls, "rental property calculator roi", 1), ["https://rentalnoodle.com/tools/rental-property-roi-calculator"]);
  assert.deepEqual(inventoryMatches(urls, "best pizza chicago"), []);
});

test("headings, topic gaps and strengths come from what each page visibly has", () => {
  assert.deepEqual(headingsOf("<h1>Launches</h1><h2>Parking and <b>fees</b></h2><h4>skip</h4>"), ["Launches", "Parking and fees"]);
  const ours = page({ url: "https://boatingchicago.com/boat-launches", text: "launch hours parking", hasTool: true, words: 1500 });
  const theirs = [page({ url: "https://rival.com/launches", headings: ["Launches", "Seasonal closing dates", "Parking fees explained"], words: 700 })];
  const gaps = topicGaps(ours, theirs);
  assert.equal(gaps.length, 1);
  assert.match(gaps[0]!, /Seasonal closing dates/);
  assert.ok(ourStrengths(ours, theirs).some((s) => /interactive tool/.test(s)));
});

test("demand strength is scored from observable signals only and capped at 5", () => {
  const strong = demandStrength({ variants: 5, sources: ["Google autocomplete", "DuckDuckGo autocomplete"], competitorPages: 2, relatedImpressions: 40, seasonalSoon: true, intent: "local" });
  assert.equal(strong.level, "strong");
  assert.ok(strong.score <= 5);
  const weak = demandStrength({ variants: 2, sources: ["DuckDuckGo autocomplete"], competitorPages: 0, relatedImpressions: 0, seasonalSoon: false, intent: "informational" });
  assert.equal(weak.level, "weak");
});

test("seasonal look-ahead lists last year's upcoming searches that are not earning impressions yet", () => {
  const ly = [{ query: "boat launch opening dates", page: "https://b.com/launches", clicks: 9, impressions: 300, position: 6 }, { query: "already busy", page: "https://b.com/x", clicks: 1, impressions: 50, position: 9 }];
  const out = seasonalAhead(ly, [{ key: "already busy", clicks: 2, impressions: 60, position: 8 }]);
  assert.deepEqual(out.map((q) => q.query), ["boat launch opening dates"]);
});

test("template losses and impression movers need real volume", () => {
  const t = templateLosses([{ section: "/places", pages: 40, clicks: 10, impressions: 300, ctr: 0, clicksPrev: 50, impressionsPrev: 1600, pagesPrev: 700 }, { section: "/blog", pages: 2, clicks: 0, impressions: 5, ctr: 0, clicksPrev: 0, impressionsPrev: 30, pagesPrev: 2 }]);
  assert.deepEqual(t.map((x) => x.section), ["/places"]);
  const m = impressionMovers([{ key: "a", clicks: 1, impressions: 100, position: 9 }], [{ key: "a", clicks: 0, impressions: 40, position: 15 }, { key: "b", clicks: 3, impressions: 90, position: 5 }]);
  assert.equal(m.gaining[0]!.key, "a");
  assert.equal(m.losing[0]!.key, "b");
});

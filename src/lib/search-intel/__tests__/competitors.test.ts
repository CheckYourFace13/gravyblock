import { test } from "node:test";
import assert from "node:assert/strict";
import { featureGaps, matchCompetitorUrls, newPagesSince, pageFeatures, queryTokens, urlMatchScore } from "../competitors";

test("query tokens drop filler words and stem plurals", () => {
  assert.deepEqual(queryTokens("best boat launches in Chicago"), ["boat", "launch", "chicago"]);
});

test("a competitor URL matches only when most query words appear in its path", () => {
  const t = queryTokens("chicago boat launches");
  assert.ok(urlMatchScore("https://x.com/chicago-boat-launches-guide", t) > 0);
  assert.equal(urlMatchScore("https://x.com/blog/best-pizza", t), 0);
  assert.equal(urlMatchScore("https://x.com/boat-rentals", t), 0);
});

test("one URL per competitor first, best first, capped", () => {
  const m = new Map([["a.com", ["https://a.com/chicago-boat-launches", "https://a.com/chicago-boat-launches-map"]], ["b.com", ["https://b.com/boat-launches-chicago"]], ["c.com", ["https://c.com/pizza"]]]);
  const r = matchCompetitorUrls(m, queryTokens("chicago boat launches"), 4);
  assert.deepEqual(r.map((x) => x.host).sort(), ["a.com", "b.com"]);
});

test("page features are read from the page itself", () => {
  const html = `<html><head><title>Float plan tool</title><script type="application/ld+json">{"@type":"FAQPage"}</script></head><body><main><h1>Float plan</h1><h2>a</h2><h2>b</h2><form><input><input></form><p>Use this planner to build a float plan.</p><table></table></main></body></html>`;
  const f = pageFeatures(html, "https://c.com/float", "2026-11-26");
  assert.equal(f.hasFaqSchema, true);
  assert.equal(f.hasTool, true);
  assert.equal(f.tables, 1);
  assert.equal(f.h2s, 2);
});

test("gaps name only what is visible on both pages", () => {
  const theirs = pageFeatures(`<main><h1>t</h1><form><input><input></form><p>calculator</p><table></table></main><script>{"@type":"FAQPage"}</script>`, "https://c.com/p", "2026-11-26");
  const ours = pageFeatures(`<main><h1>t</h1><p>text</p></main>`, "https://us.com/p", "2026-11-26");
  const kinds = featureGaps(ours, theirs).map((g) => g.kind).sort();
  assert.deepEqual(kinds, ["faq_schema", "interactive_tool", "table"]);
  assert.ok(featureGaps(ours, theirs).every((g) => g.competitorUrl === "https://c.com/p" && g.observedAt === "2026-11-26"));
  assert.equal(featureGaps(theirs, theirs).length, 0);
});

test("a competitor page is only called new when an earlier observation of that competitor existed", () => {
  const obs = [{ host: "old.com", url: "https://old.com/new", firstSeen: "2026-11-25" }, { host: "first.com", url: "https://first.com/x", firstSeen: "2026-11-25" }];
  const r = newPagesSince(obs, new Set(["old.com"]), "2026-11-18");
  assert.deepEqual(r.map((x) => x.host), ["old.com"]);
});

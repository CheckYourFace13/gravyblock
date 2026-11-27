import { test } from "node:test";
import assert from "node:assert/strict";
import { brandTokens, cannibalization, clusterQueries, competitorRelevance, emergingQueries, intentOf, isBranded, mobileGap, sectionStats, uncaptured } from "../deep";

const brand = brandTokens("The Drink Place", "https://thedrinkplace.com/");

test("branded means the whole brand or domain label, not one shared word", () => {
  assert.equal(isBranded("the drink place chicago", brand), true);
  assert.equal(isBranded("thedrinkplace", brand), true);
  assert.equal(isBranded("best drink near me", brand), false);
});

test("intent is read from the searcher's words", () => {
  assert.equal(intentOf("happy hour near me"), "local");
  assert.equal(intentOf("boat rental chicago price"), "transactional");
  assert.equal(intentOf("how to make an old fashioned"), "informational");
  assert.equal(intentOf("the drink place", brand), "navigational");
});

test("queries sharing their main words form one topic cluster", () => {
  const rows = [
    { query: "chicago boat launch", page: "https://x/a", clicks: 2, impressions: 100, position: 8 },
    { query: "boat launch chicago il", page: "https://x/a", clicks: 1, impressions: 60, position: 9 },
    { query: "marinas chicago", page: "https://x/m", clicks: 0, impressions: 40, position: 15 },
  ];
  const c = clusterQueries(rows, []);
  const launch = c.find((x) => x.queries.includes("chicago boat launch"))!;
  assert.ok(launch.queries.includes("boat launch chicago il"));
  assert.equal(launch.impressions, 160);
});

test("emerging queries are new in this window with real impressions", () => {
  const e = emergingQueries([{ key: "new topic", clicks: 0, impressions: 30, position: 9 }, { key: "old", clicks: 1, impressions: 50, position: 4 }, { key: "tiny", clicks: 0, impressions: 2, position: 30 }], [{ key: "old", clicks: 0, impressions: 10, position: 6 }]);
  assert.deepEqual(e.map((x) => x.key), ["new topic"]);
});

test("cannibalization needs two of our pages each with a real share", () => {
  const rows = [
    { query: "q", page: "/a", clicks: 0, impressions: 60, position: 9 },
    { query: "q", page: "/b", clicks: 0, impressions: 40, position: 12 },
    { query: "solo", page: "/a", clicks: 0, impressions: 200, position: 5 },
  ];
  assert.deepEqual(cannibalization(rows).map((c) => c.query), ["q"]);
});

test("sections aggregate many pages into one template view", () => {
  const s = sectionStats([{ key: "https://x.com/places/a", clicks: 1, impressions: 10, position: 5 }, { key: "https://x.com/places/b", clicks: 0, impressions: 5, position: 9 }], [{ key: "https://x.com/places/a", clicks: 9, impressions: 300, position: 4 }]);
  assert.equal(s[0]!.section, "/places");
  assert.equal(s[0]!.pages, 2);
  assert.equal(s[0]!.impressionsPrev, 300);
});

test("mobile gap only with enough data on both devices and similar positions", () => {
  assert.ok(mobileGap([{ key: "MOBILE", clicks: 10, impressions: 2000, ctr: 0.005, position: 6 }, { key: "DESKTOP", clicks: 30, impressions: 1000, ctr: 0.03, position: 6.5 }]));
  assert.equal(mobileGap([{ key: "MOBILE", clicks: 1, impressions: 50, ctr: 0.02, position: 6 }, { key: "DESKTOP", clicks: 3, impressions: 40, ctr: 0.07, position: 6 }]), null);
});

test("uncaptured demand: on-topic suggestions the site never appears for", () => {
  const u = uncaptured(["happy hour chicago", "happy hour near me", "starbucks menu prices", "bars open late chicago"], ["happy hour chicago loop", "chicago happy hour deals"], ["bar", "happy", "drink"]);
  assert.deepEqual(u, ["happy hour near me", "bars open late chicago"]);
});

test("a famous brand is not a competitor unless its own pages cover the topic", () => {
  const coffee = Array.from({ length: 300 }, (_, i) => `https://www.starbucks.com/menu/product/${i}/hot`);
  assert.equal(competitorRelevance(coffee, ["bar", "happy-hour", "cocktail", "drink"]).relevant, false);
  const rival = [...Array.from({ length: 40 }, (_, i) => `https://rival.com/bars/chicago-bar-${i}`), ...Array.from({ length: 20 }, (_, i) => `https://rival.com/about/${i}`)];
  assert.equal(competitorRelevance(rival, ["bar", "happy-hour", "cocktail"]).relevant, true);
});

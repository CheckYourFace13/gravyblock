import { test } from "node:test";
import assert from "node:assert/strict";
import { growthOpportunities, textLooksValid } from "../growth";
import type { SiteIntel, DeepIntel } from "../types";

const deep = (over: Partial<DeepIntel> = {}): DeepIntel => ({
  profile: { what: "drink and venue discovery", audience: "people choosing where to drink", conversions: ["account registration"] },
  truthDescription: null, window28: { start: "2026-10-28", end: "2026-11-24" }, trend90: null, devices: [], countries: [], searchTypes: { image: null, video: null },
  brand: { brandedClicks: 0, brandedImpressions: 0, nonBrandedClicks: 0, nonBrandedImpressions: 0 },
  clusters: [], emerging: [], cannibal: [], sections: [], pageQuery: [],
  demand: { source: "DuckDuckGo public autocomplete", checkedAt: "2026-11-27T00:00:00Z", seeds: [], suggestions: 0, uncaptured: [], notes: [] },
  competitorFilter: { kept: [], rejected: [] }, learnedWeights: {}, ...over,
});

const intel = (over: Partial<SiteIntel> = {}): SiteIntel => ({
  version: 1, site: { businessId: "b", name: "The Drink Place", website: "https://thedrinkplace.com/" }, generatedAt: "2026-11-27T12:00:00Z", weekEnding: "2026-11-27", endDay: "2026-11-24", googleConnected: true,
  status: { status: "ok", latestDay: "2026-11-24", notes: [] }, w7: null, w28: null, queries7: null, queries28: null, pages7: null,
  pages28: { rising: [], declining: [
    { key: "https://thedrinkplace.com/places/game-day-loc-605", clicksCur: 0, clicksPrev: 42, imprCur: 0, imprPrev: 217, posCur: null, posPrev: 3 },
    { key: "https://thedrinkplace.com/places/sweet-sour-loc-65", clicksCur: 0, clicksPrev: 10, imprCur: 0, imprPrev: 127, posCur: null, posPrev: 5 },
  ] },
  bands: null, lowCtr: [], topPages: [{ page: "https://thedrinkplace.com/business", clicks: 1, impressions: 5 }],
  indexing: { dropped: { lost: 787, before: 790, impressionsBefore: 1674, impressionsNow: 33, reading: null, sample: ["https://thedrinkplace.com/places/oyster-loc-407"] }, rechecks: [{ at: "2026-11-25T00:00:00Z", verdicts: { crawled_not_indexed: 5, noindex_tag: 1 } }], notes: [] },
  seasonal: null,
  competitors: { observedAt: "2026-11-27T12:00:00Z", known: [], sitemapsRead: 0, pagesObserved: 0, baselineEstablishedToday: [], newPages: [], queries: [], notes: [] },
  openBriefs: [{ type: "conversion", subtype: "no_conversion_path", impact: 30, text: "No CTA", urls: ["https://thedrinkplace.com/business"] }, { type: "content_gap", subtype: "embeddable_widget_brief", impact: 45, text: "Propo al for the ite' own developer", urls: [] }],
  authority: { qualified: 0, contacted: 0, verifiedLinks: 0, note: "" }, changes: [], dataQualityNotes: [],
  deep: deep(), ...over,
});

test("one technical-recovery item absorbs every page that lost all impressions (no separate 'investigate the drop' tasks)", () => {
  const ops = growthOpportunities(intel());
  const idx = ops.filter((o) => o.kind === "indexing");
  assert.equal(idx.length, 1);
  assert.ok(idx[0]!.urls.some((u) => u.includes("game-day")));
  assert.equal(ops.filter((o) => (o.kind as string) === "declining").length, 0);
  assert.match(idx[0]!.evidence[0]!, /separate from the performance windows/);
  assert.ok(idx[0]!.actions[0]!.includes("safeguards"));
});

test("generic conversion warnings and widget proposals are not opportunities", () => {
  const ops = growthOpportunities(intel());
  assert.equal(ops.filter((o) => o.kind === "conversion").length, 0); // /business has 1 search click: below the bar
  assert.equal(ops.filter((o) => o.kind === "confirmed_problem").length, 0);
});

test("conversion appears only where real search visitors land without a next step", () => {
  const ops = growthOpportunities(intel({ topPages: [{ page: "https://thedrinkplace.com/business", clicks: 12, impressions: 300 }] }));
  const c = ops.find((o) => o.kind === "conversion");
  assert.ok(c);
  assert.match(c!.title, /account registration/);
});

test("uncaptured demand becomes a new-search-demand item with its evidence source and no invented clicks", () => {
  const ops = growthOpportunities(intel({ deep: deep({ demand: { source: "DuckDuckGo public autocomplete", checkedAt: "2026-11-27T00:00:00Z", seeds: [], suggestions: 20, uncaptured: [{ label: "happy hour near me", queries: ["happy hour near me", "happy hour near me today"], competitorPages: [{ url: "https://rival.com/happy-hour", title: "Happy hours", observedAt: "2026-11-27T00:00:00Z" }] }], notes: [] } }) }));
  const n = ops.find((o) => o.kind === "new_demand")!;
  assert.equal(n.potentialClicks28, 0);
  assert.match(n.evidence[0]!, /not how many/);
  assert.ok(n.competitorUrls[0]!.includes("rival.com"));
  assert.equal(n.category, "new search demand");
});

test("corrupted text is rejected before delivery", () => {
  assert.equal(textLooksValid("Propo al for the ite' own developer: A print-friendly or embeddable ver ion of an exi ting tool or checkli t, with a plain vi ible credit"), false);
  assert.equal(textLooksValid("Restore the pages that dropped out of Google"), true);
  assert.equal(textLooksValid("clicks undefined to NaN"), false);
  assert.equal(textLooksValid('"google business profile checker": position 17.1, 72 impressions, 1 clicks (2026-10-29 to 2026-11-25), shown for /tools/google-business-profile-checker.'), true);
});

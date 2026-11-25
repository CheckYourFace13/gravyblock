import { test } from "node:test";
import assert from "node:assert/strict";
import { compareWindows } from "../analysis";
import { buildPrompt, deriveImprovements } from "../prompt";
import { renderSearchSection, summarizePortfolio, type StoredReport } from "../index";
import type { SiteIntel } from "../types";
import type { Daily } from "@/lib/case-studies/model";
import { addDays } from "@/lib/case-studies/model";

const daily: Daily[] = Array.from({ length: 70 }, (_, i) => ({ day: addDays("2026-11-22", -69 + i), clicks: 4, impressions: 120, position: 8 }));
const w28 = compareWindows(daily, "2026-11-22", 28);

const base = (over: Partial<SiteIntel> = {}): SiteIntel => ({
  version: 1,
  site: { businessId: "b1", name: "Example Site", website: "https://example.com/" },
  generatedAt: "2026-11-26T12:00:00.000Z",
  weekEnding: "2026-11-27",
  endDay: "2026-11-22",
  googleConnected: true,
  status: { status: "ok", latestDay: "2026-11-22", notes: [] },
  w7: compareWindows(daily, "2026-11-22", 7),
  w28,
  queries7: null, queries28: null, pages28: { rising: [], declining: [{ key: "https://example.com/old", clicksCur: 1, clicksPrev: 12, imprCur: 40, imprPrev: 300, posCur: 9, posPrev: 5 }] },
  pages7: null,
  bands: { b4_10: [{ query: "boat launch chicago", page: "https://example.com/launches", position: 6.2, impressions: 400, clicks: 4 }], b11_20: [], b21_40: [] },
  lowCtr: [{ page: "https://example.com/marinas", query: "chicago marinas", position: 3.1, impressions: 900, ctr: 0.01, expected: 0.1, clicksMissing: 81 }],
  topPages: [{ page: "https://example.com/launches", clicks: 40, impressions: 900 }],
  indexing: { dropped: null, rechecks: [], notes: [] },
  seasonal: { cur28: 112, sameWeeksLastYear: null, note: "Not enough history to compare with the same weeks last year, so no seasonal claim is made." },
  competitors: {
    observedAt: "2026-11-26T12:00:00.000Z", known: [{ name: "Rival", website: "https://rival.com" }], sitemapsRead: 1, pagesObserved: 40, baselineEstablishedToday: ["rival.com"], newPages: [],
    queries: [{ query: "chicago marinas", impressions: 900, position: 3.1, ourPage: null, competitorPages: [{ url: "https://rival.com/chicago-marinas", title: "Chicago marinas map", host: "rival.com", h1: "", words: 900, h2s: 5, hasFaqSchema: false, hasTool: true, tables: 0, hasVideo: false, images: 3, observedAt: "2026-11-26T12:00:00.000Z" }], gaps: [{ kind: "interactive_tool", evidence: "https://rival.com/chicago-marinas offers an interactive tool.", competitorUrl: "https://rival.com/chicago-marinas", ourUrl: "https://example.com/marinas", observedAt: "2026-11-26T12:00:00.000Z" }] }],
    notes: [],
  },
  openBriefs: [{ type: "technical", subtype: "multiple_h1", impact: 40, text: "Page /x has 2 h1 tags" }],
  authority: { qualified: 0, contacted: 0, verifiedLinks: 0, note: "n/a" },
  changes: ["First report"],
  dataQualityNotes: [],
  ...over,
});

test("improvements are evidence-backed, at most five, highest impact first", () => {
  const imps = deriveImprovements(base());
  assert.ok(imps.length >= 3 && imps.length <= 5);
  assert.equal(imps[0]!.kind, "low_ctr");
  assert.ok(imps.every((i) => i.evidence.length > 0 && i.acceptance.length > 0));
  assert.ok(imps.some((i) => i.competitorUrls.some((u) => u.includes("rival.com"))));
});

test("the prompt is one complete instruction with the required sections and real URLs", () => {
  const intel = base();
  const p = buildPrompt(intel, deriveImprovements(intel));
  for (const s of ["DATA QUALITY", "RULES", "PRESERVE", "IMPROVEMENTS", "Affected URLs", "Competitor reference URLs", "Acceptance:", "ACCEPTANCE TESTS", "PRODUCTION VERIFICATION"]) assert.match(p, new RegExp(s));
  assert.match(p, /https:\/\/example\.com\/marinas/);
  assert.match(p, /https:\/\/rival\.com\/chicago-marinas/);
  assert.match(p, /Never copy competitor text/);
  assert.match(p, /not total website visitors/);
});

test("with no evidence the prompt asks for validation instead of inventing a change", () => {
  const intel = base({ lowCtr: [], bands: { b4_10: [], b11_20: [], b21_40: [] }, pages28: { rising: [], declining: [] }, competitors: { ...base().competitors, queries: [] }, openBriefs: [], topPages: [] });
  const imps = deriveImprovements(intel);
  assert.equal(imps.length, 0);
  assert.match(buildPrompt(intel, imps), /does not have enough evidence this week to recommend a specific change/);
});

test("an indexing collapse outranks everything else", () => {
  const intel = base({ indexing: { dropped: { lost: 725, before: 728, impressionsBefore: 2271, impressionsNow: 53, reading: null, sample: ["https://example.com/places/a"] }, rechecks: [{ at: "2026-11-25T00:00:00Z", verdicts: { crawled_not_indexed: 5, noindex_tag: 1 } }], notes: [] } });
  assert.equal(deriveImprovements(intel)[0]!.kind, "indexing");
});

test("portfolio roll-up never counts a low-sample site as a gain or loss and lists missing sites", () => {
  const quiet = base({ w28: compareWindows(daily.map((d) => ({ ...d, clicks: 0, impressions: 1 })), "2026-11-22", 28) });
  const reports: StoredReport[] = [
    { businessId: "b1", name: "A", weekEnding: "2026-11-27", createdAt: "x", data: base(), prompt: "p" },
    { businessId: "b2", name: "B", weekEnding: "2026-11-27", createdAt: "x", data: quiet, prompt: "p" },
  ];
  const s = summarizePortfolio(reports, ["A", "B", "C"], "2026-11-27");
  assert.deepEqual(s.missing, ["C"]);
  assert.ok(!s.gains.some((g) => g.site === "B") && !s.losses.some((g) => g.site === "B"));
  const out = renderSearchSection(s, []);
  assert.match(out.text, /Top five opportunities/);
  assert.match(out.html, /admin\/house\/search-reports\/b1/);
});

test("the Friday section labels each item by where it stands and does not repeat unopened ones", () => {
  const mk = (id: string, bucket: import("../recommendation-model").EmailBucket, title: string) => ({ id, businessId: "b1", site: "A", ref: `SR-${id}`, title, bucket, occurrence: 1, potentialClicks28: 10, priority: 50, outcome: null, verification: null, completedAt: null, verifiedAt: null });
  const s = summarizePortfolio([{ businessId: "b1", name: "A", weekEnding: "2026-11-27", createdAt: "x", data: base(), prompt: "p" }], ["A"], "2026-11-27");
  const out = renderSearchSection(s, [mk("1", "NEW", "Brand new problem"), mk("2", "STILL_UNOPENED", "Old unopened problem"), mk("3", "IN_PROGRESS", "Being built"), mk("4", "COMPLETED_AWAITING", "Done, awaiting check"), mk("5", "VERIFIED", "Fix confirmed")]);
  assert.match(out.text, /\[NEW\] A: Brand new problem/);
  assert.match(out.text, /NEW this week \(1\)/);
  assert.match(out.text, /IN PROGRESS \(1\)/);
  assert.match(out.text, /COMPLETED, awaiting verification \(1\)/);
  assert.match(out.text, /VERIFIED fixes \(1\)/);
  assert.match(out.text, /STILL OPEN, not yet opened \(already reported earlier\): 1 \(not repeated here/);
  assert.ok(out.text.includes("[STILL OPEN] A: Old unopened problem")); // still actionable, but labelled as already reported, never as new
  assert.doesNotMatch(out.text.split("NEW this week")[1] ?? "", /Old unopened problem/);
  assert.equal(out.included.length, 5);
});

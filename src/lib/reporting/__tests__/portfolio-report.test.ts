import assert from "node:assert/strict";
import { test } from "node:test";
import { renderPortfolioReport, type PortfolioReport } from "../portfolio-report";

const base: PortfolioReport = {
  generatedAt: "2026-11-23T20:00:00.000Z",
  windowDays: 7,
  offsite: { ok: true, value: [{ slug: "gravyblock", liveVideos: 2, views: 10, likes: 1, comments: 0, failed: 1, waiting: 0, lastPublished: "2026-11-22T10:00:00Z", metricsAsOf: null }] },
  attribution: { ok: true, value: [] },
  weekly: { ok: true, value: { viewsLifetime: { now: 12, before: 10 }, videosPublished: { now: 1, before: 3 }, publicationsFailed: { now: 0, before: 2 }, videoVisits: { now: 4, before: 1 }, videoScansCompleted: { now: 0, before: 0 }, videoCheckouts: { now: 0, before: 0 } } },
  revenue: { ok: true, value: { customers: 0, mrr: 0 } },
  backlinks: { ok: true, value: { acquired: 0, acquiredThisWeek: 0, inOutreach: 5 } },
  search: { ok: true, value: { connected: 0, clicks28d: null, impressions28d: null } },
  scanFunnel: { ok: true, value: { views: 10, engaged: 3, interacted: 4, submitted: 3, failed: 1, completed: 2, failures: [{ detail: "Could not save report", n: 1 }] } },
  learning: { ok: true, value: [{ type: "association", contacted: 21, acquired: 0, retired: true }] },
  searchDriven: { ok: true, value: { discovered: 4, open: 3, acted: 1, evaluated: 0, positive: 0, items: [{ site: "Outbreak Threat", page: "https://outbreakthreat.com/norovirus-outbreak-map", band: "near_page_one", status: "acted", baselineClicks: 165, afterClicks: null, measured: null }] } },
  backlinkFunnel: { ok: true, value: { prospectsFound: 400, passedRelevance: 119, hadSuitableContact: 60, pitched: 43, recipients: 43, delivered: 97, bounced: 2, replies: 0, linksVerified: 0, oldestSendDays: 64, newestSendDays: 1, pitchesLast7d: 2, followUpsLast7d: 1, placements: [] } },
  channels: { ok: true, value: [{ channel: "YouTube videos", actions: "2 tagged campaigns", visits: 18, scans: 0, checkouts: 0, note: "n" }] },
  siteDrafts: { ok: true, value: [{ name: "Mic Stage", total: 7 }] },
  actions: { ok: true, value: [{ type: "backlink", discovered: 5, acted: 1, verified: 0, noGain: 0 }] },
  engines: { ok: true, value: [{ name: "GravyBlock", open: 3, acted: 1, verified: 0, noGain: 0 }] },
  health: { ok: true, value: { failedJobsByType: {}, sendFailures7d: 0, lastWatchdog: { green: 10, yellow: 2, red: 0, checked: 12 }, cold7d: 1, followup7d: 2, breakup7d: 3 } },
  setup: { ok: true, value: { houseCount: 12, searchConsoleConnected: 0, publishingLiveEnabled: false, citationsNeedingOwner: 8, proofLedgerEntries: 8 } },
};

test("report totals the measured numbers and never invents traffic", () => {
  const t = renderPortfolioReport(base);
  assert.match(t, /total: 2 live videos, 10 views, 1 likes/);
  assert.match(t, /no visits tagged utm_source=youtube/);
  assert.match(t, /other 11 sites: not measured here/);
  assert.match(t, /Search Console connected for 0 of 12/);
  assert.match(t, /search performance \(Search Console\): not measured/);
  assert.match(t, /videos published: 1 \(-2 vs previous period\)/);
  assert.match(t, /visits to gravyblock.com from video links: 4 \(\+3 vs previous period\)/);
  assert.match(t, /0 live and verified in total/);
});

test("scan behavior and growth actions are shown with their real counts", () => {
  const t = renderPortfolioReport(base);
  assert.match(t, /viewed the scan page 10 \(3 showed human input[^)]*\), touched the form 4, submitted 3, hit an error 1, completed a scan 2/);
  assert.match(t, /backlink\s+discovered 5, acted 1, verified 0/);
});

test("a failed metric shows as unavailable, never as zero", () => {
  const t = renderPortfolioReport({ ...base, offsite: { ok: false, error: "db down" } });
  assert.match(t, /unavailable: db down/);
  assert.doesNotMatch(t, /total: 0 live videos/);
});

test("search section shows only the latest 28 days per site with the change against the window before", () => {
  const t = renderPortfolioReport({
    ...base,
    search: { ok: true, value: { connected: 2, clicks28d: 160, impressions28d: 9000, bySite: [{ name: "Quiet Site", clicks: 7, impressions: 400, priorClicks: 9, priorImpressions: 300 }, { name: "Busy Site", clicks: 153, impressions: 8600, priorClicks: 100, priorImpressions: 7000 }] } },
  });
  assert.match(t, /latest 28 days\): 160 clicks, 9000 impressions/);
  assert.match(t, /Busy Site\s+153 clicks \(\+53 vs the 28 days before\)/);
  assert.match(t, /Quiet Site\s+7 clicks \(-2 vs the 28 days before\)/);
  assert.ok(t.indexOf("Busy Site") < t.indexOf("Quiet Site"));
});

test("channel verdicts never call a small sample a win or a loss", async () => {
  const { judgeChannel } = await import("../portfolio-report");
  assert.match(judgeChannel(18, 0), /too early/);
  assert.match(judgeChannel(150, 0), /no conversions at this volume/);
  assert.match(judgeChannel(40, 3), /working/);
  assert.equal(judgeChannel(null, null), "NOT MEASURED");
  const t = renderPortfolioReport(base);
  assert.match(t, /SEARCH-DRIVEN WORK/);
  assert.match(t, /CHANNEL COMPARISON/);
  assert.match(t, /norovirus-outbreak-map baseline clicks 165, after not measured: waiting for the 28-day window/);
});

test("the report separates actions completed from results and never counts prospects as growth", () => {
  const t = renderPortfolioReport(base);
  assert.match(t, /OFF-SITE ACTIONS COMPLETED AND PLACEMENTS/);
  assert.match(t, /2 first pitches and 1 follow-ups sent/);
  assert.match(t, /97 delivered, 2 bounced; replies received 0; live links verified 0/);
  assert.match(t, /no link has been verified yet/);
  assert.match(t, /accepted placements: none/);
});

test("the site brief for a search finding is plain language and keeps the reading", async () => {
  const { briefEvidence } = await import("@/lib/house/site-briefs");
  const t = briefEvidence("search_pages_dropped", { lostPages: 701, priorPages: 728, impressionsBefore: 2271, impressionsNow: 53, clicksOnLostPages: 86, byPathPrefix: [{ prefix: "/places", before: 700, lost: 690 }], verdicts: { noindex_tag: 3, crawled_not_indexed: 3 }, reading: "Confirm the tag is intended." })!;
  assert.match(t, /HIGH PRIORITY\. 701 of 728 pages/);
  assert.match(t, /\/places 690 of 700/);
  assert.match(t, /noindex tag 3, crawled but not indexed 3/);
  assert.match(t, /Confirm the tag is intended/);
  assert.equal(briefEvidence("schema", { a: 1 }), null);
});

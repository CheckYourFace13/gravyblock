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

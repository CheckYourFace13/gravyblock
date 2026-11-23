import assert from "node:assert/strict";
import { test } from "node:test";
import { renderPortfolioReport, type PortfolioReport } from "../portfolio-report";

const base: PortfolioReport = {
  generatedAt: "2026-11-23T20:00:00.000Z",
  windowDays: 7,
  offsite: { ok: true, value: [{ slug: "gravyblock", liveVideos: 2, views: 10, likes: 1, comments: 0, failed: 1, waiting: 0, lastPublished: "2026-11-22T10:00:00Z", metricsAsOf: null }] },
  attribution: { ok: true, value: [] },
  engines: { ok: true, value: [{ name: "GravyBlock", open: 3, acted: 1, verified: 0, noGain: 0 }] },
  health: { ok: true, value: { failedJobsByType: {}, sendFailures7d: 0, lastWatchdog: { green: 10, yellow: 2, red: 0, checked: 12 }, cold7d: 1, followup7d: 2, breakup7d: 3 } },
  setup: { ok: true, value: { houseCount: 12, searchConsoleConnected: 0, publishingLiveEnabled: false, citationsNeedingOwner: 8, proofLedgerEntries: 8 } },
};

test("report totals the measured numbers and never invents traffic", () => {
  const t = renderPortfolioReport(base);
  assert.match(t, /total: 2 live videos, 10 views, 1 likes/);
  assert.match(t, /no visits tagged utm_source=youtube/);
  assert.match(t, /other 11 sites: not measured here/);
  assert.match(t, /Search Console connected for 0 of 12.*not measured/);
});

test("a failed metric shows as unavailable, never as zero", () => {
  const t = renderPortfolioReport({ ...base, offsite: { ok: false, error: "db down" } });
  assert.match(t, /unavailable: db down/);
  assert.doesNotMatch(t, /total: 0 live videos/);
});

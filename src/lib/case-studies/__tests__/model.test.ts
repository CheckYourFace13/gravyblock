import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, draftClaims, judgeAttribution, renderClaim, storyWindows, sumWindow, type Daily } from "../model";

const days = (from: string, n: number, clicks: number, impressions: number): Daily[] => Array.from({ length: n }, (_, i) => ({ day: addDays(from, i), clicks, impressions, position: 10 }));

test("windows: baseline is the 30 days before the start, after-windows end at +30/+60/+90 and only count once Search Console can have them", () => {
  const w = storyWindows("2026-09-21", "2026-11-25");
  assert.deepEqual(w.baseline, { start: "2026-08-22", end: "2026-09-20" });
  assert.deepEqual(w.after[0], { label: "30", window: { start: "2026-09-21", end: "2026-10-20" }, elapsed: true });
  assert.equal(w.after[1]!.elapsed, true);
  assert.equal(w.after[2]!.window.end, "2026-12-19");
  assert.equal(w.after[2]!.elapsed, false);
});

test("sumWindow adds clicks and impressions and weights position by impressions", () => {
  const d: Daily[] = [
    { day: "2026-01-01", clicks: 1, impressions: 10, position: 2 },
    { day: "2026-01-02", clicks: 3, impressions: 30, position: 6 },
    { day: "2026-02-01", clicks: 99, impressions: 99, position: 1 },
  ];
  const s = sumWindow(d, { start: "2026-01-01", end: "2026-01-31" });
  assert.equal(s.clicks, 4);
  assert.equal(s.impressions, 40);
  assert.equal(s.position, 5);
  assert.equal(s.daysWithData, 2);
});

test("attribution is refused without a verified placement, without a page measurement, and for site-wide rises", () => {
  assert.equal(judgeAttribution({ placements: [], measure: null }).attributable, false);
  const p = [{ verifiedAt: "2026-11-01", targetPage: "https://x/p", from: "https://y" }];
  assert.equal(judgeAttribution({ placements: p, measure: null }).attributable, false);
  assert.equal(judgeAttribution({ placements: p, measure: { pageClicksBefore: 10, pageClicksAfter: 40, siteClicksBefore: 100, siteClicksAfter: 400 } }).attributable, false);
  assert.equal(judgeAttribution({ placements: [], measure: { pageClicksBefore: 10, pageClicksAfter: 90, siteClicksBefore: 100, siteClicksAfter: 110 } }).attributable, false);
  assert.equal(judgeAttribution({ placements: p, measure: { pageClicksBefore: 10, pageClicksAfter: 90, siteClicksBefore: 100, siteClicksAfter: 110 } }).attributable, true);
});

test("draft claims never call an email a result or a change a cause", () => {
  const base = sumWindow(days("2026-08-22", 30, 1, 10), { start: "2026-08-22", end: "2026-09-20" });
  const latest = sumWindow(days("2026-10-26", 30, 2, 30), { start: "2026-10-26", end: "2026-11-24" });
  const claims = draftClaims({ startDay: "2026-09-21", baseline: base, latest, emailsSent: 7, organisations: 5, videos: 6, linksVerified: 0, attribution: judgeAttribution({ placements: [], measure: null }) });
  const text = claims.map(renderClaim).join("\n");
  assert.match(text, /No live link from another site has been verified yet/);
  assert.match(text, /A sent email is an action, not a result/);
  assert.match(text, /not what caused it/);
  assert.match(text, /30 days before GravyBlock started \(\+100%\)/);
  assert.equal(claims.find((c) => c.key === "attribution")!.stage, "ATTRIBUTABLE");
  assert.doesNotMatch(text, /thanks to|because of GravyBlock|resulted in/i);
});

test("a site with no baseline data makes no search claims", () => {
  const keys = draftClaims({ startDay: null, baseline: null, latest: null, emailsSent: 0, organisations: 0, videos: 0, linksVerified: 0, attribution: judgeAttribution({ placements: [], measure: null }) }).map((c) => c.key);
  assert.deepEqual(keys, ["links", "attribution"]);
});

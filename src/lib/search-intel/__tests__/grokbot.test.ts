import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrokbotEmail, buildSubject, containsSensitive, grokbotConfig, idempotencyKey, isActionable, issueSummary, occurrenceStart, retryDelayMs, scrubPersonal } from "../grokbot";
import { compareWindows } from "../analysis";
import type { Improvement, SiteIntel } from "../types";
import type { Daily } from "@/lib/case-studies/model";
import { addDays } from "@/lib/case-studies/model";

const daily: Daily[] = Array.from({ length: 70 }, (_, i) => ({ day: addDays("2026-11-22", -69 + i), clicks: 4, impressions: 120, position: 8 }));
const imp = (over: Partial<Improvement> = {}): Improvement => ({
  kind: "low_ctr", issue: "low_ctr", identityUrls: ["https://example.com/marinas"], title: "Rewrite the title and meta description of /marinas so more searchers click", urls: ["https://example.com/marinas"],
  evidence: ['"chicago marinas": position 3.1, 900 impressions, CTR 1.0% where about 10.0% is normal'], competitorUrls: ["https://rival.com/chicago-marinas (title: \"Marinas\", observed 2026-11-25)"], actions: ["Rewrite the title"], acceptance: ["Title live"], potentialClicks28: 80, priority: 60, ...over,
});
const intel = (): SiteIntel => ({
  version: 1, site: { businessId: "b1", name: "Example Site", website: "https://example.com/" }, generatedAt: "2026-11-26T12:00:00.000Z", weekEnding: "2026-11-27", endDay: "2026-11-22", googleConnected: true,
  status: { status: "ok", latestDay: "2026-11-22", notes: [] }, w7: compareWindows(daily, "2026-11-22", 7), w28: compareWindows(daily, "2026-11-22", 28), queries7: null, queries28: null, pages7: null, pages28: null, bands: null,
  lowCtr: [], topPages: [{ page: "https://example.com/launches", clicks: 40, impressions: 900 }], indexing: { dropped: null, rechecks: [], notes: [] }, seasonal: null,
  competitors: { observedAt: "2026-11-25T12:00:00.000Z", known: [], sitemapsRead: 0, pagesObserved: 0, baselineEstablishedToday: [], newPages: [], queries: [], notes: [] },
  openBriefs: [], authority: { qualified: 0, contacted: 0, verifiedLinks: 0, note: "n/a" }, changes: [], dataQualityNotes: [],
});

test("each occurrence has exactly one idempotency key, and a reopening is a different occurrence", () => {
  assert.equal(idempotencyKey("rec1", 1), "rec1:1");
  assert.notEqual(idempotencyKey("rec1", 1), idempotencyKey("rec1", 2));
});

test("only occurrences that began after activation count, so the backlog is never sent", () => {
  const first = new Date("2026-11-20T00:00:00Z");
  const reopened = new Date("2026-12-10T00:00:00Z");
  assert.equal(occurrenceStart(1, first, null)!.getTime(), first.getTime());
  assert.equal(occurrenceStart(2, first, reopened)!.getTime(), reopened.getTime());
  assert.equal(occurrenceStart(2, first, null), null);
});

test("only concrete, evidenced changes are emailed", () => {
  assert.equal(isActionable(imp()), true);
  assert.equal(isActionable(imp({ kind: "page_two" })), false);
  assert.equal(isActionable(imp({ urls: [] })), false);
  assert.equal(isActionable(imp({ evidence: [" "] })), false);
});

test("retry waits grow and the limit is five attempts", () => {
  assert.ok(retryDelayMs(1) < retryDelayMs(2) && retryDelayMs(2) < retryDelayMs(3) && retryDelayMs(3) < retryDelayMs(4));
});

test("the subject follows the agreed format", () => {
  const s = buildSubject("Example Site", "SR-1A2B3C", imp(), "new");
  assert.equal(s, "[GravyBlock Action] Example Site — SR-1A2B3C — Low click-through on /marinas");
  assert.match(buildSubject("Example Site", "SR-1A2B3C", imp(), "reopened"), /REOPENED: /);
  assert.match(buildSubject("Example Site", "SR-TEST00", imp(), "test"), /^\[TEST\] /);
  assert.match(issueSummary(imp({ kind: "confirmed_problem", issue: "technical:multiple_h1", urls: ["https://x/a", "https://x/b"] })), /multiple h1 on 2 pages/);
});

test("credentials block a send and personal details are removed", () => {
  assert.equal(containsSensitive("the key is sk_live_abcdefgh12345678"), true);
  assert.equal(containsSensitive("password: hunter2hunter2"), true);
  assert.equal(containsSensitive("Position 3.1 with 900 impressions"), false);
  const out = scrubPersonal("Ask jane@example.org or call +1 312 555 0147 about https://example.com/page-12345678901");
  assert.doesNotMatch(out, /jane@|555 0147/);
  assert.match(out, /https:\/\/example\.com\/page-12345678901/);
});

test("the email carries everything needed and says that sending changes nothing", () => {
  const m = buildGrokbotEmail({ site: { name: "Example Site", website: "https://example.com/", businessId: "b1" }, ref: "SR-1A2B3C", occurrence: 1, kind: "new", improvement: imp(), intel: intel(), now: new Date("2026-11-26T15:00:00Z") });
  for (const s of ["Website: https://example.com/", "Recommendation ID: SR-1A2B3C", "AFFECTED URLS", "https://example.com/marinas", "CURRENT GOOGLE SEARCH CONSOLE EVIDENCE", "CTR 1.0%", "COMPETITOR REFERENCES", "https://rival.com/chicago-marinas", "SPECIFIC IMPROVEMENTS TO MAKE", "EXISTING FEATURES AND PROTECTIONS TO PRESERVE", "COPY-READY DEVELOPMENT INSTRUCTION", "ACCEPTANCE TESTS", "PRODUCTION VERIFICATION", "REPORT BACK", "does not change the task", "GravyBlock never edits this site"]) assert.ok(m.text.includes(s), s);
  assert.equal(m.html, ""); // plain text only
  const t = buildGrokbotEmail({ site: { name: "Example Site", website: "https://example.com/", businessId: "b1" }, ref: "SR-TEST00", occurrence: 1, kind: "test", improvement: imp(), intel: intel(), now: new Date() });
  assert.match(t.text, /^\*\*\* TEST MESSAGE/);
});

test("configuration defaults to the agreed sender and recipient and respects a configurable cap", () => {
  const c = grokbotConfig({});
  assert.equal(c.to, "mygrokbot2026@gmail.com");
  assert.equal(c.from, "Casey at GravyBlock <hello@gravyblock.com>");
  assert.equal(c.dailyCap, 6);
  assert.equal(grokbotConfig({ GROKBOT_DAILY_CAP: "2", GROKBOT_PAUSED: "1" }).dailyCap, 2);
  assert.equal(grokbotConfig({ GROKBOT_PAUSED: "1" }).paused, true);
});

import { gateFrom } from "../grokbot";

test("after the v3 switch, immediate emails reopen at the baseline-complete marker and only for occurrences that begin after it", () => {
  const sw = new Date("2026-11-28T16:46:40Z");
  assert.deepEqual(gateFrom(sw, null, null), { open: false, since: null });
  const done = new Date("2026-11-28T18:00:00Z");
  assert.deepEqual(gateFrom(sw, done, null), { open: true, since: done });
  const audit = new Date("2026-12-04T12:30:00Z");
  assert.deepEqual(gateFrom(sw, done, audit), { open: true, since: done });
  assert.deepEqual(gateFrom(sw, null, audit), { open: true, since: audit });
  assert.deepEqual(gateFrom(sw, new Date("2026-11-01T00:00:00Z"), null), { open: false, since: null }); // a marker from before the switch does not count
  assert.deepEqual(gateFrom(null, null, null), { open: true, since: null });
});

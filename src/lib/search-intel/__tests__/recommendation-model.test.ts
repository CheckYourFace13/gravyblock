import { test } from "node:test";
import assert from "node:assert/strict";
import { afterOpen, canTransition, classifyOutcome, emailBucket, evaluateVerification, fingerprintOf, normalizeUrl, onSeen, outcomeWindows, shortRef, snapshotFromHtml } from "../recommendation-model";

const NOW = new Date("2026-12-04T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

test("identity ignores weekly numbers, url noise and order, but not business, issue or page", () => {
  const a = fingerprintOf("b1", "low_ctr", "low_ctr", ["https://www.Example.com/marinas/?utm=1"]);
  assert.equal(a, fingerprintOf("b1", "low_ctr", "low_ctr", ["https://example.com/marinas"]));
  assert.notEqual(a, fingerprintOf("b2", "low_ctr", "low_ctr", ["https://example.com/marinas"]));
  assert.notEqual(a, fingerprintOf("b1", "near_page_one", "near_page_one", ["https://example.com/marinas"]));
  assert.notEqual(a, fingerprintOf("b1", "low_ctr", "low_ctr", ["https://example.com/launches"]));
  assert.match(shortRef(a), /^SR-[0-9A-F]{6}$/);
  assert.equal(normalizeUrl("https://www.x.com/a/b/"), "https://x.com/a/b");
});

test("regeneration keeps status: the same problem is an update, never a new task", () => {
  assert.equal(onSeen(null, NOW).action, "create");
  for (const s of ["new", "opened", "in_progress", "completed"] as const) {
    const r = onSeen({ status: s, verifiedAt: null, occurrence: 1 }, NOW);
    assert.deepEqual([r.action, r.status, r.occurrence], ["update", s, 1]);
  }
  assert.equal(onSeen({ status: "dismissed", verifiedAt: null, occurrence: 1 }, NOW).action, "keep");
});

test("a verified item is reopened only when the live check shows a regression, never because search data still shows the old symptom", () => {
  assert.deepEqual(onSeen({ status: "verified", verifiedAt: days(40), occurrence: 1 }, NOW, false), { action: "reopen", status: "new", occurrence: 2 });
  assert.equal(onSeen({ status: "verified", verifiedAt: days(40), occurrence: 1 }, NOW, true).action, "keep");
  assert.equal(onSeen({ status: "verified", verifiedAt: days(400), occurrence: 1 }, NOW, null).action, "keep");
  assert.equal(onSeen({ status: "verified", verifiedAt: days(5), occurrence: 1 }, NOW).action, "keep");
});

test("opening only moves NEW to OPENED; it never starts work or touches later statuses", () => {
  assert.equal(afterOpen("new"), "opened");
  for (const s of ["opened", "in_progress", "completed", "verified", "dismissed"] as const) assert.equal(afterOpen(s), s);
});

test("owner transitions are limited, and verified is not reachable by hand", () => {
  assert.ok(canTransition("new", "in_progress") && canTransition("opened", "completed") && canTransition("in_progress", "dismissed") && canTransition("dismissed", "new"));
  assert.ok(!canTransition("new", "verified") && !canTransition("completed", "verified") && !canTransition("verified", "in_progress"));
});

test("the Friday email promotes an unfinished item as NEW once", () => {
  const base = { status: "new" as const, occurrence: 1, firstEmailedAt: null, verifiedNotifiedAt: null, lastSeenAt: days(1) };
  assert.equal(emailBucket(base, NOW), "NEW");
  assert.equal(emailBucket({ ...base, firstEmailedAt: days(7) }, NOW), "STILL_UNOPENED");
  assert.equal(emailBucket({ ...base, status: "opened", firstEmailedAt: days(7) }, NOW), "OPENED");
  assert.equal(emailBucket({ ...base, status: "in_progress" }, NOW), "IN_PROGRESS");
  assert.equal(emailBucket({ ...base, status: "completed" }, NOW), "COMPLETED_AWAITING");
  assert.equal(emailBucket({ ...base, status: "verified" }, NOW), "VERIFIED");
  assert.equal(emailBucket({ ...base, status: "verified", verifiedNotifiedAt: days(1) }, NOW), null);
  assert.equal(emailBucket({ ...base, status: "dismissed" }, NOW), null);
  assert.equal(emailBucket({ ...base, occurrence: 2 }, NOW), "REOPENED");
  assert.equal(emailBucket({ ...base, lastSeenAt: days(40) }, NOW), null);
});

const snap = (over: Partial<ReturnType<typeof snapshotFromHtml>> = {}) => ({ ...snapshotFromHtml("https://x.com/p", 200, "<title>Old title</title><meta name='description' content='Old desc'><main><h1>a</h1><p>one two three</p></main>", null, NOW.toISOString()), ...over });

test("snapshots read title, description, robots, canonical and h1 count", () => {
  const s = snapshotFromHtml("https://x.com/p", 200, "<head><title>T</title><meta name=\"robots\" content=\"noindex,follow\"><link rel=\"canonical\" href=\"https://x.com/p\"><meta property=\"og:image\" content=\"https://x.com/i.png\"></head><main><h1>a</h1><h1>b</h1></main>", null, NOW.toISOString());
  assert.deepEqual([s.title, s.robots, s.canonical, s.h1s, s.ogImage, s.indexable], ["T", "noindex,follow", "https://x.com/p", 2, true, false]);
});

test("a title or description edit counts as a deployed low-CTR change; an untouched page does not", () => {
  const before = [snap()];
  const edited = evaluateVerification("low_ctr", "low_ctr", before, [snap({ title: "Better title" })], NOW);
  assert.equal(edited.deployed, true);
  assert.equal(edited.level, "change_observed");
  assert.equal(evaluateVerification("low_ctr", "low_ctr", before, [snap()], NOW).deployed, false);
});

test("an indexing fix is verified only when the live page is indexable with a self canonical", () => {
  const before = [snap({ robots: "noindex", indexable: false })];
  assert.equal(evaluateVerification("indexing", "indexing", before, [snap({ robots: "", indexable: true, canonical: "https://www.x.com/p/" })], NOW).deployed, true);
  assert.equal(evaluateVerification("indexing", "indexing", before, [snap({ robots: "noindex", indexable: false })], NOW).deployed, false);
  assert.equal(evaluateVerification("indexing", "indexing", before, [snap({ indexable: true, canonical: "https://x.com/other" })], NOW).deployed, false);
});

test("specific defects are re-checked on the live page", () => {
  assert.equal(evaluateVerification("confirmed_problem", "ctr:no_social_image", [snap()], [snap({ ogImage: true })], NOW).level, "defect_cleared");
  assert.equal(evaluateVerification("confirmed_problem", "technical:multiple_h1", [snap({ h1s: 2 })], [snap({ h1s: 1 })], NOW).deployed, true);
  assert.equal(evaluateVerification("confirmed_problem", "technical:multiple_h1", [snap({ h1s: 2 })], [snap({ h1s: 2 })], NOW).deployed, false);
});

test("unreachable pages are never a pass", () => {
  const r = evaluateVerification("indexing", "indexing", [snap()], [snap({ status: null, indexable: false })], NOW);
  assert.equal(r.deployed, null);
});

test("outcome windows are 28 days before and after completion and are only ready once Search Console has them", () => {
  const w = outcomeWindows(new Date("2026-11-01T10:00:00Z"), NOW);
  assert.deepEqual(w.before, { start: "2026-10-04", end: "2026-10-31" });
  assert.deepEqual(w.after, { start: "2026-11-01", end: "2026-11-28" });
  assert.equal(w.ready, true);
  assert.equal(outcomeWindows(new Date("2026-11-20T10:00:00Z"), NOW).ready, false);
});

test("outcome never claims a result too early, on small numbers, and always says it is not proof of cause", () => {
  assert.equal(classifyOutcome({ clicks: 10, impressions: 500 }, { clicks: 30, impressions: 900 }, false, NOW).verdict, "too_early");
  assert.equal(classifyOutcome({ clicks: 1, impressions: 20 }, { clicks: 3, impressions: 30 }, true, NOW).verdict, "low_sample");
  const up = classifyOutcome({ clicks: 10, impressions: 500 }, { clicks: 30, impressions: 900 }, true, NOW);
  assert.equal(up.verdict, "improved");
  assert.match(up.note, /not proof the work caused it/);
  assert.equal(classifyOutcome({ clicks: 30, impressions: 900 }, { clicks: 10, impressions: 500 }, true, NOW).verdict, "declined");
  assert.equal(classifyOutcome({ clicks: 30, impressions: 900 }, { clicks: 31, impressions: 900 }, true, NOW).verdict, "no_material_change");
});

/* ───────────── v3: recognising completed work ───────────── */
import { implementationEvidence, sameWork, targetQueriesOf } from "../recommendation-model";

const snap3 = (url: string, over: Partial<ReturnType<typeof snapshotFromHtml>> = {}) => ({ ...snapshotFromHtml(url, 200, "<title>Old</title><main><h2>a</h2><p>words here</p></main>", null, "2026-11-27T00:00:00Z"), words: 1000, ...over });

test("a rewritten title on the live site completes title work, whoever deployed it", () => {
  const u = "https://rentalnoodle.com/resources/packing";
  const ev = implementationEvidence({ kind: "low_ctr" }, [snap3(u)], [snap3(u, { title: "New, clearer title" })], []);
  assert.equal(ev?.implemented, true);
  assert.equal(implementationEvidence({ kind: "low_ctr" }, [snap3(u)], [snap3(u)], [])?.implemented, false);
});

test("a page that now serves missing searches completes the demand item; a non-indexable page does not", () => {
  const ok = implementationEvidence({ kind: "new_demand" }, [], [], [{ url: "https://rentalnoodle.com/tools/roi-calculator", covered: true, by: "title covers", indexable: true }]);
  assert.equal(ok?.implemented, true);
  const hidden = implementationEvidence({ kind: "new_demand" }, [], [], [{ url: "https://x.com/p", covered: true, by: "title covers", indexable: false }]);
  assert.equal(hidden?.implemented, false);
});

test("a page improved since it was first reported completes ranking work; an unchanged page does not; indexing is never auto-completed", () => {
  const u = "https://gravyblock.com/guides/google-3-pack";
  assert.equal(implementationEvidence({ kind: "topic_ranking" }, [snap3(u, { h2s: 8 })], [snap3(u, { h2s: 9, words: 1250 })], [])?.implemented, true);
  assert.equal(implementationEvidence({ kind: "topic_ranking" }, [snap3(u)], [snap3(u)], [])?.implemented, false);
  assert.equal(implementationEvidence({ kind: "indexing" }, [snap3(u)], [snap3(u)], []), null);
});

test("the same work under a shifted label is recognised; different work is not", () => {
  const a = { kind: "topic_ranking", issue: "topic_ranking:google pack", urls: ["https://gravyblock.com/guides/google-3-pack"], title: 'Build real depth for "google 3 pack"' };
  const b = { kind: "topic_ranking", issue: "topic_ranking:3 pack", urls: ["https://gravyblock.com/guides/google-3-pack/"], title: 'Move "3 pack google" toward the top 3' };
  assert.equal(sameWork(a, b), true);
  const c = { kind: "new_demand", issue: "new_demand:property rental", urls: [], title: 'Capture "rental property calculator roi" searches', targetQueries: ["rental property calculator roi", "rental property roi calculator"] };
  const d = { kind: "new_demand", issue: "new_demand:calculator roi", urls: [], title: 'Capture "roi calculator rental property" searches' };
  const e = { kind: "new_demand", issue: "new_demand:screen tenant", urls: [], title: 'Capture "how to screen tenants" searches' };
  assert.equal(sameWork(c, d), true);
  assert.equal(sameWork(c, e), false);
  assert.equal(sameWork(a, e), false);
});

test("target searches are read from older records that predate the targetQueries field", () => {
  assert.deepEqual(targetQueriesOf({ title: 'Capture "my business isn\'t showing up on google" searches', evidence: ['People type these: "my business isn\'t showing up on google", "business not showing on google maps".'] }), ["my business isn't showing up on google", "business not showing on google maps"]);
});

test("visibility work on a page that already answered the search is done only when that page changes, not because it still covers the search", () => {
  const u = "https://hourlantern.com/docs/billable-hours";
  const covered = [{ url: u, covered: true, by: "title covers", indexable: true }];
  const rec = { kind: "new_demand", demandMode: "existing_covers", title: 'Get /docs/billable-hours found for "billable hours tracker"' };
  assert.equal(implementationEvidence(rec, [snap3(u)], [snap3(u)], covered)?.implemented, false);
  assert.equal(implementationEvidence(rec, [snap3(u)], [snap3(u, { title: "Billable hours tracker for freelancers" })], covered)?.implemented, true);
  assert.equal(implementationEvidence({ kind: "new_demand", title: 'Get /docs/billable-hours found for "x"' }, [snap3(u)], [snap3(u)], covered)?.implemented, false);
});

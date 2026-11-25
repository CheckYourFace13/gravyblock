import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, type Daily } from "@/lib/case-studies/model";
import { compareWindows, dataStatus, endDayFor, joinWindows, lowCtrPairs, movers, rankingBands, seasonality, changesSince } from "../analysis";

const daily = (end: string, n: number, f: (i: number) => { c: number; i: number }): Daily[] =>
  Array.from({ length: n }, (_, k) => {
    const i = n - 1 - k;
    const v = f(i);
    return { day: addDays(end, -i), clicks: v.c, impressions: v.i, position: 8 };
  });

test("windows end three days before today and never overlap", () => {
  const end = endDayFor("2026-11-25");
  assert.equal(end, "2026-11-22");
  const d = daily(end, 60, () => ({ c: 1, i: 10 }));
  const w7 = compareWindows(d, end, 7);
  assert.equal(w7.cur.start, "2026-11-16");
  assert.equal(w7.prev.end, "2026-11-15");
  assert.equal(w7.cur.clicks, 7);
  assert.equal(w7.prev.clicks, 7);
  const w28 = compareWindows(d, end, 28);
  assert.equal(w28.cur.days, 28);
  assert.equal(w28.prev.end, addDays(w28.cur.start, -1));
});

test("a quiet site is flagged low-sample and an empty one missing, never a trend", () => {
  const end = "2026-11-22";
  assert.equal(compareWindows(daily(end, 60, () => ({ c: 0, i: 2 })), end, 28).sample, "low");
  assert.equal(compareWindows([], end, 28).sample, "missing");
  assert.equal(compareWindows(daily(end, 60, () => ({ c: 5, i: 100 })), end, 28).sample, "ok");
});

test("data status separates delayed from missing", () => {
  assert.equal(dataStatus([], "2026-11-25").status, "missing");
  assert.equal(dataStatus(daily("2026-11-10", 60, () => ({ c: 1, i: 5 })), "2026-11-25").status, "delayed");
  assert.equal(dataStatus(daily("2026-11-22", 60, () => ({ c: 1, i: 5 })), "2026-11-25").status, "ok");
});

test("movers: rising and declining need enough impressions and move in the stated direction", () => {
  const cur = [{ key: "a", clicks: 10, impressions: 100, position: 5 }, { key: "b", clicks: 0, impressions: 50, position: 9 }, { key: "tiny", clicks: 1, impressions: 2, position: 3 }];
  const prev = [{ key: "a", clicks: 2, impressions: 60, position: 7 }, { key: "b", clicks: 6, impressions: 90, position: 6 }, { key: "tiny", clicks: 0, impressions: 1, position: 4 }];
  const m = movers(joinWindows(cur, prev), { minImpr: 20, max: 5 });
  assert.deepEqual(m.rising.map((x) => x.key), ["a"]);
  assert.deepEqual(m.declining.map((x) => x.key), ["b"]);
});

test("bands split queries by position and rank by audience", () => {
  const rows = [
    { page: "/a", query: "q1", clicks: 1, impressions: 100, position: 6 },
    { page: "/b", query: "q2", clicks: 0, impressions: 300, position: 15 },
    { page: "/c", query: "q3", clicks: 0, impressions: 80, position: 33 },
    { page: "/d", query: "q4", clicks: 9, impressions: 90, position: 2 },
  ];
  const b = rankingBands(rows);
  assert.deepEqual([b.b4_10.map((r) => r.query), b.b11_20.map((r) => r.query), b.b21_40.map((r) => r.query)], [["q1"], ["q2"], ["q3"]]);
});

test("low CTR only where the ranking is good enough for a better title to plausibly help", () => {
  const rows = [
    { page: "/a", query: "q", clicks: 1, impressions: 400, position: 3 },
    { page: "/b", query: "q", clicks: 0, impressions: 400, position: 45 },
    { page: "/c", query: "q", clicks: 40, impressions: 400, position: 3 },
  ];
  const l = lowCtrPairs(rows);
  assert.deepEqual(l.map((x) => x.page), ["/a"]);
  assert.ok(l[0]!.clicksMissing > 30);
});

test("seasonality makes no claim without a year of history", () => {
  const end = "2026-11-22";
  assert.equal(seasonality(daily(end, 100, () => ({ c: 1, i: 5 })), end).sameWeeksLastYear, null);
  const year = daily(end, 400, () => ({ c: 1, i: 5 }));
  assert.equal(seasonality(year, end).sameWeeksLastYear, 28);
});

test("first report is labelled a baseline", () => {
  const cur = { w28: compareWindows(daily("2026-11-22", 60, () => ({ c: 5, i: 100 })), "2026-11-22", 28), bands: { b4_10: [] } };
  assert.match(changesSince(null, cur)[0]!, /First report/);
  assert.match(changesSince({ w28: cur.w28, bands: { b4_10: [] } }, cur)[0]!, /since the last report/);
});

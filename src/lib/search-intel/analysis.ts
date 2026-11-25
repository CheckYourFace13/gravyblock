/**
 * Weekly search analysis: pure functions over rows already read from Search Console (read only). Nothing here touches a database or a site.
 *
 * Window rules (never overlapping, so nothing is double counted): every window ends on `endDay`, the latest day Search Console has complete data for
 * (three days behind today). 7-day: endDay-6..endDay against endDay-13..endDay-7. 28-day: endDay-27..endDay against endDay-55..endDay-28.
 * These are Google search clicks and impressions only, never total website visitors.
 */
import { addDays, type Daily } from "@/lib/case-studies/model";

export type Totals = { clicks: number; impressions: number; ctr: number | null; position: number | null; days: number; daysWithData: number; start: string; end: string };
export type Compare = { cur: Totals; prev: Totals; clicksChange: number; impressionsChange: number; sample: "ok" | "low" | "missing" };

export const DAY_LAG = 3;
export const endDayFor = (today: string): string => addDays(today, -DAY_LAG);

export function totalsFor(daily: Daily[], start: string, end: string): Totals {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  let daysWithData = 0;
  for (const d of daily) {
    if (d.day < start || d.day > end) continue;
    daysWithData++;
    clicks += d.clicks;
    impressions += d.impressions;
    weighted += d.position * d.impressions;
  }
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
  return { clicks, impressions, ctr: impressions ? Number((clicks / impressions).toFixed(4)) : null, position: impressions ? Number((weighted / impressions).toFixed(1)) : null, days, daysWithData, start, end };
}

/** "missing": the window has no days of data; "low": too few events to read a trend from (a handful of clicks is noise). */
export function compareWindows(daily: Daily[], endDay: string, length: 7 | 28): Compare {
  const cur = totalsFor(daily, addDays(endDay, -(length - 1)), endDay);
  const prev = totalsFor(daily, addDays(endDay, -(2 * length - 1)), addDays(endDay, -length));
  const missing = cur.daysWithData === 0 || prev.daysWithData === 0;
  const low = cur.clicks + prev.clicks < (length === 7 ? 10 : 20) && cur.impressions + prev.impressions < (length === 7 ? 200 : 500);
  return { cur, prev, clicksChange: cur.clicks - prev.clicks, impressionsChange: cur.impressions - prev.impressions, sample: missing ? "missing" : low ? "low" : "ok" };
}

export type DataStatus = { status: "ok" | "delayed" | "missing"; latestDay: string | null; notes: string[] };

export function dataStatus(daily: Daily[], today: string): DataStatus {
  const latestDay = daily.length ? daily.reduce((m, d) => (d.day > m ? d.day : m), daily[0]!.day) : null;
  const notes: string[] = [];
  if (!latestDay) return { status: "missing", latestDay, notes: ["No Search Console history is stored for this site."] };
  const endDay = endDayFor(today);
  if (latestDay < endDay) {
    notes.push(`Search Console data is delayed: the newest stored day is ${latestDay}, the report window ends ${endDay}.`);
    return { status: "delayed", latestDay, notes };
  }
  const have = daily.filter((d) => d.day >= addDays(endDay, -55) && d.day <= endDay).length;
  if (have < 40) notes.push(`Only ${have} of the last 56 days have data (days with no impressions are absent), so comparisons may rest on sparse days.`);
  return { status: "ok", latestDay, notes };
}

export type Row = { page: string; query: string; clicks: number; impressions: number; position: number };
export type QueryRow = { key: string; clicks: number; impressions: number; position: number };

export type Move = { key: string; clicksCur: number; clicksPrev: number; imprCur: number; imprPrev: number; posCur: number | null; posPrev: number | null };

/** Join the same key across two windows. Rows missing from a window count as zero there (it earned no impressions). */
export function joinWindows(cur: QueryRow[], prev: QueryRow[]): Move[] {
  const m = new Map<string, Move>();
  for (const r of cur) m.set(r.key, { key: r.key, clicksCur: r.clicks, clicksPrev: 0, imprCur: r.impressions, imprPrev: 0, posCur: r.position, posPrev: null });
  for (const r of prev) {
    const e = m.get(r.key) ?? { key: r.key, clicksCur: 0, clicksPrev: 0, imprCur: 0, imprPrev: 0, posCur: null, posPrev: null };
    e.clicksPrev = r.clicks;
    e.imprPrev = r.impressions;
    e.posPrev = r.position;
    m.set(r.key, e);
  }
  return [...m.values()];
}

/**
 * Rising and declining keys. Ranked by click change, then impression change; a key needs at least `minImpr` impressions in one of the windows so a lone
 * impression never makes a trend. The result is capped, and each side keeps only keys that really moved in that direction.
 */
export function movers(moves: Move[], opts: { minImpr: number; max: number }): { rising: Move[]; declining: Move[] } {
  const ok = moves.filter((m) => Math.max(m.imprCur, m.imprPrev) >= opts.minImpr);
  const score = (m: Move) => (m.clicksCur - m.clicksPrev) * 1000 + (m.imprCur - m.imprPrev);
  const rising = ok.filter((m) => m.clicksCur > m.clicksPrev || (m.clicksCur === m.clicksPrev && m.imprCur > m.imprPrev)).sort((a, b) => score(b) - score(a)).slice(0, opts.max);
  const declining = ok.filter((m) => m.clicksCur < m.clicksPrev || (m.clicksCur === m.clicksPrev && m.imprCur < m.imprPrev)).sort((a, b) => score(a) - score(b)).slice(0, opts.max);
  return { rising, declining };
}

export function expectedCtr(position: number): number {
  const table = [0, 0.3, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
  const p = Math.max(1, Math.round(position));
  if (p <= 10) return table[p]!;
  if (p <= 20) return 0.01;
  if (p <= 30) return 0.005;
  return 0.002;
}

export type BandRow = { query: string; page: string; position: number; impressions: number; clicks: number };

/** Queries in each ranking band, taking the page that ranks best for each query, biggest audience first. Positions are impression-weighted across the rows. */
export function rankingBands(rows: Row[], minImpr = 10): { b4_10: BandRow[]; b11_20: BandRow[]; b21_40: BandRow[] } {
  const byQuery = new Map<string, { clicks: number; impressions: number; weighted: number; best: Row }>();
  for (const r of rows) {
    const e = byQuery.get(r.query) ?? { clicks: 0, impressions: 0, weighted: 0, best: r };
    e.clicks += r.clicks;
    e.impressions += r.impressions;
    e.weighted += r.position * r.impressions;
    if (r.impressions > e.best.impressions) e.best = r;
    byQuery.set(r.query, e);
  }
  const all: BandRow[] = [...byQuery.entries()]
    .filter(([, e]) => e.impressions >= minImpr)
    .map(([query, e]) => ({ query, page: e.best.page, position: Number((e.weighted / e.impressions).toFixed(1)), impressions: e.impressions, clicks: e.clicks }));
  const pick = (lo: number, hi: number) => all.filter((r) => r.position >= lo && r.position < hi).sort((a, b) => b.impressions - a.impressions).slice(0, 8);
  return { b4_10: pick(4, 10.5), b11_20: pick(10.5, 20.5), b21_40: pick(20.5, 40.5) };
}

export type LowCtr = { page: string; query: string; position: number; impressions: number; ctr: number; expected: number; clicksMissing: number };

/** High-impression, low-CTR pairs where the ranking is good enough that a better title or description plausibly lifts clicks (position at most 10, CTR under 60% of normal). */
export function lowCtrPairs(rows: Row[], minImpr = 50): LowCtr[] {
  return rows
    .filter((r) => r.impressions >= minImpr && r.position >= 1 && r.position <= 10)
    .map((r) => ({ page: r.page, query: r.query, position: Number(r.position.toFixed(1)), impressions: r.impressions, ctr: r.impressions ? r.clicks / r.impressions : 0, expected: expectedCtr(r.position), clicksMissing: 0 }))
    .filter((r) => r.ctr < 0.6 * r.expected)
    .map((r) => ({ ...r, clicksMissing: Math.max(0, Math.round(r.impressions * (r.expected - r.ctr))) }))
    .sort((a, b) => b.clicksMissing - a.clicksMissing)
    .slice(0, 8);
}

export type Seasonal = { cur28: number; sameWeeksLastYear: number | null; note: string };

/** Same 28 days a year earlier, when that much history exists. Without it the report says so and makes no seasonal claim. */
export function seasonality(daily: Daily[], endDay: string): Seasonal {
  const cur = totalsFor(daily, addDays(endDay, -27), endDay);
  const lyEnd = addDays(endDay, -364);
  const ly = totalsFor(daily, addDays(lyEnd, -27), lyEnd);
  if (ly.daysWithData < 14) return { cur28: cur.clicks, sameWeeksLastYear: null, note: "Not enough history to compare with the same weeks last year, so no seasonal claim is made." };
  const delta = ly.clicks === 0 ? null : Math.round(((cur.clicks - ly.clicks) / ly.clicks) * 100);
  return { cur28: cur.clicks, sameWeeksLastYear: ly.clicks, note: `Same 28 days last year: ${ly.clicks} clicks (${delta === null ? "no baseline" : `${delta >= 0 ? "+" : ""}${delta}% year over year`}).` };
}

/** What differs from the previous weekly report, in plain sentences, only from numbers both reports hold. */
export function changesSince(prev: { w28?: Compare | null; bands?: { b4_10?: BandRow[] } | null } | null, cur: { w28: Compare; bands: { b4_10: BandRow[] } }): string[] {
  if (!prev?.w28) return ["First report for this site: no earlier report to compare with, so everything here is a baseline."];
  const out: string[] = [];
  const dc = cur.w28.cur.clicks - prev.w28.cur.clicks;
  const di = cur.w28.cur.impressions - prev.w28.cur.impressions;
  out.push(`28-day clicks ${prev.w28.cur.clicks} to ${cur.w28.cur.clicks} (${dc >= 0 ? "+" : ""}${dc}), impressions ${prev.w28.cur.impressions} to ${cur.w28.cur.impressions} (${di >= 0 ? "+" : ""}${di}) since the last report.`);
  const before = new Set((prev.bands?.b4_10 ?? []).map((b) => b.query));
  const entered = cur.bands.b4_10.filter((b) => !before.has(b.query)).map((b) => `"${b.query}"`).slice(0, 5);
  if (prev.bands?.b4_10) out.push(entered.length ? `Queries newly in positions 4 to 10: ${entered.join(", ")}.` : "No query newly entered positions 4 to 10.");
  return out;
}

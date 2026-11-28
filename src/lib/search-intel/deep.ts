/**
 * Deeper search analysis, pure functions only (tested). Every function works on rows from ONE stated window; callers label the window.
 * Nothing here estimates search volume or competitor traffic: suggestions from public autocomplete prove that people type a phrase, not how often.
 */
import { addDays, type Daily } from "@/lib/case-studies/model";
import { totalsFor, type Totals, type QueryRow } from "./analysis";

export type QP = { query: string; page: string; clicks: number; impressions: number; position: number };

const STOP = new Set("the a an of to for in on at and or with from your you my our me near best top how what why when where which who is are can does do vs i it this that".split(" "));
export const stem = (w: string) => w.toLowerCase().replace(/(ing|ies|es|s)$/, "");
export const tokensOf = (q: string): string[] => [...new Set(q.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter((t) => t.length >= 3 && !STOP.has(t)).map(stem))];

/** Branded = the query contains the whole brand name or the domain label (one shared word is not enough). */
export function brandTokens(name: string, website: string | null): string[] {
  const label = (() => {
    try {
      return website ? new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, "").split(".")[0]! : "";
    } catch {
      return "";
    }
  })();
  return [name.toLowerCase().replace(/[^a-z0-9]/g, ""), label.toLowerCase()].filter((x) => x.length >= 4);
}
export const isBranded = (query: string, brand: string[]): boolean => {
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  return brand.some((b) => q.includes(b));
};

export type Intent = "local" | "transactional" | "informational" | "navigational";
export function intentOf(query: string, brand: string[] = []): Intent {
  const q = query.toLowerCase();
  if (brand.length && isBranded(q, brand)) return "navigational";
  if (/\bnear me\b|\bnearby\b|\btonight\b|\bopen now\b|\bhours\b|\btoday\b/.test(q)) return "local";
  if (/\b(buy|price|prices|pricing|cost|book|booking|rent|rental|hire|deal|deals|coupon|software|app|tool|sign up|signup|free trial|order|tickets?)\b/.test(q)) return "transactional";
  if (/\b(how|what|why|when|recipe|guide|ideas|list|best|vs|map|rules|tips|history|meaning)\b/.test(q)) return "informational";
  return "informational";
}

export type Cluster = { key: string; label: string; queries: string[]; clicks: number; impressions: number; position: number; ctr: number; pages: string[]; intent: Intent; branded: boolean };

/** Groups queries that share their two most frequent meaningful words (stems), so the report talks about topics, not hundreds of single queries. */
export function clusterQueries(rows: QP[], brand: string[], max = 10): Cluster[] {
  const byQuery = new Map<string, { clicks: number; impressions: number; weighted: number; pages: Map<string, number> }>();
  for (const r of rows) {
    const e = byQuery.get(r.query) ?? { clicks: 0, impressions: 0, weighted: 0, pages: new Map<string, number>() };
    e.clicks += r.clicks;
    e.impressions += r.impressions;
    e.weighted += r.position * r.impressions;
    e.pages.set(r.page, (e.pages.get(r.page) ?? 0) + r.impressions);
    byQuery.set(r.query, e);
  }
  const freq = new Map<string, number>();
  for (const [q, e] of byQuery) for (const t of tokensOf(q)) freq.set(t, (freq.get(t) ?? 0) + e.impressions);
  const clusters = new Map<string, { qs: Array<[string, typeof byQuery extends Map<string, infer V> ? V : never]> }>();
  for (const [q, e] of byQuery) {
    const toks = tokensOf(q).filter((t) => !brand.some((b) => b.includes(t))).sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0)).slice(0, 2).sort();
    const key = toks.length ? toks.join(" ") : q.toLowerCase();
    (clusters.get(key) ?? clusters.set(key, { qs: [] }).get(key)!).qs.push([q, e]);
  }
  return [...clusters.entries()]
    .map(([key, c]) => {
      const clicks = c.qs.reduce((s, [, e]) => s + e.clicks, 0);
      const impressions = c.qs.reduce((s, [, e]) => s + e.impressions, 0);
      const weighted = c.qs.reduce((s, [, e]) => s + e.weighted, 0);
      const pages = new Map<string, number>();
      for (const [, e] of c.qs) for (const [p, i] of e.pages) pages.set(p, (pages.get(p) ?? 0) + i);
      const top = c.qs.sort((a, b) => b[1].impressions - a[1].impressions);
      return {
        key,
        label: top[0]![0],
        queries: top.slice(0, 6).map(([q]) => q),
        clicks,
        impressions,
        position: impressions ? Number((weighted / impressions).toFixed(1)) : 0,
        ctr: impressions ? clicks / impressions : 0,
        pages: [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p]) => p),
        intent: intentOf(top[0]![0], brand),
        branded: top.every(([q]) => isBranded(q, brand)),
      };
    })
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, max);
}

/** Queries with impressions now and none in the previous window of the same length. */
export function emergingQueries(cur: QueryRow[], prev: QueryRow[], minImpr = 10, max = 8): QueryRow[] {
  const before = new Set(prev.filter((r) => r.impressions > 0).map((r) => r.key));
  return cur.filter((r) => !before.has(r.key) && r.impressions >= minImpr).sort((a, b) => b.impressions - a.impressions).slice(0, max);
}

/** One query, several of our pages each taking a real share of impressions: Google is unsure which page to rank. */
export function cannibalization(rows: QP[], minImpr = 50, minShare = 0.2, max = 5): Array<{ query: string; impressions: number; pages: Array<{ page: string; impressions: number; position: number }> }> {
  const byQ = new Map<string, QP[]>();
  for (const r of rows) (byQ.get(r.query) ?? byQ.set(r.query, []).get(r.query)!).push(r);
  const out: Array<{ query: string; impressions: number; pages: Array<{ page: string; impressions: number; position: number }> }> = [];
  for (const [query, list] of byQ) {
    const total = list.reduce((s, r) => s + r.impressions, 0);
    if (total < minImpr) continue;
    const big = list.filter((r) => r.impressions / total >= minShare);
    if (big.length >= 2) out.push({ query, impressions: total, pages: big.sort((a, b) => b.impressions - a.impressions).map((r) => ({ page: r.page, impressions: r.impressions, position: Number(r.position.toFixed(1)) })) });
  }
  return out.sort((a, b) => b.impressions - a.impressions).slice(0, max);
}

export const sectionOf = (u: string): string => {
  try {
    const seg = new URL(u).pathname.split("/").filter(Boolean)[0];
    return seg ? `/${seg}` : "/";
  } catch {
    return "?";
  }
};

export type SectionStat = { section: string; pages: number; clicks: number; impressions: number; ctr: number; clicksPrev: number; impressionsPrev: number; pagesPrev: number };
/** Template-level view: the same section across many pages, so a systemic problem shows as one finding instead of many single-page tasks. */
export function sectionStats(cur: QueryRow[], prev: QueryRow[], max = 8): SectionStat[] {
  const m = new Map<string, SectionStat>();
  const get = (s: string) => m.get(s) ?? m.set(s, { section: s, pages: 0, clicks: 0, impressions: 0, ctr: 0, clicksPrev: 0, impressionsPrev: 0, pagesPrev: 0 }).get(s)!;
  for (const r of cur) { const s = get(sectionOf(r.key)); s.pages++; s.clicks += r.clicks; s.impressions += r.impressions; }
  for (const r of prev) { const s = get(sectionOf(r.key)); s.pagesPrev++; s.clicksPrev += r.clicks; s.impressionsPrev += r.impressions; }
  return [...m.values()].map((s) => ({ ...s, ctr: s.impressions ? s.clicks / s.impressions : 0 })).sort((a, b) => b.impressions + b.impressionsPrev - (a.impressions + a.impressionsPrev)).slice(0, max);
}

export type Split = { key: string; clicks: number; impressions: number; ctr: number; position: number };
export const toSplit = (rows: Array<{ keys?: string[]; clicks?: number; impressions?: number; position?: number }>): Split[] =>
  rows.filter((r) => r.keys?.[0]).map((r) => ({ key: r.keys![0]!, clicks: Math.round(r.clicks ?? 0), impressions: Math.round(r.impressions ?? 0), ctr: r.impressions ? (r.clicks ?? 0) / r.impressions : 0, position: Number((r.position ?? 0).toFixed(1)) }));

/** Mobile clicked far less than desktop at similar positions, with enough data on both: a mobile presentation problem, not a ranking one. */
export function mobileGap(devices: Split[]): { mobileCtr: number; desktopCtr: number; mobileImpr: number } | null {
  const m = devices.find((d) => d.key === "MOBILE");
  const d = devices.find((x) => x.key === "DESKTOP");
  if (!m || !d || m.impressions < 300 || d.impressions < 100 || m.clicks + d.clicks < 20) return null;
  if (Math.abs(m.position - d.position) > 3) return null;
  return m.ctr < d.ctr * 0.6 ? { mobileCtr: m.ctr, desktopCtr: d.ctr, mobileImpr: m.impressions } : null;
}

export function brandSplit(rows: QueryRow[], brand: string[]): { brandedClicks: number; brandedImpressions: number; nonBrandedClicks: number; nonBrandedImpressions: number } {
  const o = { brandedClicks: 0, brandedImpressions: 0, nonBrandedClicks: 0, nonBrandedImpressions: 0 };
  for (const r of rows) {
    if (isBranded(r.key, brand)) { o.brandedClicks += r.clicks; o.brandedImpressions += r.impressions; }
    else { o.nonBrandedClicks += r.clicks; o.nonBrandedImpressions += r.impressions; }
  }
  return o;
}

/** 90 days against the 90 before, only when enough history exists; otherwise null and the report says so. */
export function trend90(daily: Daily[], endDay: string): { cur: Totals; prev: Totals } | null {
  const cur = totalsFor(daily, addDays(endDay, -89), endDay);
  const prev = totalsFor(daily, addDays(endDay, -179), addDays(endDay, -90));
  return prev.daysWithData >= 60 && cur.daysWithData >= 60 ? { cur, prev } : null;
}

/** Words too broad to make a search relevant on their own ("google mesh wifi 3 pack" is not a local SEO search just because it says google). */
const GENERIC = new Set(["google", "business", "local", "drink", "menu", "open", "map", "health", "list", "design", "event", "venue", "property", "management", "marketing", "app", "software", "lake", "history", "story", "music", "players", "cases"].map(stem));

/** A search is on topic when it uses two topic words, or half its words are topic words, or one specific (not generic) topic word. */
export function onTopic(query: string, topicWords: string[]): boolean {
  const topic = new Set(topicWords.flatMap((w) => w.split("-")).map(stem));
  const t = tokensOf(query);
  const hits = t.filter((w) => topic.has(w));
  return hits.length >= 2 || (t.length > 0 && hits.length / t.length >= 0.5) || hits.some((w) => !GENERIC.has(w));
}

/** Autocomplete suggestions the site never appears for: no current query shares most of its meaningful words. */
export function uncaptured(suggestions: string[], siteQueries: string[], topicWords: string[]): string[] {
  const covered = siteQueries.map(tokensOf);
  // "near me" searches are a different (local, right-now) intent: covering "happy hour chicago" does not mean the site is found for "happy hour near me"
  const siteHasNearMe = siteQueries.some((q) => /\bnear me\b/i.test(q));
  const out: string[] = [];
  for (const s of [...new Set(suggestions.map((x) => x.toLowerCase().trim()))]) {
    const t = tokensOf(s);
    if (t.length < 2 || !onTopic(s, topicWords)) continue; // off-topic suggestions are not opportunities
    const best = Math.max(0, ...covered.map((c) => t.filter((w) => c.includes(w)).length / t.length));
    if (best < 0.6 || (/\bnear me\b/.test(s) && !siteHasNearMe)) out.push(s);
  }
  return out;
}

/** A competitor is relevant only if its own pages cover the site's topic; brand fame alone never qualifies. */
export function competitorRelevance(urls: string[], topicWords: string[]): { relevant: boolean; matches: number; share: number } {
  const topic = topicWords.map((w) => w.toLowerCase());
  let matches = 0;
  const distinct = new Set<string>();
  for (const u of urls) {
    let p = "";
    try { p = new URL(u).pathname.toLowerCase(); } catch { continue; }
    const hit = topic.filter((w) => new RegExp(`(^|[/_-])${w.replace(/[^a-z0-9-]/g, "")}([/_.-]|s?$|s?[/_.-])`).test(p));
    if (hit.length) { matches++; hit.forEach((h) => distinct.add(h)); }
  }
  const share = urls.length ? matches / urls.length : 0;
  // several different topic words must appear, so one ambiguous word (a coffee chain's "espresso bar") cannot qualify a site
  return { relevant: matches >= 5 && distinct.size >= 2 && (share >= 0.05 || matches >= 25), matches, share: Number(share.toFixed(3)) };
}

/* ───────────── v3: demand strength, seasonal look-ahead, template losses, 90-day movement ───────────── */

export type DemandStrength = { score: number; level: "strong" | "moderate" | "weak"; signals: string[] };

/**
 * How strong the evidence is that a search matters, from observable signals only (no search volume exists for free, so none is claimed).
 * 0 to 5: suggested by both autocomplete engines, many distinct phrasings, competitors publishing pages for it, related impressions the site already earns,
 * an approaching season, and an intent close to the site's conversion.
 */
export function demandStrength(g: { variants: number; sources: string[]; competitorPages: number; relatedImpressions: number; seasonalSoon: boolean; intent: Intent }): DemandStrength {
  let score = 0;
  const signals: string[] = [];
  const both = g.sources.length >= 2;
  score += both ? 1.5 : g.sources.length ? 0.75 : 0;
  signals.push(both ? `suggested by both ${g.sources.join(" and ")}` : g.sources.length ? `suggested by ${g.sources[0]}` : "no autocomplete source");
  if (g.variants >= 4) { score += 1; signals.push(`${g.variants} different phrasings`); }
  else if (g.variants >= 2) { score += 0.5; signals.push(`${g.variants} phrasings`); }
  if (g.competitorPages > 0) { score += 1; signals.push(`${g.competitorPages} relevant competitor page(s) published for it`); }
  if (g.relatedImpressions >= 20) { score += 0.5; signals.push(`the site already earns ${g.relatedImpressions} impressions on related searches`); }
  if (g.seasonalSoon) { score += 0.5; signals.push("its season is approaching"); }
  if (g.intent === "transactional" || g.intent === "local") { score += 0.5; signals.push(`${g.intent} intent (close to a visit or sign-up)`); }
  score = Math.min(5, Number(score.toFixed(1)));
  return { score, level: score >= 3.5 ? "strong" : score >= 2 ? "moderate" : "weak", signals };
}

export type SeasonalQuery = { query: string; page: string; impressionsLastYear: number; clicksLastYear: number; impressionsNow: number };

/**
 * Searches that earned impressions in the coming weeks LAST year (Search Console keeps 16 months) and are not earning them yet: demand to prepare for before
 * it peaks. Only queries with a real audience last year; current impressions from the latest 28 days.
 */
export function seasonalAhead(lastYear: QP[], now: QueryRow[], minImpr = 30, max = 8): SeasonalQuery[] {
  const nowBy = new Map(now.map((r) => [r.key, r.impressions]));
  const by = new Map<string, { impressions: number; clicks: number; best: QP }>();
  for (const r of lastYear) {
    const e = by.get(r.query) ?? { impressions: 0, clicks: 0, best: r };
    e.impressions += r.impressions;
    e.clicks += r.clicks;
    if (r.impressions > e.best.impressions) e.best = r;
    by.set(r.query, e);
  }
  return [...by.entries()]
    .filter(([q, e]) => e.impressions >= minImpr && (nowBy.get(q) ?? 0) < e.impressions * 0.5)
    .map(([q, e]) => ({ query: q, page: e.best.page, impressionsLastYear: e.impressions, clicksLastYear: e.clicks, impressionsNow: nowBy.get(q) ?? 0 }))
    .sort((a, b) => b.impressionsLastYear - a.impressionsLastYear)
    .slice(0, max);
}

/** Whole sections (page templates) losing visibility together: one systemic finding instead of many single-page ones. */
export function templateLosses(sections: SectionStat[], minPrev = 200, maxShare = 0.7): SectionStat[] {
  return sections.filter((s) => s.pagesPrev >= 3 && s.impressionsPrev >= minPrev && s.impressions < s.impressionsPrev * maxShare).sort((a, b) => b.impressionsPrev - b.impressions - (a.impressionsPrev - a.impressions));
}

export type ImprMove = { key: string; imprCur: number; imprPrev: number; clicksCur: number; clicksPrev: number; posCur: number | null };
/** Queries gaining and losing impressions between two equal windows (impressions lead clicks, so this shows direction earlier). */
export function impressionMovers(cur: QueryRow[], prev: QueryRow[], minImpr = 30, max = 6): { gaining: ImprMove[]; losing: ImprMove[] } {
  const m = new Map<string, ImprMove>();
  for (const r of cur) m.set(r.key, { key: r.key, imprCur: r.impressions, imprPrev: 0, clicksCur: r.clicks, clicksPrev: 0, posCur: Number(r.position.toFixed(1)) });
  for (const r of prev) {
    const e = m.get(r.key) ?? { key: r.key, imprCur: 0, imprPrev: 0, clicksCur: 0, clicksPrev: 0, posCur: null };
    e.imprPrev = r.impressions;
    e.clicksPrev = r.clicks;
    m.set(r.key, e);
  }
  const ok = [...m.values()].filter((x) => Math.max(x.imprCur, x.imprPrev) >= minImpr);
  return {
    gaining: ok.filter((x) => x.imprCur > x.imprPrev * 1.2).sort((a, b) => b.imprCur - b.imprPrev - (a.imprCur - a.imprPrev)).slice(0, max),
    losing: ok.filter((x) => x.imprCur < x.imprPrev * 0.8).sort((a, b) => a.imprCur - a.imprPrev - (b.imprCur - b.imprPrev)).slice(0, max),
  };
}

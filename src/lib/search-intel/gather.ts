/**
 * Reads everything one site's weekly report needs, read only: Search Console (the site's existing connection), stored history, competitors already
 * discovered for the site, and the competitors' own public pages. No site is written to. Per-site data stays per-site: every query is scoped to the one
 * businessId, and the report is only built for a house account unless customer reports are explicitly enabled later (see searchIntelEligible).
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getFreshAccessToken, getGoogleConnection } from "@/lib/integrations/google-oauth";
import { gscQuery } from "@/lib/seo/existing-pages";
import { syncSearchHistory, latestIndexRechecks } from "@/lib/seo/search-history";
import { safeFetchText, isSafePublicUrl } from "@/lib/net/safe-fetch";
import { parseSitemap } from "@/lib/truth/extract";
import { briefEvidence } from "@/lib/house/site-briefs";
import { addDays, type Daily } from "@/lib/case-studies/model";
import { changesSince, compareWindows, dataStatus, endDayFor, joinWindows, lowCtrPairs, movers, rankingBands, seasonality, type QueryRow, type Row } from "./analysis";
import { featureGaps, matchCompetitorUrls, newPagesSince, pageFeatures, queryTokens, type PageFeatures } from "./competitors";
import { brandSplit, brandTokens, cannibalization, clusterQueries, competitorRelevance, emergingQueries, sectionStats, toSplit, tokensOf, trend90, uncaptured, type Split } from "./deep";
import { profileFor } from "./profiles";
import { getBusinessTruth } from "@/lib/truth";
import type { DeepIntel } from "./types";

/** Public autocomplete suggestions for one phrase (shows that people type these; says nothing about how often). Polite: one request per seed, short timeout. */
async function autocomplete(seed: string): Promise<string[]> {
  const r = await safeFetchText(`https://duckduckgo.com/ac/?q=${encodeURIComponent(seed)}&type=list`, { timeoutMs: 6000, maxBytes: 50_000, accept: "application/json" });
  if (!r.ok || r.status >= 400) return [];
  try {
    const j = JSON.parse(r.body) as unknown;
    const list = Array.isArray(j) && Array.isArray(j[1]) ? (j[1] as unknown[]) : Array.isArray(j) ? (j as Array<{ phrase?: string }>).map((x) => x?.phrase) : [];
    return list.filter((x): x is string => typeof x === "string").slice(0, 10);
  } catch {
    return [];
  }
}

/**
 * Learning from verified outcomes: per recommendation kind, measured outcomes across the house sites nudge future ranking (0.8 to 1.2). Needs at least three
 * measured outcomes for a kind before it moves at all, so one lucky or unlucky result changes nothing.
 */
async function learnedKindWeights(): Promise<Record<string, number>> {
  const db = getDb();
  if (!db) return {};
  const rows = rowsOf<{ kind: string; verdict: string; n: number }>(await db.execute(sql`
    select r.kind, r.outcome->>'verdict' verdict, count(*)::int n from search_recommendations r join businesses b on b.id = r.business_id
    where b.account_type = 'house' and r.outcome is not null and r.outcome->>'verdict' in ('improved', 'no_material_change', 'declined') group by 1, 2`));
  const by = new Map<string, { up: number; flat: number; down: number }>();
  for (const r of rows) {
    const e = by.get(r.kind) ?? { up: 0, flat: 0, down: 0 };
    if (r.verdict === "improved") e.up += Number(r.n);
    else if (r.verdict === "declined") e.down += Number(r.n);
    else e.flat += Number(r.n);
    by.set(r.kind, e);
  }
  const out: Record<string, number> = {};
  for (const [k, e] of by) {
    const n = e.up + e.flat + e.down;
    if (n < 3) continue;
    out[k] = Number(Math.max(0.8, Math.min(1.2, 1 + ((e.up - e.down) / n) * 0.2)).toFixed(2));
  }
  return out;
}
import { webSearchSites } from "@/lib/business-mode";
import type { CompetitorQuery, SiteIntel } from "./types";

type Rows<T> = T[];
const rowsOf = <T>(r: unknown) => r as unknown as Rows<T>;

/**
 * Customer reports are PREPARED, not activated: the builder is tenant-scoped (one businessId, that business's own Search Console connection), but it only runs
 * for house accounts until the owner approves the pilot and a customer opt-in exists. Flip by changing this one function, never by editing callers.
 */
export async function searchIntelEligible(businessId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [b] = rowsOf<{ account_type: string }>(await db.execute(sql`select account_type from businesses where id = ${businessId} limit 1`));
  return b?.account_type === "house";
}

/** The Friday a report belongs to: today when it is Friday, otherwise the coming Friday. */
export function weekEndingFor(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const add = (5 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

const toQ = (rows: Array<{ keys?: string[]; clicks?: number; impressions?: number; position?: number }>): QueryRow[] =>
  rows.filter((r) => r.keys?.[0]).map((r) => ({ key: r.keys![0]!, clicks: Math.round(r.clicks ?? 0), impressions: Math.round(r.impressions ?? 0), position: r.position ?? 0 }));

async function fetchFeatures(url: string, observedAt: string): Promise<PageFeatures | null> {
  const r = await safeFetchText(url, { timeoutMs: 8000, maxBytes: 600_000 });
  if (!r.ok || r.status >= 400) return null;
  return pageFeatures(r.body, r.finalUrl, observedAt);
}

async function readSitemapUrls(origin: string, host: string): Promise<Array<{ loc: string; lastmod: Date | null }> | null> {
  const hostOf = (u: string) => new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  const sm = await safeFetchText(`${origin}/sitemap.xml`, { timeoutMs: 8000, maxBytes: 1_500_000 });
  if (!sm.ok || sm.status >= 400) return null;
  let entries = parseSitemap(sm.body);
  if (entries.some((e) => e.isIndex)) {
    const kids = entries.filter((e) => e.isIndex).map((e) => e.loc).filter((u) => isSafePublicUrl(u)).slice(0, 3);
    const all: typeof entries = [];
    for (const k of kids) {
      const child = await safeFetchText(k, { timeoutMs: 8000, maxBytes: 1_500_000 });
      if (child.ok && child.status < 400) all.push(...parseSitemap(child.body));
    }
    entries = all;
  }
  // a sitemap can list one URL twice, and one insert cannot touch the same row twice, so keep the first of each
  const uniq = new Map<string, { loc: string; lastmod: Date | null }>();
  for (const e of entries) if (!e.isIndex && !uniq.has(e.loc) && (() => { try { return hostOf(e.loc) === host; } catch { return false; } })()) uniq.set(e.loc, { loc: e.loc, lastmod: e.lastmod });
  return [...uniq.values()].slice(0, 1500);
}

/**
 * Competitors are kept only when their own published pages cover this site's topic (profile topic words). Famous brands that merely share a category
 * (a coffee chain for a bar-discovery site) are rejected and listed as rejected. When fewer than two relevant competitors are on record, a small number of
 * existing web searches (the same capped research tool the engine already uses) look for real sites serving the site's main intents.
 */
async function competitorSection(
  businessId: string,
  website: string | null,
  rows: Row[],
  observedAtIso: string,
  ctx: { topicWords: string[] | null; seeds: string[] } = { topicWords: null, seeds: [] },
): Promise<{ section: SiteIntel["competitors"]; urlsByHost: Map<string, string[]>; filter: { kept: string[]; rejected: Array<{ site: string; reason: string }> } }> {
  const db = getDb()!;
  const notes: string[] = [];
  const hostOf = (u: string) => new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  const ownHost = (() => { try { return website ? hostOf(/^https?:\/\//i.test(website) ? website : `https://${website}`) : ""; } catch { return ""; } })();
  const onRecord = rowsOf<{ name: string; website: string | null }>(await db.execute(sql`select name, website from business_competitors where business_id = ${businessId} and status = 'active' and website is not null order by created_at desc limit 8`))
    .filter((c): c is { name: string; website: string } => !!c.website && !!isSafePublicUrl(c.website));
  const kept: Array<{ name: string; website: string }> = [];
  const filter = { kept: [] as string[], rejected: [] as Array<{ site: string; reason: string }> };
  const urlsByHost = new Map<string, string[]>();
  const hostsWithBaseline = new Set<string>(rowsOf<{ host: string }>(await db.execute(sql`select distinct competitor_host host from competitor_page_observations where business_id = ${businessId}`)).map((e) => e.host));
  const result: SiteIntel["competitors"] = { observedAt: observedAtIso, known: [], sitemapsRead: 0, pagesObserved: 0, baselineEstablishedToday: [], newPages: [], queries: [], notes };

  const consider = async (c: { name: string; website: string }, via: string) => {
    if (kept.length >= 5) return;
    let host = "";
    try { host = hostOf(c.website); } catch { return; }
    if (!host || host === ownHost || urlsByHost.has(host) || filter.rejected.some((r) => r.site === host)) return;
    const pages = await readSitemapUrls(new URL(c.website).origin, host);
    if (!pages || !pages.length) { filter.rejected.push({ site: host, reason: "no readable sitemap, so its pages could not be checked" }); return; }
    const urls = pages.map((p) => p.loc);
    if (ctx.topicWords) {
      const rel = competitorRelevance(urls, ctx.topicWords);
      if (!rel.relevant) { filter.rejected.push({ site: host, reason: `its pages do not cover this site's topic (${rel.matches} of ${urls.length} page addresses use the topic's words)` }); return; }
    }
    kept.push(c);
    filter.kept.push(`${host} (${via})`);
    result.sitemapsRead++;
    urlsByHost.set(host, urls);
    result.pagesObserved += urls.length;
    if (!hostsWithBaseline.has(host)) result.baselineEstablishedToday.push(host);
    for (let i = 0; i < pages.length; i += 300) {
      const chunk = pages.slice(i, i + 300);
      await db.execute(sql`insert into competitor_page_observations (business_id, competitor_host, url, lastmod) values ${sql.join(chunk.map((e) => sql`(${businessId}, ${host}, ${e.loc}, ${e.lastmod ? e.lastmod.toISOString().slice(0, 10) : null})`), sql`, `)}
        on conflict (business_id, url) do update set last_seen = now(), lastmod = excluded.lastmod`);
    }
  };
  for (const c of onRecord) await consider(c, "on record");
  if (kept.length < 2 && ctx.seeds.length) {
    for (const seed of ctx.seeds.slice(0, 2)) {
      const found = await webSearchSites(seed, 5).catch(() => []);
      for (const f of found) await consider({ name: f.name, website: f.website }, `found by a web search for "${seed}" on ${observedAtIso.slice(0, 10)}; not a Google ranking`);
    }
  }
  result.known = kept.map((k) => ({ name: k.name, website: k.website }));
  if (filter.rejected.length) notes.push(`Rejected as not genuinely competing: ${filter.rejected.map((r) => `${r.site} (${r.reason})`).join("; ")}.`);
  if (!kept.length) {
    notes.push("No relevant competitor could be confirmed this week, so no competitor comparison was made.");
    return { section: result, urlsByHost, filter };
  }
  const since = new Date(Date.now() - 8 * 86_400_000).toISOString();
  const fresh = rowsOf<{ host: string; url: string; first_seen: string }>(await db.execute(sql`select o.competitor_host host, o.url, o.first_seen from competitor_page_observations o where o.business_id = ${businessId} and o.first_seen >= ${since}::timestamptz
    and o.first_seen > (select min(x.first_seen) + interval '1 hour' from competitor_page_observations x where x.business_id = o.business_id and x.competitor_host = o.competitor_host)
    order by o.first_seen desc limit 200`));
  result.newPages = newPagesSince(fresh.map((f) => ({ host: f.host, url: f.url, firstSeen: new Date(f.first_seen).toISOString() })), hostsWithBaseline, since);
  if (result.baselineEstablishedToday.length) notes.push(`First observation (baseline, no changes claimed) for: ${result.baselineEstablishedToday.join(", ")}.`);

  // The site's own important queries: biggest non-trivial audiences first.
  const byQuery = new Map<string, { impressions: number; weighted: number; best: Row }>();
  for (const r of rows) {
    const e = byQuery.get(r.query) ?? { impressions: 0, weighted: 0, best: r };
    e.impressions += r.impressions;
    e.weighted += r.position * r.impressions;
    if (r.impressions > e.best.impressions) e.best = r;
    byQuery.set(r.query, e);
  }
  const important = [...byQuery.entries()].filter(([, e]) => e.impressions >= 20).sort((a, b) => b[1].impressions - a[1].impressions).slice(0, 3);
  for (const [query, e] of important) {
    const tokens = queryTokens(query);
    const matches = matchCompetitorUrls(urlsByHost, tokens, 3);
    const observed: CompetitorQuery["competitorPages"] = [];
    for (const m of matches) {
      const f = await fetchFeatures(m.url, observedAtIso);
      if (f) observed.push({ ...f, host: m.host });
    }
    const ourPage = website && isSafePublicUrl(e.best.page) ? await fetchFeatures(e.best.page, observedAtIso) : null;
    const gaps = observed.flatMap((o) => featureGaps(ourPage, o)).slice(0, 4);
    result.queries.push({ query, impressions: e.impressions, position: Number((e.weighted / e.impressions).toFixed(1)), ourPage, competitorPages: observed, gaps });
    if (!matches.length) notes.push(`"${query}": none of the ${kept.length} relevant competitors publishes a page whose address matches this query, so no comparison was made.`);
  }
  return { section: result, urlsByHost, filter };
}

export async function gatherSearchIntel(businessId: string, now = new Date(), opts: { competitors?: boolean } = {}): Promise<SiteIntel | null> {
  const db = getDb();
  if (!db || !(await searchIntelEligible(businessId))) return null;
  const [biz] = rowsOf<{ name: string; website: string | null }>(await db.execute(sql`select name, website from businesses where id = ${businessId} limit 1`));
  if (!biz) return null;
  const today = now.toISOString().slice(0, 10);
  const endDay = endDayFor(today);
  const weekEnding = weekEndingFor(now);
  const conn = await getGoogleConnection(businessId).catch(() => null);
  const token = conn?.searchConsoleProperty ? await getFreshAccessToken(businessId).catch(() => null) : null;
  const property = conn?.searchConsoleProperty ?? null;
  const dataQualityNotes: string[] = [];

  if (token) await syncSearchHistory(businessId).catch(() => null); // one cheap call so the totals are as fresh as Search Console allows
  const daily = rowsOf<Daily>(await db.execute(sql`select day, clicks, impressions, position from search_daily where business_id = ${businessId} order by day`)).map((d) => ({ day: d.day, clicks: Number(d.clicks), impressions: Number(d.impressions), position: Number(d.position) }));
  const status = dataStatus(daily, today);
  const empty = {
    w7: null, w28: null, queries7: null, queries28: null, pages7: null, pages28: null, bands: null, seasonal: null,
  } as const;

  const [prevReport] = rowsOf<{ data: SiteIntel }>(await db.execute(sql`select data from search_intel_reports where business_id = ${businessId} and week_ending < ${weekEnding} order by week_ending desc limit 1`));

  let parts: Pick<SiteIntel, "w7" | "w28" | "queries7" | "queries28" | "pages7" | "pages28" | "bands" | "seasonal"> = { ...empty };
  let rows: Row[] = [];
  let topPages: SiteIntel["topPages"] = [];
  // v2 deeper analysis inputs (all for the latest 28-day window unless named otherwise)
  let devices: Split[] = [];
  let countries: Split[] = [];
  let searchTypes: DeepIntel["searchTypes"] = { image: null, video: null };
  let q28cur: QueryRow[] = [];
  let q28prev: QueryRow[] = [];
  let p28cur: QueryRow[] = [];
  let p28prev: QueryRow[] = [];
  if (!token || !property) {
    dataQualityNotes.push("Search Console is not connected for this site, so no search data is available.");
  } else if (daily.length) {
    const win = (len: number, back: number) => ({ start: addDays(endDay, -(len - 1) - back), end: addDays(endDay, -back) });
    const [q7c, q7p, q28c, q28p, p7c, p7p, p28c, p28p, pq] = await Promise.all([
      gscQuery(token, property, win(7, 0), ["query"], { rowLimit: 1000 }),
      gscQuery(token, property, win(7, 7), ["query"], { rowLimit: 1000 }),
      gscQuery(token, property, win(28, 0), ["query"], { rowLimit: 2000 }),
      gscQuery(token, property, win(28, 28), ["query"], { rowLimit: 2000 }),
      gscQuery(token, property, win(7, 0), ["page"], { rowLimit: 500 }),
      gscQuery(token, property, win(7, 7), ["page"], { rowLimit: 500 }),
      gscQuery(token, property, win(28, 0), ["page"], { rowLimit: 1000 }),
      gscQuery(token, property, win(28, 28), ["page"], { rowLimit: 1000 }),
      gscQuery(token, property, win(28, 0), ["page", "query"], { rowLimit: 2500 }),
    ]);
    const failed = [q7c, q7p, q28c, q28p, p7c, p7p, p28c, p28p, pq].filter((x) => x === null).length;
    if (failed) dataQualityNotes.push(`${failed} of 9 Search Console requests failed this run; sections that depend on them are marked unavailable rather than guessed.`);
    const mv = (c: typeof q7c, p: typeof q7p, minImpr: number) => (c && p ? movers(joinWindows(toQ(c), toQ(p)), { minImpr, max: 8 }) : null);
    rows = (pq ?? []).filter((r) => r.keys?.[0] && r.keys?.[1]).map((r) => ({ page: r.keys![0]!, query: r.keys![1]!, clicks: Math.round(r.clicks ?? 0), impressions: Math.round(r.impressions ?? 0), position: r.position ?? 0 }));
    if (pq && pq.length >= 2500) dataQualityNotes.push("The 28-day page and query table hit its 2,500 row limit, so very small queries are not all included.");
    parts = {
      w7: compareWindows(daily, endDay, 7),
      w28: compareWindows(daily, endDay, 28),
      queries7: mv(q7c, q7p, 5),
      queries28: mv(q28c, q28p, 10),
      pages7: mv(p7c, p7p, 5),
      pages28: mv(p28c, p28p, 10),
      bands: pq ? rankingBands(rows) : null,
      seasonal: seasonality(daily, endDay),
    };
    topPages = (p28c ?? []).filter((r) => r.keys?.[0]).map((r) => ({ page: r.keys![0]!, clicks: Math.round(r.clicks ?? 0), impressions: Math.round(r.impressions ?? 0) })).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, 8);
    q28cur = q28c ? toQ(q28c) : [];
    q28prev = q28p ? toQ(q28p) : [];
    p28cur = p28c ? toQ(p28c) : [];
    p28prev = p28p ? toQ(p28p) : [];
    const [dCur, ctry, img, vid] = await Promise.all([
      gscQuery(token, property, win(28, 0), ["device"], { rowLimit: 10 }),
      gscQuery(token, property, win(28, 0), ["country"], { rowLimit: 20 }),
      gscQuery(token, property, win(28, 0), [], { searchType: "image" }),
      gscQuery(token, property, win(28, 0), [], { searchType: "video" }),
    ]);
    devices = dCur ? toSplit(dCur) : [];
    countries = ctry ? toSplit(ctry).sort((a, b) => b.impressions - a.impressions).slice(0, 6) : [];
    const one = (r: typeof img, key: string): Split | null => (r && r[0] ? { key, clicks: Math.round(r[0].clicks ?? 0), impressions: Math.round(r[0].impressions ?? 0), ctr: r[0].impressions ? (r[0].clicks ?? 0) / r[0].impressions : 0, position: Number((r[0].position ?? 0).toFixed(1)) } : null);
    searchTypes = { image: one(img, "image"), video: one(vid, "video") };
    // Google withholds rare queries for privacy: query-level rows cover only part of the site's impressions. Say how much, so query findings are not over-read.
    const qImpr = q28cur.reduce((s, r) => s + r.impressions, 0);
    const siteImpr = parts.w28?.cur.impressions ?? 0;
    if (siteImpr > 0) dataQualityNotes.push(`Query-level data covers ${Math.round((Math.min(qImpr, siteImpr) / siteImpr) * 100)}% of the site's ${siteImpr} impressions in the latest 28 days; Google withholds rare queries, so query and topic findings describe only that part.`);
    for (const [label, c] of [["7-day", parts.w7], ["28-day", parts.w28]] as const) {
      if (c?.sample === "low") dataQualityNotes.push(`${label} comparison is low-sample (very few clicks and impressions); treat movements as noise.`);
      if (c?.sample === "missing") dataQualityNotes.push(`${label} comparison is missing days of data in one window.`);
    }
  }

  const [dr] = rowsOf<{ evidence: { lostPages?: number; priorPages?: number; impressionsBefore?: number; impressionsNow?: number; reading?: string; sample?: string[] } | null }>(await db.execute(sql`
    select evidence from growth_opportunities where business_id = ${businessId} and subtype = 'search_pages_dropped' order by created_at desc limit 1`));
  const rechecks = (await latestIndexRechecks(businessId, 3)).map((r) => ({ at: r.createdAt.toISOString(), verdicts: (r.payload as { verdicts?: Record<string, number> } | null)?.verdicts ?? {} })).filter((r, i, all) => all.findIndex((x) => x.at.slice(0, 10) === r.at.slice(0, 10) && JSON.stringify(x.verdicts) === JSON.stringify(r.verdicts)) === i); // one line per distinct check
  const indexing: SiteIntel["indexing"] = {
    dropped: dr?.evidence?.lostPages ? { lost: Number(dr.evidence.lostPages), before: Number(dr.evidence.priorPages ?? 0), impressionsBefore: Number(dr.evidence.impressionsBefore ?? 0), impressionsNow: Number(dr.evidence.impressionsNow ?? 0), reading: dr.evidence.reading ?? null, sample: dr.evidence.sample ?? [] } : null,
    rechecks,
    notes: dr?.evidence?.lostPages ? [] : ["No pages-dropped finding is open for this site."],
  };

  const briefRows = rowsOf<{ t: string; subtype: string | null; imp: number; conf: number; evidence: unknown }>(await db.execute(sql`
    select opportunity_type t, subtype, expected_impact imp, confidence conf, evidence from growth_opportunities
    where business_id = ${businessId} and status = 'open' and required_capability = 'website_write' and opportunity_type in ('existing_page_seo','schema','ctr','technical','conversion','content_gap','internal_link')
    order by (expected_impact * confidence) desc limit 40`));
  // One line per kind of finding: the same defect on many pages is one item that lists its pages, and raw evidence is written in plain words.
  const grouped = new Map<string, { type: string; subtype: string | null; impact: number; detail: string; urls: string[] }>();
  for (const b of briefRows) {
    if (b.subtype === "search_pages_dropped" || b.subtype === "search_low_ctr") continue; // already covered with fresher numbers above
    const ev = (b.evidence ?? {}) as { url?: string; path?: string; detail?: string };
    const detail = (briefEvidence(b.subtype, b.evidence) ?? ev.detail ?? JSON.stringify(b.evidence ?? "")).replace(/\s+/g, " ").slice(0, 240);
    const key = `${b.t}|${b.subtype ?? ""}`;
    const g = grouped.get(key) ?? { type: b.t, subtype: b.subtype, impact: Number(b.imp), detail, urls: [] };
    if (ev.url && !g.urls.includes(ev.url)) g.urls.push(ev.url);
    grouped.set(key, g);
  }
  const openBriefs: SiteIntel["openBriefs"] = [...grouped.values()].sort((a, b) => b.impact - a.impact).slice(0, 6).map((g) => ({ type: g.type, subtype: g.subtype, impact: g.impact, urls: g.urls.slice(0, 8), text: g.urls.length ? `${g.detail} Affected (${g.urls.length}): ${g.urls.slice(0, 5).join(", ")}${g.urls.length > 5 ? ", ..." : ""}` : g.detail }));

  const [au] = rowsOf<{ qualified: number; contacted: number; acquired: number }>(await db.execute(sql`
    select count(*) filter (where status = 'qualified')::int qualified, count(*) filter (where status in ('contacted', 'followed_up'))::int contacted, count(*) filter (where status = 'acquired')::int acquired from backlink_opportunities where business_id = ${businessId}`));

  const profile = profileFor(biz.name);
  const truth = await getBusinessTruth(businessId).catch(() => null);
  const brand = brandTokens(biz.name, biz.website);
  // The daily change check skips the (slower, polite) competitor and demand research; both run once a week in the full report.
  const weekly = opts.competitors !== false;
  const comp = weekly
    ? await competitorSection(businessId, biz.website, rows, now.toISOString(), { topicWords: profile?.topicWords ?? null, seeds: profile?.seeds ?? [] })
    : null;
  const competitors: SiteIntel["competitors"] = comp?.section ?? { observedAt: now.toISOString(), known: [], sitemapsRead: 0, pagesObserved: 0, baselineEstablishedToday: [], newPages: [], queries: [], notes: ["Competitors are observed in the weekly report, not in the daily change check."] };

  // Search demand the site is missing: public autocomplete shows what people type (not how often); anything the site already appears for is removed.
  const demand: DeepIntel["demand"] = { source: "DuckDuckGo public autocomplete", checkedAt: now.toISOString(), seeds: [], suggestions: 0, uncaptured: [], notes: [] };
  if (weekly && profile) {
    const suggestions: string[] = [];
    for (const seed of profile.seeds.slice(0, 8)) {
      demand.seeds.push(seed);
      suggestions.push(...(await autocomplete(seed)));
    }
    demand.suggestions = suggestions.length;
    const siteQueries = [...q28cur, ...q28prev].map((q) => q.key);
    const missing = uncaptured(suggestions, siteQueries, profile.topicWords);
    const groups = new Map<string, string[]>();
    for (const m of missing) {
      const key = tokensOf(m).slice(0, 2).sort().join(" ");
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
    }
    for (const [, qs] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 4)) {
      const pages: DeepIntel["demand"]["uncaptured"][number]["competitorPages"] = [];
      if (comp) {
        for (const mm of matchCompetitorUrls(comp.urlsByHost, queryTokens(qs[0]!), 2)) {
          const f = await fetchFeatures(mm.url, now.toISOString());
          if (f) pages.push({ url: f.url, title: f.title, observedAt: f.observedAt });
        }
      }
      demand.uncaptured.push({ label: qs[0]!, queries: qs.slice(0, 6), competitorPages: pages });
    }
    if (!suggestions.length) demand.notes.push("Public autocomplete returned nothing this week, so no missing-demand finding was made.");
  } else if (weekly) demand.notes.push("No site profile on record, so missing demand was not researched.");

  const learnedWeights = await learnedKindWeights();
  const deep: DeepIntel = {
    profile: profile ? { what: profile.what, audience: profile.audience, conversions: profile.conversions } : null,
    truthDescription: truth?.description ? truth.description.replace(/\s+/g, " ").slice(0, 400) : null,
    window28: { start: addDays(endDay, -27), end: endDay },
    trend90: trend90(daily, endDay),
    devices,
    countries,
    searchTypes,
    brand: brandSplit(q28cur, brand),
    clusters: clusterQueries(rows, brand),
    emerging: emergingQueries(q28cur, q28prev),
    cannibal: cannibalization(rows),
    sections: sectionStats(p28cur, p28prev),
    pageQuery: rows.slice().sort((a, b) => b.impressions - a.impressions).slice(0, 60),
    demand,
    competitorFilter: comp?.filter ?? { kept: [], rejected: [] },
    learnedWeights,
  };
  const intel: SiteIntel = {
    version: 1,
    site: { businessId, name: biz.name, website: biz.website },
    generatedAt: now.toISOString(),
    weekEnding,
    endDay,
    googleConnected: Boolean(token && property),
    status,
    ...parts,
    lowCtr: lowCtrPairs(rows),
    topPages,
    indexing,
    competitors,
    openBriefs,
    authority: { qualified: Number(au?.qualified ?? 0), contacted: Number(au?.contacted ?? 0), verifiedLinks: Number(au?.acquired ?? 0), note: "Backlink counts for competitors are NOT AVAILABLE (no free source exists). These are this site's own outreach results only." },
    changes: [],
    dataQualityNotes,
    deep,
  };
  intel.changes = parts.w28 && parts.bands ? changesSince(prevReport?.data ?? null, { w28: parts.w28, bands: { b4_10: parts.bands.b4_10 } }) : ["No search data this week, so nothing can be compared with the previous report."];
  if (prevReport?.data && competitors.newPages.length) intel.changes.push(`${competitors.newPages.length} competitor page(s) first observed this week (listed below).`);
  return intel;
}

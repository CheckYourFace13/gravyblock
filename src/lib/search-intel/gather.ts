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
import { brandSplit, brandTokens, cannibalization, clusterQueries, competitorRelevance, emergingQueries, sectionOf, sectionStats, toSplit, tokensOf, trend90, uncaptured, type Split } from "./deep";
import { profileFor } from "./profiles";
import { getBusinessTruth } from "@/lib/truth";
import type { DeepIntel } from "./types";

import { buildLaunchPlan, collectSuggestions, coversIntent, fetchDetail, inventoryMatches, ourStrengths, searchStage, topicGaps, type PageDetail } from "./research";
import { demandStrength, impressionMovers, intentOf, seasonalAhead, templateLosses, type QP } from "./deep";
import type { IntentResearch } from "./types";

/** Every row of a Search Console request, paged with startRow (the API returns at most 25,000 rows per request and only its top rows overall). */
async function gscAll(token: string, property: string, win: { start: string; end: string }, dims: string[], opts: { pageSize?: number; max?: number } = {}) {
  const size = opts.pageSize ?? 5000;
  const max = opts.max ?? 15000;
  const out: NonNullable<Awaited<ReturnType<typeof gscQuery>>> = [];
  for (let start = 0; start < max; start += size) {
    const r = await gscQuery(token, property, win, dims, { rowLimit: size, startRow: start });
    if (r === null) return start === 0 ? null : out;
    out.push(...r);
    if (r.length < size) break;
  }
  return out;
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

export async function readSitemapUrls(origin: string, host: string): Promise<Array<{ loc: string; lastmod: Date | null }> | null> {
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
  ctx: { topicWords: string[] | null; seeds: string[]; candidates?: string[] } = { topicWords: null, seeds: [] },
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
    if (kept.length >= 6) return;
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
  // candidate sites for the main intents (from the site profile), each verified the same way: its own pages must cover the topic
  for (const w of ctx.candidates ?? []) if (isSafePublicUrl(w)) await consider({ name: new URL(w).hostname.replace(/^www\./, ""), website: w }, "candidate for the site's main intents, verified from its own sitemap");
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
  result.newPages = newPagesSince(fresh.map((f) => ({ host: f.host, url: f.url, firstSeen: new Date(f.first_seen).toISOString() })), hostsWithBaseline, since).filter((p) => urlsByHost.has(p.host)); // only competitors that passed the relevance check
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
  const important = [...byQuery.entries()].filter(([, e]) => e.impressions >= 20).sort((a, b) => b[1].impressions - a[1].impressions).slice(0, 2);
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
  let coverage: NonNullable<DeepIntel["coverage"]> = { pageQueryRows: 0, truncated: false, queryShare: null };
  let googleBrand: DeepIntel["googleBrand"];
  let appearances: Split[] = [];
  let surfaces: NonNullable<DeepIntel["surfaces"]> = [];
  let queries90: DeepIntel["queries90"] = null;
  let seasonal: DeepIntel["seasonalAhead"] = null;
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
      gscAll(token, property, win(28, 0), ["page", "query"], { pageSize: 5000, max: 15000 }),
    ]);
    const failed = [q7c, q7p, q28c, q28p, p7c, p7p, p28c, p28p, pq].filter((x) => x === null).length;
    if (failed) dataQualityNotes.push(`${failed} of 9 Search Console requests failed this run; sections that depend on them are marked unavailable rather than guessed.`);
    const mv = (c: typeof q7c, p: typeof q7p, minImpr: number) => (c && p ? movers(joinWindows(toQ(c), toQ(p)), { minImpr, max: 8 }) : null);
    rows = (pq ?? []).filter((r) => r.keys?.[0] && r.keys?.[1]).map((r) => ({ page: r.keys![0]!, query: r.keys![1]!, clicks: Math.round(r.clicks ?? 0), impressions: Math.round(r.impressions ?? 0), position: r.position ?? 0 }));
    coverage = { pageQueryRows: pq?.length ?? 0, truncated: (pq?.length ?? 0) >= 15000, queryShare: null };
    if (coverage.truncated) dataQualityNotes.push("The 28-day page and query table reached GravyBlock's 15,000 row cap, so the smallest queries are not all included.");
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

    // v3: Google's own branded split (API since 16 Nov 2026, data from 21 Feb 2026, only for properties Google classifies), search appearances,
    // every search surface (web, image, video, news tab, Discover, Google News, Lens/Circle to Search) against the previous 28 days,
    // 90-day query movement, and the queries that earned impressions in the coming 8 weeks LAST year (Search Console keeps 16 months).
    const surfaceTypes = ["web", "image", "video", "news", "discover", "googleNews", "webMultimodal"] as const;
    const [brandCur, appear, q90c, q90p, lastYear, ...surf] = await Promise.all([
      gscQuery(token, property, win(28, 0), ["brandedClassification"], { rowLimit: 10 }),
      gscQuery(token, property, win(28, 0), ["searchAppearance"], { rowLimit: 50 }),
      gscQuery(token, property, win(90, 0), ["query"], { rowLimit: 5000 }),
      gscQuery(token, property, win(90, 90), ["query"], { rowLimit: 5000 }),
      gscQuery(token, property, { start: addDays(endDay, -364 + 1), end: addDays(endDay, -364 + 56) }, ["query", "page"], { rowLimit: 5000 }),
      ...surfaceTypes.flatMap((t) => [gscQuery(token, property, win(28, 0), [], { searchType: t }), gscQuery(token, property, win(28, 28), [], { searchType: t })]),
    ]);
    const bsplit = brandCur ? toSplit(brandCur) : [];
    googleBrand = bsplit.length
      ? { source: "Google branded classification", branded: bsplit.find((x) => x.key === "BRANDED") ?? null, nonBranded: bsplit.find((x) => x.key === "NON_BRANDED") ?? null, note: "Google's own classification of branded searches (Search Console API)." }
      : { source: "name match estimate", branded: null, nonBranded: null, note: "Google does not classify branded searches for this property (too little volume or not a top-level property), so the brand split below is GravyBlock's estimate from the site name." };
    appearances = appear ? toSplit(appear).sort((a, b) => b.impressions - a.impressions) : [];
    surfaces = surfaceTypes.map((t, n) => {
      const c = surf[n * 2]?.[0];
      const p = surf[n * 2 + 1]?.[0];
      return { key: t, clicks: Math.round(c?.clicks ?? 0), impressions: Math.round(c?.impressions ?? 0), ctr: c?.impressions ? (c.clicks ?? 0) / c.impressions : 0, position: Number((c?.position ?? 0).toFixed(1)), clicksPrev: Math.round(p?.clicks ?? 0), impressionsPrev: Math.round(p?.impressions ?? 0) };
    }).filter((x) => x.impressions + x.impressionsPrev > 0);
    if (q90c && q90p) queries90 = { window: win(90, 0), ...impressionMovers(toQ(q90c), toQ(q90p)) };
    if (lastYear) {
      const ly: QP[] = lastYear.filter((r) => r.keys?.[0] && r.keys?.[1]).map((r) => ({ query: r.keys![0]!, page: r.keys![1]!, clicks: Math.round(r.clicks ?? 0), impressions: Math.round(r.impressions ?? 0), position: r.position ?? 0 }));
      const w = { start: addDays(endDay, -364 + 1), end: addDays(endDay, -364 + 56) };
      seasonal = ly.length
        ? { window: w, queries: seasonalAhead(ly, q28cur), note: `Searches that earned impressions from ${w.start} to ${w.end} (the same 8 weeks ahead, one year earlier) and are not yet earning them now.` }
        : { window: w, queries: [], note: "No Search Console data for the same weeks last year, so no seasonal look-ahead is possible yet." };
    }
    // Google withholds rare queries for privacy: query-level rows cover only part of the site's impressions. Say how much, so query findings are not over-read.
    const qImpr = q28cur.reduce((s, r) => s + r.impressions, 0);
    const siteImpr = parts.w28?.cur.impressions ?? 0;
    if (siteImpr > 0) coverage.queryShare = Math.round((Math.min(qImpr, siteImpr) / siteImpr) * 100);
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
  // launch stage (no Search Console, or too little data): research demand more widely and plan the site, instead of waiting for Google data
  const stageInfo = searchStage(Boolean(token && property), parts.w28 ? parts.w28.cur.impressions : null);
  const launching = stageInfo.stage !== "established";
  const comp = weekly
    ? await competitorSection(businessId, biz.website, rows, now.toISOString(), { topicWords: profile?.topicWords ?? null, seeds: profile?.seeds ?? [], candidates: profile?.competitorCandidates ?? [] })
    : null;
  const competitors: SiteIntel["competitors"] = comp?.section ?? { observedAt: now.toISOString(), known: [], sitemapsRead: 0, pagesObserved: 0, baselineEstablishedToday: [], newPages: [], queries: [], notes: ["Competitors are observed in the weekly report, not in the daily change check."] };

  // The site's own content inventory (its sitemap), so missing demand is matched to an existing page before anything new is proposed.
  const ownOrigin = (() => { try { return biz.website ? new URL(/^https?:\/\//i.test(biz.website) ? biz.website : `https://${biz.website}`).origin : null; } catch { return null; } })();
  const ownHost = ownOrigin ? new URL(ownOrigin).hostname.replace(/^www\./, "").toLowerCase() : "";
  const inventoryUrls = weekly && ownOrigin ? ((await readSitemapUrls(ownOrigin, ownHost).catch(() => null)) ?? []).map((e) => e.loc) : [];
  const inventory = { pages: inventoryUrls.length, source: inventoryUrls.length ? `${ownOrigin}/sitemap.xml` : "sitemap not readable" };
  const detailCache = new Map<string, PageDetail | null>();
  const detail = async (u: string): Promise<PageDetail | null> => {
    if (detailCache.has(u)) return detailCache.get(u) ?? null;
    const f = await fetchDetail(u, now.toISOString()).catch(() => null);
    detailCache.set(u, f);
    return f;
  };

  // Search demand the site is missing: public autocomplete (Google and DuckDuckGo) shows what people type, not how often; anything the site already appears for
  // is removed. Seeds: the site profile's core searches plus the biggest non-brand topics Google already associates with the site.
  const demand: DeepIntel["demand"] = { source: "Google and DuckDuckGo public autocomplete", checkedAt: now.toISOString(), seeds: [], suggestions: 0, uncaptured: [], notes: [] };
  if (weekly && profile) {
    const clustersNow = clusterQueries(rows, brand).filter((c) => !c.branded && c.impressions >= 30).slice(0, 2).map((c) => c.label);
    // launch stage: every profile seed plus "<competitor> alternative" for relevant competitors, so switching searches are researched too
    const altSeeds = launching && comp ? comp.section.known.slice(0, 3).map((k) => `${k.website.replace(/^https?:\/\/(www\.)?/, "").split(".")[0]} alternative`) : [];
    const seeds = [...new Set([...profile.seeds.slice(0, launching ? 14 : 8), ...clustersNow, ...altSeeds])];
    demand.seeds.push(...seeds);
    const sugg = await collectSuggestions(seeds, { ddgSeeds: 8 });
    demand.suggestions = sugg.size;
    const siteQueries = [...q28cur, ...q28prev].map((q) => q.key);
    // platform names ("... reddit") describe where people ask, not what they want; drop them
    const missing = uncaptured([...sugg.keys()], siteQueries, profile.topicWords).filter((q) => !/\b(reddit|youtube|tiktok|yelp|wikipedia|amazon|facebook|instagram|quora|craigslist)\b/.test(q) && !/\.(com|net|org|io|co|app)\b/.test(q)); // a site name ("calculator.net") is navigation to someone else
    const groups = new Map<string, string[]>();
    for (const m of missing) {
      const key = tokensOf(m).slice(0, 2).sort().join(" ");
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
    }
    const month = now.getUTCMonth() + 1;
    const soon = profile.seasonal?.find((x) => x.months.some((m) => m === month || m === (month % 12) + 1 || m === ((month + 1) % 12) + 1));
    // a demand topic needs at least two different suggestions behind it; a lone odd suggestion ("marina city split balconies") is not a topic
    const cands = [...groups.entries()].filter(([, v]) => v.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, launching ? 14 : 8);
    for (const [, qsRaw] of cands) {
      const qs = [...qsRaw].sort((a, b) => a.length - b.length); // the plainest phrasing leads
      const label = qs[0]!;
      const toks = tokensOf(label);
      const pages: DeepIntel["demand"]["uncaptured"][number]["competitorPages"] = [];
      let competitorCount = 0;
      if (comp) {
        const mm = matchCompetitorUrls(comp.urlsByHost, queryTokens(label), 3);
        competitorCount = mm.length;
        for (const x of mm.slice(0, 2)) {
          const f = await detail(x.url);
          if (f) pages.push({ url: f.url, title: f.title, observedAt: f.observedAt });
        }
      }
      // an existing page of ours for this intent: expand it rather than create another page
      let existingPage: { url: string; title: string; covers: boolean; indexable: boolean } | null = null;
      for (const u of inventoryMatches(inventoryUrls, label, 2)) {
        const f = await detail(u);
        if (!f) continue;
        const c = coversIntent(f, qs);
        existingPage = { url: f.url, title: f.title, covers: c.covered, indexable: f.indexable };
        if (c.covered) break;
      }
      const sources = [...new Set(qs.flatMap((q) => [...(sugg.get(q) ?? [])]))];
      const related = q28cur
        .filter((r) => {
          const t = tokensOf(r.key);
          return t.length > 0 && toks.length > 0 && toks.filter((w) => t.includes(w)).length / toks.length >= 0.5;
        })
        .reduce((sum, r) => sum + r.impressions, 0);
      const intent = intentOf(label, brand);
      const strength = demandStrength({ variants: qs.length, sources, competitorPages: competitorCount, relatedImpressions: related, seasonalSoon: Boolean(soon && toks.some((t) => soon.topic.toLowerCase().includes(t))), intent });
      demand.uncaptured.push({ label, queries: qs.slice(0, 6), competitorPages: pages, sources, strength, intent, existingPage });
    }
    demand.uncaptured.sort((a, b) => (b.strength?.score ?? 0) - (a.strength?.score ?? 0));
    demand.uncaptured = demand.uncaptured.slice(0, launching ? 10 : 6);
    if (!sugg.size) demand.notes.push("Public autocomplete returned nothing this week, so no missing-demand finding was made.");
    demand.notes.push("Autocomplete proves people type a phrase; it says nothing about how many do. No search volumes are estimated.");
  } else if (weekly) demand.notes.push("No site profile on record, so missing demand was not researched.");

  // Competitor research per important intent: the biggest non-brand topics the site ranks for (not yet top 3) and the strongest missing demand.
  const intents: IntentResearch[] = [];
  if (weekly && comp) {
    const fromGsc = clusterQueries(rows, brand)
      .filter((c) => !c.branded && c.position > 3 && c.impressions >= 30)
      .slice(0, 3)
      .map((c) => ({ label: c.label, queries: c.queries, source: "search console" as const, position: c.position as number | null, impressions: c.impressions, ourUrl: (c.pages[0] ?? null) as string | null }));
    const fromDemand = demand.uncaptured.slice(0, 2).map((g) => ({ label: g.label, queries: g.queries, source: "autocomplete" as const, position: null as number | null, impressions: 0, ourUrl: g.existingPage?.url ?? null }));
    for (const it of [...fromGsc, ...fromDemand]) {
      const matches = matchCompetitorUrls(comp.urlsByHost, queryTokens(it.label), 2);
      const theirs: PageDetail[] = [];
      for (const m of matches) {
        const f = await detail(m.url);
        // pages that render their content only with JavaScript show a few words to a plain fetch; comparing against them would mislead
        if (f && f.words >= 150) theirs.push(f);
      }
      const ours = it.ourUrl ? await detail(it.ourUrl) : null;
      const hostOfUrl = (u: string) => {
        try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
      };
      intents.push({
        ...it,
        competitorPages: theirs.map((t) => ({ url: t.url, title: t.title, host: hostOfUrl(t.url), observedAt: t.observedAt, words: t.words, hasTool: t.hasTool, tables: t.tables, hasFaqSchema: t.hasFaqSchema })),
        theyCover: topicGaps(ours, theirs),
        weDoBetter: ourStrengths(ours, theirs),
        gaps: theirs.flatMap((t) => featureGaps(ours, t)).slice(0, 3),
        observedAt: now.toISOString(),
      });
    }
  }

  // Pages that lost most of their visibility: is the loss deliberate (redirected, noindexed, canonicalised elsewhere)? Read-only, a few pages a week.
  const lossChecks: NonNullable<DeepIntel["lossChecks"]> = [];
  {
    // daily as well as weekly, so the daily check never records a loss the weekly report would reject as deliberate
    const lossUrls = [
      ...(parts.pages28?.declining ?? []).filter((m) => m.imprPrev >= 300 && m.imprCur < m.imprPrev * 0.3).slice(0, 3).map((m) => m.key),
      ...templateLosses(sectionStats(p28cur, p28prev, 20)).slice(0, 2).flatMap((t) => (parts.pages28?.declining ?? []).filter((m) => sectionOf(m.key) === t.section).slice(0, 2).map((m) => m.key)),
    ];
    for (const u of [...new Set(lossUrls)].slice(0, 6)) {
      if (!isSafePublicUrl(u)) continue;
      const r = await safeFetchText(u, { timeoutMs: 8000, maxBytes: 400_000 });
      const robots = r.ok ? `${r.body.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? ""} ${r.headers.get("x-robots-tag") ?? ""}`.toLowerCase() : "";
      lossChecks.push({ url: u, status: r.ok ? r.status : null, finalUrl: r.ok ? r.finalUrl : u, indexable: r.ok && r.status < 400 && !/noindex/.test(robots), canonical: r.ok ? (r.body.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? "") : "" });
    }
  }

  // Legitimate listing and partnership prospects GravyBlock's authority research already qualified (public pages, with dates). Owner action only:
  // unsolicited outreach stays paused.
  const partners = rowsOf<{ source_name: string; url: string | null; relevance_note: string | null; created_at: string }>(await db.execute(sql`
    select source_name, coalesce(evidence_url, target_url) url, relevance_note, created_at from backlink_opportunities
    where business_id = ${businessId} and status = 'qualified' order by quality_score desc nulls last, created_at desc limit 4`))
    .filter((p) => p.url)
    .map((p) => ({ name: p.source_name, url: p.url!, note: (p.relevance_note ?? "").replace(/\s+/g, " ").slice(0, 160), foundAt: new Date(p.created_at).toISOString().slice(0, 10) }));

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
    googleBrand,
    appearances,
    surfaces,
    queries90,
    seasonalAhead: seasonal,
    templateLosses: templateLosses(sectionStats(p28cur, p28prev, 20)),
    coverage,
    inventory,
    intents,
    partners,
    lossChecks,
    stage: stageInfo,
    launch: launching && profile && demand.uncaptured.length
      ? buildLaunchPlan({
          stage: stageInfo.stage,
          reason: stageInfo.reason,
          clusters: demand.uncaptured.map((g) => ({ label: g.label, queries: g.queries, intent: g.intent ?? "informational", score: g.strength?.score ?? 0, level: g.strength?.level ?? "weak", ourPage: g.existingPage ? { url: g.existingPage.url, covers: g.existingPage.covers } : null, competitorPages: g.competitorPages.map((c) => ({ url: c.url, title: c.title })) })),
          valuableSections: profile.valuableSections,
          conversion: profile.conversions[0] ?? "the main next step",
          gscConnected: Boolean(token && property),
        })
      : null,
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

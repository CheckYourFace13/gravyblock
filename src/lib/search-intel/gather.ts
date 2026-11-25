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

async function competitorSection(businessId: string, website: string | null, rows: Row[], observedAtIso: string): Promise<SiteIntel["competitors"]> {
  const db = getDb()!;
  const notes: string[] = [];
  const known = rowsOf<{ name: string; website: string | null }>(await db.execute(sql`select name, website from business_competitors where business_id = ${businessId} and status = 'active' and website is not null order by created_at desc limit 6`))
    .filter((c): c is { name: string; website: string } => !!c.website && !!isSafePublicUrl(c.website));
  const result: SiteIntel["competitors"] = { observedAt: observedAtIso, known: known.map((k) => ({ name: k.name, website: k.website })), sitemapsRead: 0, pagesObserved: 0, baselineEstablishedToday: [], newPages: [], queries: [], notes };
  if (!known.length) {
    notes.push("No competitors are on record for this site yet, so no competitor observation was made. The competitor discovery engine adds them monthly.");
    return result;
  }
  const hostOf = (u: string) => new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  const urlsByHost = new Map<string, string[]>();
  const hostsWithBaseline = new Set<string>();
  const earlier = rowsOf<{ host: string }>(await db.execute(sql`select distinct competitor_host host from competitor_page_observations where business_id = ${businessId}`));
  for (const e of earlier) hostsWithBaseline.add(e.host);

  for (const c of known) {
    const host = hostOf(c.website);
    const origin = new URL(c.website).origin;
    const sm = await safeFetchText(`${origin}/sitemap.xml`, { timeoutMs: 8000, maxBytes: 1_500_000 });
    if (!sm.ok || sm.status >= 400) {
      notes.push(`${host}: sitemap not readable, so its pages were not observed.`);
      continue;
    }
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
    const pages = entries.filter((e) => !e.isIndex && (() => { try { return hostOf(e.loc) === host; } catch { return false; } })()).slice(0, 1500);
    const urls = pages.map((p) => p.loc);
    if (!urls.length) continue;
    result.sitemapsRead++;
    urlsByHost.set(host, urls);
    result.pagesObserved += urls.length;
    if (!hostsWithBaseline.has(host)) result.baselineEstablishedToday.push(host);
    for (let i = 0; i < pages.length; i += 300) {
      const chunk = pages.slice(i, i + 300);
      await db.execute(sql`insert into competitor_page_observations (business_id, competitor_host, url, lastmod) values ${sql.join(chunk.map((e) => sql`(${businessId}, ${host}, ${e.loc}, ${e.lastmod ? e.lastmod.toISOString().slice(0, 10) : null})`), sql`, `)}
        on conflict (business_id, url) do update set last_seen = now(), lastmod = excluded.lastmod`);
    }
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
    if (!matches.length) notes.push(`"${query}": none of the ${known.length} known competitors publishes a page whose address matches this query, so no comparison was made.`);
  }
  return result;
}

export async function gatherSearchIntel(businessId: string, now = new Date()): Promise<SiteIntel | null> {
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
    for (const [label, c] of [["7-day", parts.w7], ["28-day", parts.w28]] as const) {
      if (c?.sample === "low") dataQualityNotes.push(`${label} comparison is low-sample (very few clicks and impressions); treat movements as noise.`);
      if (c?.sample === "missing") dataQualityNotes.push(`${label} comparison is missing days of data in one window.`);
    }
  }

  const [dr] = rowsOf<{ evidence: { lostPages?: number; priorPages?: number; impressionsBefore?: number; impressionsNow?: number; reading?: string; sample?: string[] } | null }>(await db.execute(sql`
    select evidence from growth_opportunities where business_id = ${businessId} and subtype = 'search_pages_dropped' order by created_at desc limit 1`));
  const rechecks = (await latestIndexRechecks(businessId, 3)).map((r) => ({ at: r.createdAt.toISOString(), verdicts: (r.payload as { verdicts?: Record<string, number> } | null)?.verdicts ?? {} }));
  const indexing: SiteIntel["indexing"] = {
    dropped: dr?.evidence?.lostPages ? { lost: Number(dr.evidence.lostPages), before: Number(dr.evidence.priorPages ?? 0), impressionsBefore: Number(dr.evidence.impressionsBefore ?? 0), impressionsNow: Number(dr.evidence.impressionsNow ?? 0), reading: dr.evidence.reading ?? null, sample: dr.evidence.sample ?? [] } : null,
    rechecks,
    notes: dr?.evidence?.lostPages ? [] : ["No pages-dropped finding is open for this site."],
  };

  const briefRows = rowsOf<{ t: string; subtype: string | null; imp: number; conf: number; evidence: unknown }>(await db.execute(sql`
    select opportunity_type t, subtype, expected_impact imp, confidence conf, evidence from growth_opportunities
    where business_id = ${businessId} and status = 'open' and required_capability = 'website_write' and opportunity_type in ('existing_page_seo','schema','ctr','technical','conversion','content_gap','internal_link')
    order by (expected_impact * confidence) desc limit 40`));
  const seenText = new Set<string>();
  const openBriefs: SiteIntel["openBriefs"] = [];
  for (const b of briefRows) {
    const text = (briefEvidence(b.subtype, b.evidence) ?? JSON.stringify(b.evidence ?? "")).replace(/\s+/g, " ").slice(0, 260);
    if (b.subtype === "search_pages_dropped" || b.subtype === "search_low_ctr") continue; // already covered with fresher numbers above
    if (seenText.has(text)) continue;
    seenText.add(text);
    openBriefs.push({ type: b.t, subtype: b.subtype, impact: Number(b.imp), text });
    if (openBriefs.length >= 8) break;
  }

  const [au] = rowsOf<{ qualified: number; contacted: number; acquired: number }>(await db.execute(sql`
    select count(*) filter (where status = 'qualified')::int qualified, count(*) filter (where status in ('contacted', 'followed_up'))::int contacted, count(*) filter (where status = 'acquired')::int acquired from backlink_opportunities where business_id = ${businessId}`));

  const competitors = await competitorSection(businessId, biz.website, rows, now.toISOString());
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
  };
  intel.changes = parts.w28 && parts.bands ? changesSince(prevReport?.data ?? null, { w28: parts.w28, bands: { b4_10: parts.bands.b4_10 } }) : ["No search data this week, so nothing can be compared with the previous report."];
  if (prevReport?.data && competitors.newPages.length) intel.changes.push(`${competitors.newPages.length} competitor page(s) first observed this week (listed below).`);
  return intel;
}

/**
 * Search Console findings turned into queue opportunities for the EXISTING engine. House discovery used to fetch Search Console data and then never read it
 * (the older finder only ran inside the customer WordPress batch), so a forced cycle produced nothing. This reads the stored page and query rows, classifies each
 * page by ranking band, trend and seasonality, and records:
 *   - off-site "backlink" opportunities for pages that already rank (positions 4 to 40): the outreach engine points its pitches at these pages;
 *   - "ctr" opportunities for pages that rank in the top 3 but are clicked far less than that position normally earns (an on-site fix: a brief for the site's own agent);
 *   - one "technical" opportunity when most of a site's ranking pages disappeared from search (an on-site problem: a brief for the site's own agent).
 * Nothing here writes to any site. A backlink is NOT assumed to raise a ranking: confidence is capped, and the result is judged on that page's own clicks and
 * impressions after the evaluation window (the existing measurement evaluator), never on the act itself.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb, pagePerformance } from "@/lib/db";
import { gscWindows } from "@/lib/seo/existing-pages";
import { getFreshAccessToken, getGoogleConnection } from "@/lib/integrations/google-oauth";
import { buildMeasurementPlan } from "./measurement";
import { markActed, recordOpportunity } from "./queue";
import type { OpportunityCandidate } from "./types";

export type PageRow = { pageUrl: string; query: string; clicks: number; impressions: number; position: number };
export type Band = "top3" | "near_page_one" | "page_two" | "long_tail" | "deep";

export function bandOf(position: number): Band {
  if (position < 4) return "top3";
  if (position <= 10) return "near_page_one";
  if (position <= 20) return "page_two";
  if (position <= 40) return "long_tail";
  return "deep";
}

const CTR_BY_POSITION = [0, 0.3, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
export function expectedCtr(position: number): number {
  const p = Math.max(1, Math.round(position));
  if (p <= 10) return CTR_BY_POSITION[p]!;
  if (p <= 20) return 0.01;
  if (p <= 30) return 0.005;
  return 0.002;
}

export const normPage = (u: string): string => u.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();

export type PageStat = {
  page: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  band: Band;
  topQuery: string;
  topQueryShare: number;
  prevImpressions: number;
  prevClicks: number;
  /** Change in impressions against the earlier window as a percentage; null when the page had no earlier data. */
  trendPct: number | null;
  /** One query supplies most of the impressions and the page jumped or is new: most likely a seasonal or one-off spike, not durable traction. */
  seasonal: boolean;
};

export function aggregatePages(cur: PageRow[], prev: PageRow[]): PageStat[] {
  const group = (rows: PageRow[]) => {
    const m = new Map<string, { page: string; impressions: number; clicks: number; posWeighted: number; byQuery: Map<string, number> }>();
    for (const r of rows) {
      if (/[?#]/.test(r.pageUrl)) continue;
      const k = normPage(r.pageUrl);
      const e = m.get(k) ?? { page: r.pageUrl, impressions: 0, clicks: 0, posWeighted: 0, byQuery: new Map() };
      e.impressions += r.impressions;
      e.clicks += r.clicks;
      e.posWeighted += r.position * r.impressions;
      e.byQuery.set(r.query, (e.byQuery.get(r.query) ?? 0) + r.impressions);
      m.set(k, e);
    }
    return m;
  };
  const c = group(cur);
  const p = group(prev);
  const out: PageStat[] = [];
  for (const [k, e] of c) {
    if (e.impressions <= 0) continue;
    const before = p.get(k);
    const [topQuery, topImps] = [...e.byQuery.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    const position = e.posWeighted / e.impressions;
    const trendPct = before && before.impressions > 0 ? Math.round(((e.impressions - before.impressions) / before.impressions) * 100) : null;
    const share = topImps / e.impressions;
    out.push({
      page: e.page,
      impressions: e.impressions,
      clicks: e.clicks,
      ctr: e.clicks / e.impressions,
      position,
      band: bandOf(position),
      topQuery,
      topQueryShare: share,
      prevImpressions: before?.impressions ?? 0,
      prevClicks: before?.clicks ?? 0,
      trendPct,
      seasonal: share >= 0.6 && e.impressions >= 200 && (trendPct === null || trendPct >= 100),
    });
  }
  return out;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

/** The queue candidate for one page, or null when the page is not worth off-site or on-site effort. */
export function toCandidate(businessId: string, s: PageStat, windowStart: string): OpportunityCandidate | null {
  const evidence = {
    url: s.page,
    query: s.topQuery,
    position: Number(s.position.toFixed(1)),
    impressions: s.impressions,
    clicks: s.clicks,
    ctr: Number(s.ctr.toFixed(4)),
    band: s.band,
    trendPct: s.trendPct,
    prevImpressions: s.prevImpressions,
    seasonal: s.seasonal,
    windowStart,
  };
  if (s.band === "top3") {
    // Already winning the ranking. The only upside is clicks: act only when clicks are far below what that position normally earns.
    if (s.impressions < 100 || s.ctr >= 0.6 * expectedCtr(s.position)) return null;
    const lost = s.impressions * (expectedCtr(s.position) - s.ctr);
    return { businessId, opportunityType: "ctr", subtype: "search_low_ctr", engine: "search_console", evidence: { ...evidence, note: "ranks in the top 3 but is clicked far less than that position normally earns; a title or snippet change on the site itself" }, valueClass: "growth", expectedImpact: clamp(25 + Math.sqrt(lost) * 5, 0, 85), confidence: 60, cost: 2, risk: 2, requiredCapability: "website_write", autoEligible: false, ttlDays: 30, dedupeKey: `search:${businessId}:${normPage(s.page)}:ctr:${windowStart}` };
  }
  if (s.band === "deep" || s.impressions < 50 || (s.band === "long_tail" && s.impressions < 100)) return null;
  const potential = Math.max(0, s.impressions * (expectedCtr(s.position - 3) - s.ctr));
  if (potential < 1) return null;
  const base = s.band === "near_page_one" ? { impact: 30 + Math.sqrt(potential) * 6, conf: 55, cap: 90 } : s.band === "page_two" ? { impact: 20 + Math.sqrt(potential) * 5, conf: 40, cap: 70 } : { impact: 10 + Math.sqrt(potential) * 3, conf: 25, cap: 40 };
  let impact = Math.min(base.cap, base.impact);
  let confidence = base.conf;
  if (s.trendPct !== null && s.trendPct >= 50) confidence += 8; // momentum
  if (s.trendPct !== null && s.trendPct <= -40 && s.prevImpressions >= 100) { impact *= 0.8; confidence -= 10; } // fading
  if (s.seasonal) confidence = Math.min(confidence, 30); // do not read a seasonal spike as durable traction
  return {
    businessId,
    opportunityType: "backlink",
    subtype: `search_${s.band}${s.seasonal ? "_seasonal" : ""}`,
    engine: "search_console",
    evidence: { ...evidence, note: "a link to this page is NOT assumed to raise its ranking; the result is judged on this page's own clicks and impressions after the evaluation window" },
    valueClass: "growth",
    expectedImpact: clamp(impact, 0, 100),
    confidence: clamp(confidence, 5, 62),
    cost: 3,
    risk: 2,
    requiredCapability: "authority_contact",
    autoEligible: true,
    ttlDays: 30,
    dedupeKey: `search:${businessId}:${normPage(s.page)}:${s.band}:${windowStart}`,
  };
}

export type DroppedPages = { priorPages: number; lostPages: number; lostShare: number; impressionsBefore: number; impressionsNow: number; clicksOnLostPages: number; byPathPrefix: Array<{ prefix: string; before: number; lost: number }>; sample: string[] };

const prefixOf = (u: string): string => {
  try {
    const seg = new URL(u).pathname.split("/").filter(Boolean)[0];
    return seg ? `/${seg}` : "/";
  } catch {
    return "?";
  }
};

/** Google's reason a page is not in the index, grouped by what it means for the owner. */
export function classifyExclusion(coverage: string | null, indexing: string | null): "noindex_tag" | "crawled_not_indexed" | "blocked_other" | "indexed" | "unknown" {
  const c = (coverage ?? "").toLowerCase();
  if (indexing === "BLOCKED_BY_META_TAG" || c.includes("noindex")) return "noindex_tag";
  if (c.includes("crawled") && c.includes("not indexed")) return "crawled_not_indexed";
  if (c.includes("submitted and indexed") || c.includes("indexed, not submitted") || c === "indexed") return "indexed";
  if (c.includes("blocked") || c.includes("robots") || c.includes("redirect") || c.includes("404") || c.includes("soft")) return "blocked_other";
  return "unknown";
}

/** Most of a site's ranking pages vanished from search between two windows: an indexing or quality problem on the site, not a ranking slide. */
export function detectDroppedPages(cur: PageRow[], prev: PageRow[]): DroppedPages | null {
  const pages = (rows: PageRow[]) => {
    const m = new Map<string, { page: string; imps: number; clicks: number }>();
    for (const r of rows) {
      if (/[?#]/.test(r.pageUrl)) continue;
      const k = normPage(r.pageUrl);
      const e = m.get(k) ?? { page: r.pageUrl, imps: 0, clicks: 0 };
      e.imps += r.impressions;
      e.clicks += r.clicks;
      m.set(k, e);
    }
    return m;
  };
  const c = pages(cur);
  const p = pages(prev);
  if (p.size < 40) return null;
  const lost = [...p.entries()].filter(([k]) => !c.has(k)).sort((a, b) => b[1].imps - a[1].imps);
  const before = [...p.values()].reduce((s, x) => s + x.imps, 0);
  const now = [...c.values()].reduce((s, x) => s + x.imps, 0);
  const share = lost.length / p.size;
  if (share < 0.6 || now > before * 0.5) return null;
  const groups = new Map<string, { before: number; lost: number }>();
  for (const [k, v] of p) {
    const g = groups.get(prefixOf(v.page)) ?? { before: 0, lost: 0 };
    g.before++;
    if (!c.has(k)) g.lost++;
    groups.set(prefixOf(v.page), g);
  }
  // A varied sample: the biggest losers first, one per URL section, so one template cannot hide another.
  const seen = new Set<string>();
  const sample: string[] = [];
  for (const [, v] of lost) {
    const g = prefixOf(v.page);
    if (seen.has(g) && sample.length >= 3) continue;
    seen.add(g);
    sample.push(v.page);
    if (sample.length >= 6) break;
  }
  return {
    priorPages: p.size, lostPages: lost.length, lostShare: Number(share.toFixed(2)), impressionsBefore: before, impressionsNow: now,
    clicksOnLostPages: lost.reduce((s, [, v]) => s + v.clicks, 0),
    byPathPrefix: [...groups.entries()].map(([prefix, g]) => ({ prefix, ...g })).sort((a, b) => b.lost - a.lost).slice(0, 6),
    sample,
  };
}

/** Google's own view of a few pages that disappeared (read-only URL Inspection, covered by the existing Search Console grant). */
export async function inspectSample(businessId: string, pages: string[]): Promise<Array<{ page: string; coverage: string | null; indexing: string | null }>> {
  const conn = await getGoogleConnection(businessId).catch(() => null);
  const token = await getFreshAccessToken(businessId).catch(() => null);
  if (!conn?.searchConsoleProperty || !token) return [];
  const out: Array<{ page: string; coverage: string | null; indexing: string | null }> = [];
  for (const page of pages.slice(0, 6)) {
    try {
      const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ inspectionUrl: page, siteUrl: conn.searchConsoleProperty }) });
      const j = (await res.json()) as { inspectionResult?: { indexStatusResult?: { coverageState?: string; indexingState?: string } } };
      out.push({ page, coverage: j.inspectionResult?.indexStatusResult?.coverageState ?? null, indexing: j.inspectionResult?.indexStatusResult?.indexingState ?? null });
    } catch {
      out.push({ page, coverage: null, indexing: null });
    }
  }
  return out;
}

const PHRASE_DROP = new Set("how what why when where which who is are was can does do the a an of to for in on at and or with from your you my our me near best top current latest new free online recipe recipes guide tips ideas".split(" "));

/**
 * What the site is actually found for, in the searcher's own words: its top non-brand queries by impressions, reduced to the topic words
 * ("how to brine a turkey" becomes "brine turkey"). Used to aim off-site prospecting at the right audience instead of a stored category label.
 */
export function topicPhrases(rows: PageRow[], nameWords: string[], domainLabel = "", max = 3): string[] {
  const name = nameWords.map((w) => w.toLowerCase()).filter((w) => w.length >= 3);
  const label = domainLabel.toLowerCase();
  const byQuery = new Map<string, number>();
  for (const r of rows) byQuery.set(r.query.toLowerCase(), (byQuery.get(r.query.toLowerCase()) ?? 0) + r.impressions);
  const out: Array<{ phrase: string; words: Set<string> }> = [];
  for (const [q, imps] of [...byQuery.entries()].sort((a, b) => b[1] - a[1])) {
    if (imps < 20 || out.length >= max) break;
    const tokens = q.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
    // A branded or navigational query says nothing about the topic. Branded means the whole brand name or the domain label, never one shared word
    // (a site called "Outbreak Threat" is still found for "norovirus outbreak map").
    const branded = (label.length >= 4 && (tokens.includes(label) || q.replace(/\s+/g, "").includes(label))) || (name.length > 0 && name.every((w) => tokens.includes(w)));
    if (branded) continue;
    const kept = tokens.filter((t) => !PHRASE_DROP.has(t) && !/^\d+$/.test(t) && t.length >= 3);
    if (kept.length < 1 || kept.length > 4) continue;
    const words = new Set(kept.map((w) => w.replace(/(ing|es|s)$/, "")));
    if (out.some((o) => [...words].filter((w) => o.words.has(w)).length / words.size >= 0.5)) continue; // same topic as one already chosen
    out.push({ phrase: kept.join(" "), words });
  }
  return out.map((o) => o.phrase);
}

export async function searchTopics(businessId: string): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const { current } = gscWindows();
  const rows = await db.select().from(pagePerformance).where(and(eq(pagePerformance.businessId, businessId), eq(pagePerformance.periodStart, current.start)));
  if (!rows.length) return [];
  const [b] = (await db.execute(sql`select name, website from businesses where id = ${businessId}::uuid`)) as unknown as Array<{ name: string; website: string | null }>;
  const domainLabel = (b?.website ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").split(".")[0] ?? "";
  const nameWords = (b?.name ?? "").toLowerCase().split(/[^a-z0-9]+/);
  return topicPhrases(rows.map((r) => ({ pageUrl: r.pageUrl, query: r.query, clicks: r.clicks, impressions: r.impressions, position: r.position })), nameWords, domainLabel);
}

const MAX_PER_SITE = 5;
const REACT_COOLDOWN_DAYS = 45;

export async function discoverSearchOpportunities(businessId: string): Promise<{ pages: number; recorded: number; skippedRecentlyActed: number; dropped: boolean }> {
  const db = getDb();
  const none = { pages: 0, recorded: 0, skippedRecentlyActed: 0, dropped: false };
  if (!db) return none;
  const { current, prior } = gscWindows();
  const rows = await db.select().from(pagePerformance).where(and(eq(pagePerformance.businessId, businessId), sql`${pagePerformance.periodStart} in (${current.start}, ${prior.start})`));
  const toRow = (r: (typeof rows)[number]): PageRow => ({ pageUrl: r.pageUrl, query: r.query, clicks: r.clicks, impressions: r.impressions, position: r.position });
  const cur = rows.filter((r) => r.periodStart === current.start).map(toRow);
  const prev = rows.filter((r) => r.periodStart === prior.start).map(toRow);
  if (!cur.length && !prev.length) return none;

  let recorded = 0;
  let skipped = 0;
  const candidates = aggregatePages(cur, prev)
    .map((s) => toCandidate(businessId, s, current.start))
    .filter((c): c is OpportunityCandidate => c !== null)
    .sort((a, b) => b.expectedImpact * b.confidence - a.expectedImpact * a.confidence)
    .slice(0, MAX_PER_SITE);
  for (const c of candidates) {
    // Never re-queue a page that was already acted on or measured recently (a new window would otherwise mint a fresh key for the same page).
    const key = `search:${businessId}:${normPage((c.evidence as { url: string }).url)}:%`;
    const [recent] = (await db.execute(sql`select 1 from growth_opportunities where business_id = ${businessId}::uuid and dedupe_key like ${key} and status <> 'open' and coalesce(acted_at, created_at) > now() - make_interval(days => ${REACT_COOLDOWN_DAYS}) limit 1`)) as unknown as Array<unknown>;
    if (recent) { skipped++; continue; }
    if ((await recordOpportunity(c)).recorded) recorded++;
  }

  const dropped = detectDroppedPages(cur, prev);
  if (dropped) {
    const key = `search:${businessId}:site:pages_dropped:${prior.start}:v2`;
    const [exists] = (await db.execute(sql`select 1 from growth_opportunities where dedupe_key = ${key} limit 1`)) as unknown as Array<unknown>;
    if (!exists) {
      // the first version of this finding (fewer inspected pages, no breakdown) is superseded, not duplicated
      await db.execute(sql`update growth_opportunities set status = 'expired' where dedupe_key = ${`search:${businessId}:site:pages_dropped:${prior.start}`} and status = 'open'`);
      const inspected = await inspectSample(businessId, dropped.sample);
      const verdicts = { noindex_tag: 0, crawled_not_indexed: 0, blocked_other: 0, indexed: 0, unknown: 0 } as Record<string, number>;
      for (const i of inspected) verdicts[classifyExclusion(i.coverage, i.indexing)]++;
      const r = await recordOpportunity({
        businessId, opportunityType: "technical", subtype: "search_pages_dropped", engine: "search_console",
        evidence: {
          ...dropped, inspected, verdicts,
          priority: "high",
          reading: verdicts.noindex_tag > 0
            ? "These pages EARNED search impressions and clicks before and now carry a noindex tag. Pages that earn traffic are valuable by definition, so confirm the tag is intended; if a template or plugin added it by mistake, removing it is the fix."
            : "These pages earned impressions before and Google now reports them as crawled but not indexed (a quality or duplication judgement, not a tag). Look for thin or near-duplicate template pages and consider consolidating or improving them.",
          note: "most pages that earned impressions in the earlier window earn none now; Google's own status for sampled pages is in 'inspected'",
        },
        valueClass: "growth", expectedImpact: 95, confidence: 75, cost: 2, risk: 1, requiredCapability: "website_write", autoEligible: false, ttlDays: 60, dedupeKey: key,
      });
      if (r.recorded) recorded++;
    }
  }
  return { pages: cur.length, recorded, skippedRecentlyActed: skipped, dropped: Boolean(dropped) };
}

/**
 * Called when the outreach engine sends a pitch for a page: the matching open search opportunity is marked acted, with a measurement plan on that page's clicks.
 * The existing evaluator reads the page's clicks after the window; nothing is claimed before then.
 */
export async function markSearchOpportunityActed(businessId: string, assetUrl: string, actionId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    const key = `search:${businessId}:${normPage(assetUrl)}:%`;
    const [opp] = (await db.execute(sql`select dedupe_key, evidence from growth_opportunities where business_id = ${businessId}::uuid and dedupe_key like ${key} and status = 'open' order by created_at desc limit 1`)) as unknown as Array<{ dedupe_key: string; evidence: { clicks?: number } | null }>;
    if (!opp) return;
    await markActed(opp.dedupe_key, { actionId, verificationStatus: "unverified", measurementPlan: buildMeasurementPlan("existing_page_seo", Number(opp.evidence?.clicks ?? 0), "28d page clicks") });
  } catch (err) {
    console.error("[search-driven] mark acted failed", err instanceof Error ? err.message : String(err));
  }
}

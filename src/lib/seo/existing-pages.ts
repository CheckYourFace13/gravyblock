/**
 * Existing-page SEO engine. Uses the customer's own Search Console data to find
 * pages worth improving, makes SAFE ADDITIVE edits via their WordPress
 * Application Password (a grounded FAQ section + internal links; a title tweak
 * only on posts GravyBlock itself published), verifies the live page, reverts if
 * unverified, then re-measures 28 days later. Proof is recorded ONLY when the
 * re-measurement shows a real gain; an edit alone is never proof.
 *
 * Nothing here throws out of the batch entry points. Missing Google or a
 * missing WordPress target degrades gracefully (fetch/snapshot only, no edits).
 */

import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import { businesses, getDb, googleOauthConnections, jobs, pagePerformance, publishedContent, publishingTargets } from "@/lib/db";
import { getFreshAccessToken, getGoogleConnection } from "@/lib/integrations/google-oauth";
import { MODELS, openRouterChat } from "@/lib/integrations/openrouter";
import type { WordPressConfig } from "@/lib/integrations/wordpress";
import { containsPlaceholderArtifact } from "@/lib/content-gen/quality-guard";
import { safeFetchText } from "@/lib/net/safe-fetch";
import { recordProof } from "@/lib/proof/ledger";
import { ensureFreshTruth } from "@/lib/truth";
import { findContentByUrl, updateContent } from "@/lib/wordpress/admin";

const DAY = 86_400_000;
const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];
const BUSINESS_BUDGET_MS = 60_000;
const ACTION_COOLDOWN_DAYS = 28;
const MAX_ACTIONS_PER_RUN = 2;
const FETCH_FRESH_HOURS = 20;

// ── Types ────────────────────────────────────────────────────────────────────

export type OpportunityKind = "near_page_one" | "low_ctr" | "click_drop" | "cannibalization";

export type Opportunity = {
  kind: OpportunityKind;
  pageUrl: string;
  query: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  score: number;
  /** Cannibalization: the customer's other page competing for the same query. */
  relatedUrl?: string;
  detail: string;
};

type Metrics = { clicks: number; impressions: number; ctr: number; position: number };
type Window = { start: string; end: string };

type GscRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };

// ── Helpers ──────────────────────────────────────────────────────────────────

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Current = 28 days ending 3 days ago; prior = the 28 days before that. */
export function gscWindows(now = new Date()): { current: Window; prior: Window } {
  const curEnd = new Date(now.getTime() - 3 * DAY);
  const curStart = new Date(curEnd.getTime() - 27 * DAY);
  const priorEnd = new Date(curStart.getTime() - DAY);
  const priorStart = new Date(priorEnd.getTime() - 27 * DAY);
  return { current: { start: isoDay(curStart), end: isoDay(curEnd) }, prior: { start: isoDay(priorStart), end: isoDay(priorEnd) } };
}

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

async function gscQuery(
  accessToken: string,
  property: string,
  win: Window,
  dimensions: string[],
  opts: { pageEquals?: string; rowLimit?: number } = {},
): Promise<GscRow[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        startDate: win.start,
        endDate: win.end,
        dimensions,
        rowLimit: opts.rowLimit ?? 1000,
        ...(opts.pageEquals ? { dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "equals", expression: opts.pageEquals }] }] } : {}),
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { rows?: GscRow[] };
    return json.rows ?? [];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Aggregate page+query rows the same way for "before" and "after" (impression-weighted position). */
function aggregate(rows: GscRow[]): Metrics & { topQuery: string | null } {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  let top: { q: string; i: number } | null = null;
  for (const r of rows) {
    const c = r.clicks ?? 0;
    const i = r.impressions ?? 0;
    clicks += c;
    impressions += i;
    weighted += (r.position ?? 0) * i;
    const q = r.keys?.[1] ?? r.keys?.[0] ?? "";
    if (q && (!top || i > top.i)) top = { q, i };
  }
  return {
    clicks: Math.round(clicks),
    impressions: Math.round(impressions),
    ctr: impressions ? Number((clicks / impressions).toFixed(4)) : 0,
    position: impressions ? Number((weighted / impressions).toFixed(2)) : 0,
    topQuery: top?.q ?? null,
  };
}

function sameHost(a: string, b: string): boolean {
  try {
    const n = (h: string) => h.replace(/^www\./i, "").toLowerCase();
    return n(new URL(a).hostname) === n(new URL(b).hostname);
  } catch {
    return false;
  }
}

export async function getWordPressTarget(businessId: string): Promise<WordPressConfig | null> {
  const db = getDb();
  if (!db) return null;
  const [t] = await db
    .select({ config: publishingTargets.config })
    .from(publishingTargets)
    .where(and(eq(publishingTargets.businessId, businessId), eq(publishingTargets.adapter, "wordpress"), eq(publishingTargets.active, "true")))
    .limit(1);
  const c = t?.config as Partial<WordPressConfig> | null | undefined;
  if (!c?.siteUrl || !c.username || !c.appPassword) return null;
  return { siteUrl: c.siteUrl, username: c.username, appPassword: c.appPassword };
}

// ── (a) Fetch Search Console page+query data ─────────────────────────────────

export async function fetchGscPageQuery(businessId: string): Promise<{ connected: boolean; fetched?: boolean; skipped?: boolean; rows?: number; reason?: string }> {
  try {
    const db = getDb();
    if (!db) return { connected: false, reason: "no_db" };
    const conn = await getGoogleConnection(businessId);
    if (!conn?.searchConsoleProperty) return { connected: false, reason: conn ? "no_property" : "no_google" };
    const token = await getFreshAccessToken(businessId);
    if (!token) return { connected: false, reason: "no_token" };

    const { current, prior } = gscWindows();
    const [latest] = await db
      .select({ fetchedAt: pagePerformance.fetchedAt })
      .from(pagePerformance)
      .where(and(eq(pagePerformance.businessId, businessId), eq(pagePerformance.periodStart, current.start)))
      .orderBy(desc(pagePerformance.fetchedAt))
      .limit(1);
    if (latest && Date.now() - latest.fetchedAt.getTime() < FETCH_FRESH_HOURS * 3_600_000) {
      return { connected: true, fetched: false, skipped: true };
    }

    const [curRows, priorRows] = await Promise.all([
      gscQuery(token, conn.searchConsoleProperty, current, ["page", "query"]),
      gscQuery(token, conn.searchConsoleProperty, prior, ["page", "query"]),
    ]);
    if (!curRows) return { connected: true, fetched: false, reason: "gsc_query_failed" };

    const toValues = (rows: GscRow[], win: Window) =>
      rows
        .filter((r) => r.keys?.[0] && r.keys?.[1])
        .map((r) => ({
          businessId,
          pageUrl: r.keys![0]!,
          query: r.keys![1]!,
          clicks: Math.round(r.clicks ?? 0),
          impressions: Math.round(r.impressions ?? 0),
          ctr: r.ctr ?? 0,
          position: r.position ?? 0,
          periodStart: win.start,
          periodEnd: win.end,
        }));

    // Replace only windows we actually fetched, so a failed prior fetch keeps old prior data.
    const starts = [current.start, ...(priorRows ? [prior.start] : [])];
    await db.delete(pagePerformance).where(and(eq(pagePerformance.businessId, businessId), inArray(pagePerformance.periodStart, starts)));
    const all = [...toValues(curRows, current), ...(priorRows ? toValues(priorRows, prior) : [])];
    for (let i = 0; i < all.length; i += 500) await db.insert(pagePerformance).values(all.slice(i, i + 500));
    return { connected: true, fetched: true, rows: all.length };
  } catch (err) {
    console.error("[existing-pages] fetchGscPageQuery failed", { businessId, error: err instanceof Error ? err.message : String(err) });
    return { connected: false, reason: "error" };
  }
}

// ── (b) Opportunities ────────────────────────────────────────────────────────

const CTR_BY_POSITION = [0, 0.3, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
function expectedCtr(position: number): number {
  const p = Math.max(1, Math.round(position));
  if (p <= 10) return CTR_BY_POSITION[p]!;
  if (p <= 20) return 0.01;
  if (p <= 30) return 0.005;
  return 0.002;
}

export async function findOpportunities(businessId: string): Promise<Opportunity[]> {
  const db = getDb();
  if (!db) return [];
  const { current, prior } = gscWindows();
  const rows = await db
    .select()
    .from(pagePerformance)
    .where(and(eq(pagePerformance.businessId, businessId), inArray(pagePerformance.periodStart, [current.start, prior.start])));
  const cur = rows.filter((r) => r.periodStart === current.start);
  const prev = rows.filter((r) => r.periodStart === prior.start);
  if (!cur.length) return [];

  const usable = (u: string) => !/[?#]/.test(u) && (() => { try { return new URL(u).pathname.length > 1; } catch { return false; } })();
  const priorPages = new Set(prev.map((r) => r.pageUrl));
  const evidence = (page: string) => (priorPages.has(page) ? 1 : 0.5);
  const conf = (impr: number) => Math.min(1, impr / 200);
  const best = new Map<string, Opportunity>();
  const offer = (o: Opportunity) => {
    const b = best.get(o.pageUrl);
    if (!b || o.score > b.score) best.set(o.pageUrl, o);
  };

  for (const r of cur) {
    if (!usable(r.pageUrl)) continue;
    const base = { pageUrl: r.pageUrl, query: r.query, position: r.position, impressions: r.impressions, clicks: r.clicks, ctr: r.ctr };
    if (r.position >= 4 && r.position <= 20 && r.impressions >= 30) {
      const gap = Math.max(0.005, expectedCtr(r.position - 3) - r.ctr);
      offer({ ...base, kind: "near_page_one", score: r.impressions * gap * conf(r.impressions) * evidence(r.pageUrl), detail: `position ${r.position.toFixed(1)} with ${r.impressions} impressions` });
    }
    if (r.impressions >= 100 && r.position >= 1 && r.ctr < 0.6 * expectedCtr(r.position)) {
      const gap = expectedCtr(r.position) - r.ctr;
      offer({ ...base, kind: "low_ctr", score: r.impressions * gap * conf(r.impressions) * evidence(r.pageUrl), detail: `CTR ${(r.ctr * 100).toFixed(1)}% vs ~${(expectedCtr(r.position) * 100).toFixed(1)}% expected at position ${r.position.toFixed(1)}` });
    }
  }

  // Page-level click drops (needs both windows).
  const sumBy = (list: typeof rows) => {
    const m = new Map<string, { clicks: number; impressions: number; top: { q: string; c: number } | null; pos: number }>();
    for (const r of list) {
      const e = m.get(r.pageUrl) ?? { clicks: 0, impressions: 0, top: null, pos: 0 };
      e.clicks += r.clicks;
      e.impressions += r.impressions;
      e.pos += r.position * r.impressions;
      if (!e.top || r.clicks > e.top.c) e.top = { q: r.query, c: r.clicks };
      m.set(r.pageUrl, e);
    }
    return m;
  };
  const curPages = sumBy(cur);
  const prevPages = sumBy(prev);
  for (const [page, p] of prevPages) {
    const c = curPages.get(page);
    if (!c || !usable(page) || p.clicks < 20 || c.impressions < 20) continue;
    if (c.clicks <= p.clicks * 0.7) {
      const lost = p.clicks - c.clicks;
      offer({
        kind: "click_drop",
        pageUrl: page,
        query: p.top?.q ?? "",
        position: c.impressions ? c.pos / c.impressions : 0,
        impressions: c.impressions,
        clicks: c.clicks,
        ctr: c.impressions ? c.clicks / c.impressions : 0,
        score: lost * conf(c.impressions) * 1,
        detail: `clicks fell from ${p.clicks} to ${c.clicks}`,
      });
    }
  }

  // Cannibalization: same query, 2+ of this customer's pages in the top 30.
  const byQuery = new Map<string, typeof cur>();
  for (const r of cur) {
    if (r.position > 30 || r.impressions < 20 || !usable(r.pageUrl)) continue;
    byQuery.set(r.query, [...(byQuery.get(r.query) ?? []), r]);
  }
  for (const [q, list] of byQuery) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.position - b.position);
    const strongest = sorted[0]!;
    const weaker = sorted[1]!;
    const gap = Math.max(0.005, expectedCtr(strongest.position) - weaker.ctr) * 0.5;
    offer({
      kind: "cannibalization",
      pageUrl: weaker.pageUrl,
      query: q,
      position: weaker.position,
      impressions: weaker.impressions,
      clicks: weaker.clicks,
      ctr: weaker.ctr,
      relatedUrl: strongest.pageUrl,
      score: weaker.impressions * gap * conf(weaker.impressions) * evidence(weaker.pageUrl),
      detail: `two pages rank for this query (positions ${strongest.position.toFixed(1)} and ${weaker.position.toFixed(1)})`,
    });
  }

  return [...best.values()].filter((o) => o.score > 0).sort((a, b) => b.score - a.score).slice(0, 50);
}

// ── (c) Act on one opportunity ───────────────────────────────────────────────

export type ActResult = { acted: boolean; reason?: string; jobId?: string; status?: string };

const STOP = new Set(["the", "and", "for", "with", "near", "best", "how", "what", "your", "you", "are", "can", "does", "cost", "from", "that", "this"]);

function mainWords(query: string): string[] {
  return [...new Set(query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)))];
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&#039;|&rsquo;/g, "'")
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, "-")
    .replace(/&quot;|&#8220;|&#8221;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function alnum(s: string): string {
  return s.toLowerCase().replace(/&#?\w+;/g, "").replace(/[^a-z0-9]/g, "");
}

function numbersIn(s: string): string[] {
  return (s.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,.]+$/, "").replace(/,/g, ""));
}

const CLAIM_WORDS = ["guarantee", "licensed", "insured", "award", "certified", "free estimate", "free quote", "years of experience", "24/7", "emergency", "same-day", "same day", "family-owned", "family owned", "warranty"];

/** Returns true when the generated text states something not grounded in the sources. */
function ungrounded(generated: string, sources: string): boolean {
  const src = sources.toLowerCase();
  const allowedNums = new Set(numbersIn(sources));
  if (numbersIn(generated).some((n) => !allowedNums.has(n))) return true;
  const g = generated.toLowerCase();
  return CLAIM_WORDS.some((w) => g.includes(w) && !src.includes(w));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wrap the first eligible plain-text occurrence of `phrase` in a link. Never touches existing anchors/headings/scripts. */
function linkFirstOccurrence(html: string, phrase: string, url: string): { html: string; done: boolean } {
  const parts = html.split(/(<!--[\s\S]*?-->|<[^>]+>)/);
  const re = new RegExp(`(?<![\\w])(${escapeRe(phrase)})(?![\\w])`, "i");
  let skip = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (p.startsWith("<")) {
      if (p.startsWith("<!--")) continue;
      const open = /^<(a|h[1-6]|script|style|button|code|pre|textarea)\b/i.test(p);
      const close = /^<\/(a|h[1-6]|script|style|button|code|pre|textarea)\b/i.test(p);
      if (open && !/\/>$/.test(p)) skip++;
      if (close) skip = Math.max(0, skip - 1);
      continue;
    }
    if (skip > 0) continue;
    const m = re.exec(p);
    if (m) {
      parts[i] = `${p.slice(0, m.index)}<a href="${escapeHtml(url)}">${m[1]}</a>${p.slice(m.index + m[1]!.length)}`;
      return { html: parts.join(""), done: true };
    }
  }
  return { html, done: false };
}

async function internalLinkCandidates(businessId: string, pageUrl: string, truthFacts: Array<{ key: string; value: string; sourceUrl: string | null }>, related?: string): Promise<Array<{ url: string; anchor: string }>> {
  const db = getDb();
  const out: Array<{ url: string; anchor: string }> = [];
  const ok = (u: string | null | undefined): u is string => {
    if (!u || !/^https:\/\//i.test(u) || /[?#]/.test(u)) return false;
    return sameHost(u, pageUrl) && u.replace(/\/+$/, "") !== pageUrl.replace(/\/+$/, "");
  };
  const goodAnchor = (a: string) => a.length >= 8 && a.length <= 70 && !containsPlaceholderArtifact(a);
  for (const f of truthFacts) {
    if (["service", "page_topic", "recent_content"].includes(f.key) && ok(f.sourceUrl) && goodAnchor(f.value.trim())) out.push({ url: f.sourceUrl, anchor: f.value.trim() });
  }
  if (db) {
    const pub = await db
      .select({ title: publishedContent.title, publicUrl: publishedContent.publicUrl })
      .from(publishedContent)
      .where(and(eq(publishedContent.businessId, businessId), eq(publishedContent.status, "published")))
      .limit(50);
    for (const p of pub) if (ok(p.publicUrl) && goodAnchor(p.title.trim())) out.push({ url: p.publicUrl, anchor: p.title.trim() });
  }
  if (related) out.sort((a, b) => Number(b.url === related) - Number(a.url === related));
  return out;
}

async function pageActedRecently(businessId: string, pageUrl: string): Promise<boolean> {
  const db = getDb();
  if (!db) return true;
  const recent = await db
    .select({ payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), eq(jobs.type, "seo_page_action"), gte(jobs.createdAt, new Date(Date.now() - ACTION_COOLDOWN_DAYS * DAY))));
  return recent.some((j) => (j.payload as { pageUrl?: string } | null)?.pageUrl === pageUrl);
}

async function verifyLive(pageUrl: string, needles: { text?: string; hrefs?: string[] }): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 4000));
    const sep = pageUrl.includes("?") ? "&" : "?";
    const res = await safeFetchText(`${pageUrl}${sep}gbverify=${Date.now()}`, { timeoutMs: 12_000, maxBytes: 1_500_000 });
    if (!res.ok || res.status !== 200) continue;
    const textOk = !needles.text || alnum(htmlToText(res.body)).includes(alnum(needles.text));
    const hrefOk = (needles.hrefs ?? []).every((h) => res.body.includes(h));
    if (textOk && hrefOk) return true;
  }
  return false;
}

export async function actOnOpportunity(businessId: string, opp: Opportunity, opts: { deadline?: number } = {}): Promise<ActResult> {
  const deadline = opts.deadline ?? Date.now() + BUSINESS_BUDGET_MS;
  try {
    const db = getDb();
    if (!db) return { acted: false, reason: "no_db" };
    const config = await getWordPressTarget(businessId);
    if (!config) return { acted: false, reason: "no_wordpress_target" };
    if (!sameHost(config.siteUrl, opp.pageUrl)) return { acted: false, reason: "page_not_on_wordpress_site" };
    if (await pageActedRecently(businessId, opp.pageUrl)) return { acted: false, reason: "cooldown_28d" };

    const truth = await ensureFreshTruth(businessId);
    if (!truth.sufficient) return { acted: false, reason: `truth_insufficient:${truth.insufficientReason ?? ""}` };

    const found = await findContentByUrl(config, opp.pageUrl);
    if (!found.ok) return { acted: false, reason: `wp_lookup_failed:${found.error}` };
    const wp = found.value;
    if (wp.status && wp.status !== "publish") return { acted: false, reason: "not_published" };
    const oldHtml = wp.contentHtml;
    if (!oldHtml.trim()) return { acted: false, reason: "empty_content" };
    if (oldHtml.includes("gravyblock:faq")) return { acted: false, reason: "already_has_gravyblock_section" };
    const pageText = htmlToText(oldHtml);

    // Baseline: same method used at recheck (page-filtered, impression-weighted).
    const token = await getFreshAccessToken(businessId);
    const conn = await getGoogleConnection(businessId);
    if (!token || !conn?.searchConsoleProperty) return { acted: false, reason: "no_google" };
    const { current } = gscWindows();
    const beforeRows = await gscQuery(token, conn.searchConsoleProperty, current, ["page", "query"], { pageEquals: opp.pageUrl });
    if (!beforeRows || !beforeRows.length) return { acted: false, reason: "no_baseline_data" };
    const before = aggregate(beforeRows);

    // Title change: only GravyBlock-authored posts whose title lacks the query words.
    let titleAllowed = false;
    if (wp.type === "posts") {
      const pubs = await db.select({ publicUrl: publishedContent.publicUrl }).from(publishedContent).where(and(eq(publishedContent.businessId, businessId), eq(publishedContent.channel, "wordpress")));
      const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "").toLowerCase();
      const gbAuthored = pubs.some((p) => p.publicUrl && norm(p.publicUrl) === norm(opp.pageUrl));
      const words = mainWords(opp.query);
      titleAllowed = gbAuthored && words.length > 0 && !words.some((w) => wp.title.toLowerCase().includes(w));
    }

    // Internal links (no model needed).
    let newHtml = oldHtml;
    const linkedUrls: string[] = [];
    const candidates = await internalLinkCandidates(businessId, opp.pageUrl, truth.facts, opp.relatedUrl);
    for (const c of candidates) {
      if (linkedUrls.length >= 2) break;
      if (newHtml.includes(c.url)) continue;
      const r = linkFirstOccurrence(newHtml, c.anchor, c.url);
      if (r.done) {
        newHtml = r.html;
        linkedUrls.push(c.url);
      }
    }

    // FAQ section (one model call, grounded).
    let faqText: string | null = null;
    let newTitle: string | undefined;
    if (Date.now() < deadline - 20_000) {
      const gen = await generateFaq({ promptBlock: truth.promptBlock, pageTitle: wp.title, pageText, query: opp.query, titleAllowed });
      if (gen) {
        faqText = gen.firstQuestion;
        newHtml = `${newHtml}\n${gen.html}`;
        if (gen.title) newTitle = gen.title;
      }
    }
    if (!faqText && !linkedUrls.length) return { acted: false, reason: "nothing_safe_to_add" };
    if (Date.now() > deadline - 15_000) return { acted: false, reason: "time_budget" };

    const now = new Date();
    const action = [faqText ? "faq" : null, linkedUrls.length ? "links" : null, newTitle ? "title" : null].filter(Boolean).join("+");
    const payload = {
      pageUrl: opp.pageUrl,
      wpType: wp.type,
      wpId: wp.id,
      action,
      query: opp.query,
      kind: opp.kind,
      before: { clicks: before.clicks, impressions: before.impressions, ctr: before.ctr, position: before.position, topQuery: before.topQuery },
      beforeWindow: current,
      actedAt: now.toISOString(),
      recheckAfter: new Date(now.getTime() + 28 * DAY).toISOString(),
      htmlLengthBefore: oldHtml.length,
      htmlHashBefore: sha(oldHtml),
      htmlHashAfter: sha(newHtml),
      titleBefore: newTitle ? wp.title : undefined,
      titleAfter: newTitle,
      linkedUrls,
      verifyNeedle: faqText,
      verified: false,
    };
    const [job] = await db.insert(jobs).values({ businessId, type: "seo_page_action", status: "measuring", payload }).returning({ id: jobs.id });
    const jobId = job?.id;
    const setJob = async (status: string, extra: Record<string, unknown> = {}) => {
      if (jobId) await db.update(jobs).set({ status, payload: { ...payload, ...extra } }).where(eq(jobs.id, jobId));
    };

    const upd = await updateContent(config, wp.type, wp.id, { content: newHtml, ...(newTitle ? { title: newTitle } : {}) });
    if (!upd.ok) {
      await setJob("failed", { error: upd.error });
      return { acted: false, reason: `wp_update_failed:${upd.error}`, jobId, status: "failed" };
    }

    const verified = await verifyLive(opp.pageUrl, { text: faqText ?? undefined, hrefs: linkedUrls });
    if (!verified) {
      const revert = await updateContent(config, wp.type, wp.id, { content: oldHtml, ...(newTitle ? { title: wp.title } : {}) });
      await setJob("reverted", { verified: false, revertOk: revert.ok, revertError: revert.ok ? undefined : revert.error });
      return { acted: false, reason: "live_verification_failed_reverted", jobId, status: "reverted" };
    }
    await setJob("measuring", { verified: true });
    return { acted: true, jobId, status: "measuring" };
  } catch (err) {
    console.error("[existing-pages] actOnOpportunity failed", { businessId, page: opp.pageUrl, error: err instanceof Error ? err.message : String(err) });
    return { acted: false, reason: "error" };
  }
}

async function generateFaq(input: { promptBlock: string; pageTitle: string; pageText: string; query: string; titleAllowed: boolean }): Promise<{ html: string; firstQuestion: string; title?: string } | null> {
  const system = "You write short, factual FAQ sections for a local business website. Use ONLY facts given in the VERIFIED BUSINESS FACTS and the existing page text. Never invent numbers, prices, years, guarantees, licenses, awards or promises. If the facts do not support an answer, write fewer questions. No marketing hype.";
  const user = [
    input.promptBlock,
    "",
    `EXISTING PAGE TITLE: ${input.pageTitle}`,
    `EXISTING PAGE TEXT (excerpt): ${input.pageText.slice(0, 2500)}`,
    "",
    `TARGET SEARCH QUERY: ${input.query || "(none)"}`,
    "",
    "Write 2 or 3 questions people searching that query would ask, each answered in 1-2 sentences using only the facts above. Total under 150 words.",
    input.titleAllowed ? "Also propose an improved page title (under 65 characters) that naturally includes the main words of the target query, on a line starting with TITLE:" : "",
    "Format exactly:",
    "Q1: question?",
    "A1: answer",
    "Q2: question?",
    "A2: answer",
  ].filter(Boolean).join("\n");

  const raw = await openRouterChat({ model: MODELS.content, messages: [{ role: "system", content: system }, { role: "user", content: user }], maxTokens: 500, temperature: 0.3 });
  if (!raw) return null;
  const clean = raw.replace(/\*\*/g, "").replace(/^#+\s*/gm, "");
  const qs = [...clean.matchAll(/^\s*Q\d?[:.)]\s*(.+)$/gim)].map((m) => m[1]!.trim());
  const as = [...clean.matchAll(/^\s*A\d?[:.)]\s*(.+)$/gim)].map((m) => m[1]!.trim());
  const n = Math.min(qs.length, as.length, 3);
  if (n < 2) return null;
  const pairs = Array.from({ length: n }, (_, i) => ({ q: qs[i]!, a: as[i]! }));
  const joined = pairs.map((p) => `${p.q} ${p.a}`).join(" ");
  if (joined.split(/\s+/).length > 170) return null;
  if (pairs.some((p) => !p.q.endsWith("?") || p.a.length < 20)) return null;
  const sources = `${input.promptBlock}\n${input.pageText}\n${input.pageTitle}`;
  if (containsPlaceholderArtifact(joined) || ungrounded(joined, sources)) return null;

  let title: string | undefined;
  if (input.titleAllowed) {
    const t = clean.match(/^\s*TITLE:\s*(.+)$/im)?.[1]?.trim().replace(/^["']|["']$/g, "");
    const words = mainWords(input.query);
    if (t && t.length <= 65 && t.length >= 15 && words.some((w) => t.toLowerCase().includes(w)) && !containsPlaceholderArtifact(t) && !ungrounded(t, sources)) title = t;
  }

  const html = [
    "<!-- gravyblock:faq -->",
    "<h2>Frequently asked questions</h2>",
    ...pairs.map((p) => `<h3>${escapeHtml(p.q)}</h3>\n<p>${escapeHtml(p.a)}</p>`),
    "<!-- /gravyblock:faq -->",
  ].join("\n");
  return { html, firstQuestion: pairs[0]!.q, title };
}

// ── (d) Re-measure ───────────────────────────────────────────────────────────

export async function recheckActions(businessId?: string): Promise<{ rechecked: number; proofRecorded: number }> {
  let rechecked = 0;
  let proofRecorded = 0;
  try {
    const db = getDb();
    if (!db) return { rechecked, proofRecorded };
    const rows = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.type, "seo_page_action"), eq(jobs.status, "measuring"), ...(businessId ? [eq(jobs.businessId, businessId)] : [])))
      .limit(50);
    for (const job of rows) {
      try {
        const p = job.payload as {
          pageUrl: string; action: string; query: string; recheckAfter: string; actedAt: string; verified?: boolean; verifyNeedle?: string | null; linkedUrls?: string[];
          before: Metrics; beforeWindow: Window;
        } | null;
        if (!p?.pageUrl || !job.businessId || !p.verified) continue;
        // Wait 3 extra days (Search Console lag) so the comparison window is fully post-edit.
        if (Date.now() < new Date(p.recheckAfter).getTime() + 3 * DAY) continue;
        const token = await getFreshAccessToken(job.businessId);
        const conn = await getGoogleConnection(job.businessId);
        if (!token || !conn?.searchConsoleProperty) continue;
        const win = gscWindows().current;
        const rowsAfter = await gscQuery(token, conn.searchConsoleProperty, win, ["page", "query"], { pageEquals: p.pageUrl });
        if (!rowsAfter) continue;
        rechecked++;
        const after = aggregate(rowsAfter);
        const delta = {
          clicks: after.clicks - p.before.clicks,
          impressions: after.impressions - p.before.impressions,
          position: Number((after.position - p.before.position).toFixed(2)),
        };
        const finish = async (status: string, extra: Record<string, unknown>) => {
          await db.update(jobs).set({ status, payload: { ...p, after: { ...after, window: win }, delta, ...extra } }).where(eq(jobs.id, job.id));
        };

        const enough = p.before.impressions >= 30 && after.impressions >= 30;
        if (!enough) {
          await finish("measured_no_gain", { reason: "insufficient_impressions" });
          continue;
        }
        const stillThere = await verifyLive(p.pageUrl, { text: p.verifyNeedle ?? undefined, hrefs: p.linkedUrls ?? [] });
        if (!stillThere) {
          await finish("measured_no_gain", { reason: "edit_no_longer_present" });
          continue;
        }
        let metric: "avg_position" | "clicks" | null = null;
        if (after.position > 0 && after.position <= p.before.position - 0.5) metric = "avg_position";
        else if (after.clicks >= p.before.clicks * 1.1 && after.clicks - p.before.clicks >= 3) metric = "clicks";
        if (!metric) {
          await finish("measured_no_gain", { reason: "no_improvement" });
          continue;
        }
        await finish("measured", { proof: metric });
        const r = await recordProof({
          businessId: job.businessId,
          actionType: "page_improved",
          engine: "existing_page_seo",
          proofCategory: "ranking",
          destination: p.pageUrl,
          summary: "improved an existing page (added verified FAQ/links)",
          beforeEvidence: { window: p.beforeWindow, ...p.before, action: p.action, actedAt: p.actedAt },
          afterEvidence: { window: win, clicks: after.clicks, impressions: after.impressions, ctr: after.ctr, position: after.position },
          metricName: metric,
          metricBefore: metric === "avg_position" ? p.before.position : p.before.clicks,
          metricAfter: metric === "avg_position" ? after.position : after.clicks,
          methodVersion: "gsc_28d_vs_prior_28d",
          dedupeKey: `page_improved:${job.id}`,
        });
        if (r.recorded) proofRecorded++;
      } catch (err) {
        console.error("[existing-pages] recheck failed", { jobId: job.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  } catch (err) {
    console.error("[existing-pages] recheckActions failed", err instanceof Error ? err.message : String(err));
  }
  return { rechecked, proofRecorded };
}

// ── (e) Batch ────────────────────────────────────────────────────────────────

export type ExistingPageSeoCounts = { businesses: number; connected: number; opportunities: number; acted: number; rechecked: number; proofRecorded: number; skippedNoWordpress: number };

export async function runExistingPageSeoBatch(limit = 5): Promise<ExistingPageSeoCounts> {
  const counts: ExistingPageSeoCounts = { businesses: 0, connected: 0, opportunities: 0, acted: 0, rechecked: 0, proofRecorded: 0, skippedNoWordpress: 0 };
  try {
    const db = getDb();
    if (!db) return counts;
    const candidates = await db
      .select({ id: businesses.id })
      .from(businesses)
      .innerJoin(googleOauthConnections, eq(googleOauthConnections.businessId, businesses.id))
      .where(or(inArray(businesses.planTier, PAID_TIERS), eq(businesses.accountType, "house")))
      .limit(500);

    const ordered: Array<{ id: string; last: number }> = [];
    for (const c of candidates) {
      const [last] = await db.select({ createdAt: jobs.createdAt }).from(jobs).where(and(eq(jobs.businessId, c.id), eq(jobs.type, "seo_opportunities"))).orderBy(desc(jobs.createdAt)).limit(1);
      ordered.push({ id: c.id, last: last?.createdAt.getTime() ?? 0 });
    }
    ordered.sort((a, b) => a.last - b.last);

    for (const { id, last } of ordered.slice(0, limit)) {
      if (Date.now() - last < 20 * 3_600_000) continue; // already ran today
      counts.businesses++;
      const deadline = Date.now() + BUSINESS_BUDGET_MS;
      try {
        const re = await recheckActions(id);
        counts.rechecked += re.rechecked;
        counts.proofRecorded += re.proofRecorded;

        const fetched = await fetchGscPageQuery(id);
        if (!fetched.connected) continue;
        counts.connected++;
        const opps = await findOpportunities(id);
        counts.opportunities += opps.length;
        await db.insert(jobs).values({
          businessId: id,
          type: "seo_opportunities",
          status: "completed",
          payload: { total: opps.length, top: opps.slice(0, 20), fetched: fetched.fetched ?? false },
        });
        if (!opps.length) continue;

        const wp = await getWordPressTarget(id);
        if (!wp) {
          counts.skippedNoWordpress++;
          continue;
        }
        let acted = 0;
        let attempts = 0;
        for (const opp of opps) {
          if (acted >= MAX_ACTIONS_PER_RUN || attempts >= 6 || Date.now() > deadline - 25_000) break;
          attempts++;
          const r = await actOnOpportunity(id, opp, { deadline });
          if (r.acted) acted++;
          else if (r.reason?.startsWith("truth_insufficient") || r.reason === "no_google") break;
        }
        counts.acted += acted;
      } catch (err) {
        console.error("[existing-pages] business failed", { businessId: id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  } catch (err) {
    console.error("[existing-pages] batch failed", err instanceof Error ? err.message : String(err));
  }
  return counts;
}

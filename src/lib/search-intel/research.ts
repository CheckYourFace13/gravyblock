/**
 * Search research beyond Search Console (v3), all free and public, read only:
 * - public autocomplete from Google (suggestqueries) and DuckDuckGo: proves people type a phrase, never how often
 * - the site's own content inventory (its sitemap) and live pages, so a missing search is answered by EXPANDING an existing page where one fits,
 *   and work a site's own developer already shipped is recognised instead of being recommended again
 * - competitor pages for an intent come from relevant competitors' own sitemaps; GravyBlock cannot see Google's ranking order (that needs a paid
 *   results API), so a competing page is one that is published for the same intent, not a claimed ranking
 * Pure helpers are exported for tests; the fetchers are polite (one request at a time, short timeouts).
 */
import { safeFetchText, isSafePublicUrl } from "@/lib/net/safe-fetch";
import { pageFeatures, urlMatchScore, type PageFeatures } from "./competitors";
import { tokensOf } from "./deep";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function googleSuggest(seed: string): Promise<string[]> {
  const r = await safeFetchText(`https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=${encodeURIComponent(seed)}`, { timeoutMs: 6000, maxBytes: 50_000, accept: "application/json" });
  if (!r.ok || r.status >= 400) return [];
  try {
    const j = JSON.parse(r.body) as unknown;
    return Array.isArray(j) && Array.isArray(j[1]) ? (j[1] as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 10) : [];
  } catch {
    return [];
  }
}

export async function ddgSuggest(seed: string): Promise<string[]> {
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

/** Both public autocomplete sources for a list of seeds; each suggestion remembers which source(s) produced it. */
export async function collectSuggestions(seeds: string[], opts: { ddgSeeds?: number } = {}): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const add = (s: string, src: string) => {
    const k = s.toLowerCase().trim();
    if (k) (out.get(k) ?? out.set(k, new Set()).get(k)!).add(src);
  };
  for (const [i, seed] of seeds.entries()) {
    for (const s of await googleSuggest(seed)) add(s, "Google autocomplete");
    if (i < (opts.ddgSeeds ?? 8)) for (const s of await ddgSuggest(seed)) add(s, "DuckDuckGo autocomplete");
    await sleep(250);
  }
  return out;
}

/* ───────────── pages: one read gives features, headings and text ───────────── */

export type PageDetail = PageFeatures & { status: number; headings: string[]; text: string; indexable: boolean; canonical: string };

const clean = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&amp;|&#\d+;|&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
export const normPhrase = (s: string) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function headingsOf(html: string, max = 40): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const t = clean(m[2] ?? "");
    if (t && t.length <= 160 && !out.includes(t)) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export function pageDetail(html: string, url: string, status: number, xRobots: string | null, observedAt: string): PageDetail {
  const f = pageFeatures(html, url, observedAt);
  const robots = `${html.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? ""} ${xRobots ?? ""}`.toLowerCase();
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? "";
  const body = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;
  const text = normPhrase(clean(body.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " "))).slice(0, 60_000);
  return { ...f, status, headings: headingsOf(html), text, indexable: status < 400 && !/noindex/.test(robots), canonical };
}

export async function fetchDetail(url: string, observedAt: string): Promise<PageDetail | null> {
  if (!isSafePublicUrl(url)) return null;
  const r = await safeFetchText(url, { timeoutMs: 9000, maxBytes: 700_000 });
  if (!r.ok || r.status >= 400) return null;
  return pageDetail(r.body, r.finalUrl, r.status, r.headers.get("x-robots-tag"), observedAt);
}

/** The site's own pages whose address best matches a search (most of its meaningful words in the path), best first. */
export function inventoryMatches(urls: string[], query: string, max = 3, min = 0.6): string[] {
  const toks = tokensOf(query);
  if (!toks.length) return [];
  return urls
    .map((u) => ({ u, s: urlMatchScore(u, toks) }))
    .filter((x) => x.s >= min)
    .sort((a, b) => b.s - a.s || a.u.length - b.u.length)
    .slice(0, max)
    .map((x) => x.u);
}

/**
 * Does a live page plainly serve one of these searches? Yes when its title or headings carry at least 80% of a search's meaningful words (two or more words),
 * or its text contains the whole phrase (three words or more). A page that merely mentions one word does not count.
 */
export function coversIntent(p: Pick<PageDetail, "title" | "h1" | "headings" | "text">, queries: string[]): { covered: boolean; by: string | null } {
  const head = new Set(tokensOf([p.title, p.h1, ...p.headings].join(" ")));
  for (const q of queries) {
    const t = tokensOf(q);
    if (t.length >= 2 && t.filter((w) => head.has(w)).length / t.length >= 0.8) return { covered: true, by: `title or headings cover "${q}"` };
    const phrase = normPhrase(q);
    if (phrase.split(" ").length >= 3 && p.text.includes(phrase)) return { covered: true, by: `the page text contains "${q}"` };
  }
  return { covered: false, by: null };
}

/** Sections (headings) competing pages have whose subject our page never mentions. Short heading labels only, as research: never content to copy. */
export function topicGaps(ours: Pick<PageDetail, "text"> | null, theirs: Array<Pick<PageDetail, "url" | "headings">>, max = 5): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of theirs) {
    for (const h of t.headings.slice(1)) {
      const toks = tokensOf(h).filter((w) => w.length >= 4);
      if (toks.length < 2) continue;
      const key = toks.slice().sort().join(" ");
      if (seen.has(key)) continue;
      const missing = !ours || toks.filter((w) => ours.text.includes(w)).length / toks.length < 0.5;
      if (!missing) continue;
      seen.add(key);
      out.push(`"${h.slice(0, 70)}" (${t.url})`);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** What our page already does better than every observed competing page, so the instruction preserves it. */
export function ourStrengths(ours: PageDetail | null, theirs: PageDetail[]): string[] {
  if (!ours || !theirs.length) return [];
  const s: string[] = [];
  if (ours.hasTool && !theirs.some((t) => t.hasTool)) s.push(`${ours.url} has an interactive tool that none of the competing pages offer`);
  if (ours.tables > 0 && !theirs.some((t) => t.tables > 0)) s.push(`${ours.url} has a comparison or data table; the competing pages do not`);
  if (ours.hasFaqSchema && !theirs.some((t) => t.hasFaqSchema)) s.push(`${ours.url} answers questions with FAQ markup; the competing pages do not`);
  if (ours.words >= Math.max(...theirs.map((t) => t.words)) * 1.3 && ours.words >= 600) s.push(`${ours.url} is more detailed (about ${ours.words} words against at most ${Math.max(...theirs.map((t) => t.words))})`);
  return s;
}

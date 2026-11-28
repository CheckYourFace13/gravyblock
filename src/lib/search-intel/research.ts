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
import { pageFeatures, type PageFeatures } from "./competitors";
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
export function inventoryMatches(urls: string[], query: string, max = 3, min = 0.5): string[] {
  const toks = tokensOf(query);
  if (!toks.length) return [];
  // share of the search's words in the page address (a page at /tools/rental-roi is a candidate for "rental property calculator roi");
  // the page itself must still plainly cover the search (coversIntent) before anything is treated as served
  const score = (u: string) => {
    let path = "";
    try {
      path = new URL(u).pathname;
    } catch {
      return 0;
    }
    const hay = new Set(tokensOf(path.replace(/[/_-]+/g, " ")));
    const hits = toks.filter((t) => hay.has(t)).length;
    // ties go to the page whose own address is mostly about this search (/tools/rental-roi over /resources/rental-property-tax-deductions)
    const precision = hay.size ? hits / hay.size : 0;
    return toks.length === 1 ? (hits ? 1 : 0) : hits >= 2 ? hits / toks.length + precision * 0.1 : 0;
  };
  return urls
    .map((u) => ({ u, s: score(u) }))
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

/* ───────────── launch stage: search growth before Google has meaningful data ───────────── */

export type SearchStage = "launch" | "early data" | "established";

/**
 * Where a site stands with Google. Launch: Search Console not connected (data UNAVAILABLE, never reported as zero) or under 300 impressions in 28 days.
 * Early data: under 3,000. Established: enough data to optimise from Search Console alone. The engine moves between stages on its own as data accumulates.
 */
export function searchStage(connected: boolean, impressions28: number | null): { stage: SearchStage; reason: string } {
  if (!connected) return { stage: "launch", reason: "Search Console is not connected for this site, so Google data is unavailable (not zero). Planning uses public demand signals and competitor pages." };
  if (impressions28 === null) return { stage: "launch", reason: "No complete 28-day Search Console window yet." };
  if (impressions28 < 300) return { stage: "launch", reason: `Only ${impressions28} Google impressions in the latest 28 days: too little to optimise from, so planning leads with public demand signals.` };
  if (impressions28 < 3000) return { stage: "early data", reason: `${impressions28} Google impressions in the latest 28 days: early data, combined with public demand signals.` };
  return { stage: "established", reason: `${impressions28} Google impressions in the latest 28 days: optimised primarily from Search Console data.` };
}

export type LaunchCluster = {
  label: string;
  queries: string[];
  intent: string;
  score: number;
  level: string;
  ourPage: { url: string; covers: boolean } | null;
  competitorPages: Array<{ url: string; title: string }>;
};

export type LaunchPlan = {
  stage: SearchStage;
  reason: string;
  clusters: Array<LaunchCluster & { action: "make the existing page plainly answer it" | "expand the closest page" | "create one focused page or tool"; section: string }>;
  architecture: Array<{ section: string; clusters: string[]; existing: boolean }>;
  internalLinks: string[];
  plan90: Array<{ window: string; steps: string[] }>;
};

const pathOfUrl = (u: string) => {
  try {
    return new URL(u).pathname || "/";
  } catch {
    return u;
  }
};

/** Turns researched search clusters into a launch plan: which page serves each cluster, a simple hub structure, the internal links, and the first 90 days. */
export function buildLaunchPlan(i: { stage: SearchStage; reason: string; clusters: LaunchCluster[]; valuableSections: string[]; conversion: string; gscConnected: boolean }): LaunchPlan {
  const sectionFor = (c: LaunchCluster) => {
    if (c.ourPage) {
      const seg = pathOfUrl(c.ourPage.url).split("/").filter(Boolean)[0];
      return seg ? `/${seg}` : "/";
    }
    const toks = tokensOf([c.label, ...c.queries].join(" "));
    // what kind of page the search wants points at the section that holds that kind of page
    const hint: Array<[RegExp, RegExp]> = [[/\b(calculator|checker|generator|template|estimator)\b/, /tool/], [/\balternatives?\b/, /alternative/], [/\b(vs|versus|compare|comparison)\b/, /compare/]];
    const text = [c.label, ...c.queries].join(" ").toLowerCase();
    for (const [q, sec] of hint) if (q.test(text)) { const hit = i.valuableSections.find((s) => sec.test(s)); if (hit) return hit; }
    return i.valuableSections.find((s) => s !== "/" && toks.some((t) => s.replace(/[^a-z]/g, " ").split(" ").some((w) => w && tokensOf(w)[0] === t))) ?? "new focused page";
  };
  const clusters = [...i.clusters]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((c) => ({ ...c, section: sectionFor(c), action: c.ourPage?.covers ? ("make the existing page plainly answer it" as const) : c.ourPage ? ("expand the closest page" as const) : ("create one focused page or tool" as const) }));
  const bySection = new Map<string, { clusters: string[]; existing: boolean }>();
  for (const c of clusters) {
    const e = bySection.get(c.section) ?? { clusters: [], existing: c.section !== "new focused page" };
    e.clusters.push(c.label);
    bySection.set(c.section, e);
  }
  const architecture = [...bySection.entries()].map(([section, e]) => ({ section, ...e }));
  const internalLinks: string[] = [];
  // one entry per page: the strongest cluster names it, further clusters for the same page are its supporting searches
  const byPage = new Map<string, (typeof clusters)[number][]>();
  for (const c of clusters.filter((x) => x.ourPage)) (byPage.get(pathOfUrl(c.ourPage!.url)) ?? byPage.set(pathOfUrl(c.ourPage!.url), []).get(pathOfUrl(c.ourPage!.url))!).push(c);
  for (const [page, cs] of [...byPage.entries()].slice(0, 6)) {
    const hub = cs[0]!.section === "/" ? "the home page" : cs[0]!.section;
    internalLinks.push(`${hub} links to ${page} with descriptive anchor text such as "${cs[0]!.label}"${cs.length > 1 ? ` (the page also serves ${cs.slice(1).map((x) => `"${x.label}"`).join(", ")})` : ""}; that page links on to ${i.conversion}.`);
  }
  if (clusters.some((c) => !c.ourPage)) internalLinks.push("Every new page is linked from its hub section and from the home page or main navigation where it fits, never left orphaned.");
  const existing = [...byPage.values()].map((cs) => cs[0]!);
  const missing = clusters.filter((c) => !c.ourPage);
  const plan90 = [
    {
      window: "Days 1 to 14",
      steps: [
        i.gscConnected ? "Confirm the sitemap is submitted in Search Console and every public page in it returns 200, is indexable and self-canonical." : "Verify the domain in Google Search Console (owner action) and submit the sitemap, so real search data starts accumulating.",
        ...(existing.length ? [`Make the existing pages plainly answer their strongest searches: ${existing.slice(0, 3).map((c) => `${pathOfUrl(c.ourPage!.url)} for "${c.label}"`).join("; ")}.`] : []),
      ],
    },
    {
      window: "Days 15 to 45",
      steps: missing.length
        ? [`Create at most two original pages or tools for the strongest missing searches: ${missing.slice(0, 2).map((c) => `"${c.label}"`).join(" and ")}. One substantive page per intent, no thin variants.`]
        : ["Deepen the pages above with original detail where competing pages answer more of the searcher's questions."],
    },
    {
      window: "Days 46 to 90",
      steps: [
        "Earn first mentions: legitimate listings, directories and partner pages relevant to the audience (owner-approved; unsolicited outreach stays paused).",
        "Read Search Console weekly per cluster. Once the site passes 300 impressions in 28 days, GravyBlock switches to data-driven optimisation automatically.",
      ],
    },
  ];
  return { stage: i.stage, reason: i.reason, clusters, architecture, internalLinks, plan90 };
}

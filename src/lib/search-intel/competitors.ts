/**
 * Competitor observation for the weekly report. Everything here comes from a competitor's own PUBLIC pages (sitemap and the pages it points to), read politely,
 * and every finding carries the page URL and the date it was observed. Nothing is inferred about a competitor's traffic, rankings, backlinks or private changes:
 * a competitor "covers a topic" when it publishes a page about it, which is not the same as ranking for it, and the report says so.
 */
export type PageFeatures = {
  url: string;
  title: string;
  h1: string;
  words: number;
  h2s: number;
  hasFaqSchema: boolean;
  hasTool: boolean;
  tables: number;
  hasVideo: boolean;
  images: number;
  observedAt: string;
};

const STEM = (w: string) => w.replace(/(ing|ies|es|s)$/, "");
const STOPWORDS = new Set("the a an of to for in on at and or with from your you my our me near best top how what why when where which who is are can does do vs".split(" "));

export function queryTokens(q: string): string[] {
  return [...new Set(q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t)).map(STEM))];
}

/** How many of the query's words appear in the URL path of a competitor page; the page is only a candidate when most of them do. */
export function urlMatchScore(url: string, tokens: string[]): number {
  if (!tokens.length) return 0;
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  } catch {
    return 0;
  }
  const hay = path.split(" ").map(STEM);
  const hits = tokens.filter((t) => hay.some((h) => h === t || h.startsWith(t) || t.startsWith(h) && h.length >= 4)).length;
  const need = tokens.length === 1 ? 1 : Math.ceil(tokens.length * 0.6);
  return hits >= need ? hits / tokens.length : 0;
}

/** The best few competitor URLs for a query from the sitemap entries read from competitors, one per host first so a single site cannot crowd out the rest. */
export function matchCompetitorUrls(urlsByHost: Map<string, string[]>, tokens: string[], max = 4): Array<{ host: string; url: string; score: number }> {
  const perHost: Array<{ host: string; url: string; score: number }> = [];
  for (const [host, urls] of urlsByHost) {
    // a reference page must cover nearly all of the query's words in its address, so an event blog that shares one or two words is not offered as a comparison
    // other-language versions (/pt/..., /de-de/...) are not comparisons for an English search
    const english = urls.filter((u) => {
      try {
        const first = new URL(u).pathname.split("/").filter(Boolean)[0] ?? "";
        return !/^[a-z]{2}(-[a-z]{2})?$/i.test(first) || /^(en|us|uk)(-[a-z]{2})?$/i.test(first);
      } catch {
        return false;
      }
    });
    const scored = english.map((url) => ({ host, url, score: urlMatchScore(url, tokens) })).filter((x) => x.score >= 0.8).sort((a, b) => b.score - a.score || a.url.length - b.url.length);
    if (scored[0]) perHost.push(scored[0]);
  }
  return perHost.sort((a, b) => b.score - a.score).slice(0, max);
}

const strip = (html: string) => html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&amp;|&#\d+;/g, " ").replace(/\s+/g, " ").trim();

export function pageFeatures(html: string, url: string, observedAt: string): PageFeatures {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  const h1 = strip(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const body = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
  const words = strip(body).split(" ").filter(Boolean).length;
  const inputs = (body.match(/<(input|select|textarea)\b/gi) ?? []).length;
  return {
    url,
    title: title.slice(0, 160),
    h1: h1.slice(0, 160),
    words,
    h2s: (body.match(/<h2\b/gi) ?? []).length,
    hasFaqSchema: /"@type"\s*:\s*"FAQPage"/i.test(html),
    hasTool: inputs >= 2 && /(calculator|calculate|planner|checklist|estimate|finder|search|filter)/i.test(strip(body).slice(0, 4000)),
    tables: (body.match(/<table\b/gi) ?? []).length,
    hasVideo: /<video\b|youtube\.com\/embed|player\.vimeo\.com/i.test(html),
    images: (body.match(/<img\b/gi) ?? []).length,
    observedAt,
  };
}

export type FeatureGap = { kind: "faq_schema" | "interactive_tool" | "table" | "depth" | "sections" | "video"; evidence: string; competitorUrl: string; ourUrl: string | null; observedAt: string };

/** Differences that are directly visible on both pages. Never a ranking claim, never a copy instruction: it names what the competing page has and ours lacks. */
export function featureGaps(ours: PageFeatures | null, theirs: PageFeatures): FeatureGap[] {
  const g: FeatureGap[] = [];
  const base = { competitorUrl: theirs.url, ourUrl: ours?.url ?? null, observedAt: theirs.observedAt };
  const ref = ours ? "" : " (the site has no page of its own on this topic that could be compared)";
  if (theirs.hasTool && !ours?.hasTool) g.push({ ...base, kind: "interactive_tool", evidence: `${theirs.url} offers an interactive tool (form inputs plus calculator/planner/checklist/finder wording). ${ours ? `${ours.url} has none.` : "No comparable page of ours was found."}${ref}` });
  if (theirs.hasFaqSchema && !ours?.hasFaqSchema) g.push({ ...base, kind: "faq_schema", evidence: `${theirs.url} marks up a FAQ (FAQPage structured data). ${ours ? `${ours.url} does not.` : ""}${ref}` });
  if (theirs.tables > 0 && !(ours && ours.tables > 0)) g.push({ ...base, kind: "table", evidence: `${theirs.url} presents ${theirs.tables} comparison/data table(s). ${ours ? `${ours.url} has none.` : ""}${ref}` });
  if (ours && theirs.words >= ours.words * 1.5 && theirs.words - ours.words >= 400) g.push({ ...base, kind: "depth", evidence: `${theirs.url} has about ${theirs.words} words on the page against about ${ours.words} on ${ours.url}. Length alone is not quality: check whether it answers more of what searchers want.` });
  if (ours && theirs.h2s >= ours.h2s + 4) g.push({ ...base, kind: "sections", evidence: `${theirs.url} is organised into ${theirs.h2s} sections against ${ours.h2s} on ${ours.url}; review which of those sections answer real searcher questions we do not.` });
  if (theirs.hasVideo && !ours?.hasVideo) g.push({ ...base, kind: "video", evidence: `${theirs.url} embeds video. ${ours ? `${ours.url} does not.` : ""}${ref}` });
  return g;
}

/**
 * New competitor pages are only claimed where an earlier observation of the same competitor exists. `baselineHosts` are hosts whose pages were observed
 * BEFORE this run; for any other host this run is the baseline and nothing is called new.
 */
export function newPagesSince(observed: Array<{ host: string; url: string; firstSeen: string }>, baselineHosts: Set<string>, sinceIso: string): Array<{ host: string; url: string; firstSeen: string }> {
  return observed.filter((o) => baselineHosts.has(o.host) && o.firstSeen >= sinceIso).slice(0, 12);
}

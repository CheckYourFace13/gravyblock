/**
 * BASIC AUTOPILOT site audit — needs only the public website (no Search Console).
 *
 * Reads a bounded set of pages and reports concrete, fixable on-page defects:
 * title/description length, missing canonical, missing or duplicate H1, missing
 * structured data, noindex, thin internal linking. Each defect carries a
 * proposed fix built ONLY from the page's own content (no invented claims).
 * Search Console, when connected, adds demand data on top of this — it is never
 * an on/off switch for on-page SEO.
 */

import { safeFetchText } from "@/lib/net/safe-fetch";
import { parseSitemap } from "@/lib/truth/extract";

export type PageSnapshot = {
  url: string;
  path: string;
  status: number;
  title: string | null;
  description: string | null;
  canonical: string | null;
  h1s: string[];
  jsonLdTypes: string[];
  noindex: boolean;
  internalLinks: number;
  wordCount: number;
  firstParagraph: string | null;
  /** og:image content, if declared. */
  ogImage: string | null;
  /** Same-site content images found on the page, in document order (candidates for a social preview). */
  images: string[];
};

export type DefectType = "title_missing" | "title_too_long" | "title_too_short" | "description_missing" | "description_too_short" | "description_too_long" | "no_structured_data" | "no_social_image" | "no_h1" | "multiple_h1" | "no_canonical" | "noindex" | "duplicate_title" | "thin_internal_links";

export type Defect = {
  type: DefectType;
  path: string;
  url: string;
  detail: string;
  /** 0-100: estimated benefit x confidence, used only to rank. */
  score: number;
  /** Fix GravyBlock can apply through a site connector, built from the page's own content. */
  fix: { title?: string; description?: string; jsonLd?: Record<string, unknown>; ogImage?: string } | null;
};

const strip = (s: string) => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

export function snapshotPage(url: string, html: string, status: number): PageSnapshot {
  const u = new URL(url);
  const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || null;
  const metaTag = html.match(/<meta[^>]+name=["']description["'][^>]*>/i)?.[0] ?? html.match(/<meta[^>]+content=["'][^"']*["'][^>]+name=["']description["'][^>]*>/i)?.[0] ?? "";
  const description = strip(metaTag.match(/content=["']([^"']*)["']/i)?.[1] ?? "") || null;
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1] ?? null;
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => strip(m[1]!)).filter(Boolean);
  const types = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const t of m[1]!.matchAll(/"@type"\s*:\s*"([^"]+)"/g)) types.add(t[1]!);
  }
  const noindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html);
  const host = u.hostname.replace(/^www\./, "");
  let internalLinks = 0;
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    try {
      const abs = new URL(m[1]!, url);
      if (abs.hostname.replace(/^www\./, "") === host) internalLinks++;
    } catch {
      /* skip */
    }
  }
  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]*>/i)?.[0]?.match(/content=["']([^"']+)["']/i)?.[1] ?? null;
  const images: string[] = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    let src = m[0].match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    src = src.replace(/&amp;/g, "&");
    try {
      const abs = new URL(src, url);
      // next/image proxies originals through /_next/image?url=<encoded original>
      const inner = abs.pathname === "/_next/image" ? abs.searchParams.get("url") : null;
      const final = inner ? new URL(inner, url) : abs;
      if (final.hostname.replace(/^www\./, "") !== host) continue;
      if (/\.(svg|gif|ico)$/i.test(final.pathname) || /(logo|icon|favicon|sprite|avatar|placeholder)/i.test(final.pathname)) continue;
      const clean = final.origin + final.pathname;
      if (!images.includes(clean)) images.push(clean);
    } catch {
      /* skip */
    }
  }
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;
  const text = strip(main);
  const paras = [...main.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => strip(m[1]!)).filter((p) => p.length >= 60);
  return {
    url,
    path: u.pathname || "/",
    status,
    title,
    description,
    canonical,
    h1s,
    jsonLdTypes: [...types],
    noindex,
    internalLinks,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    firstParagraph: paras[0] ?? null,
    ogImage,
    images,
  };
}

function sentenceTrim(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const sentences = t.match(/[^.!?]+[.!?]/g) ?? [];
  let out = "";
  for (const s of sentences) {
    if ((out + s).trim().length > max) break;
    out = (out + s).trim() + " ";
  }
  if (out.trim().length >= 70) return out.trim();
  return t.slice(0, max).replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "") + ".";
}

/** Choose a description from the page's own words. Returns null when the page has too little text to summarise honestly. */
export function proposeDescription(p: PageSnapshot): string | null {
  if (!p.firstParagraph) return null;
  const d = sentenceTrim(p.firstParagraph, 155);
  return d.length >= 70 ? d : null;
}

export function proposeTitle(p: PageSnapshot, brand: string): string | null {
  const base = p.h1s[0] ?? p.title?.split(/[|–—-]/)[0]?.trim();
  if (!base) return null;
  const withBrand = `${base} | ${brand}`;
  if (withBrand.length <= 60) return withBrand;
  return base.length <= 60 ? base : null;
}

export function proposeJsonLd(p: PageSnapshot, brand: string, origin: string): Record<string, unknown> | null {
  const name = p.h1s[0] ?? p.title;
  if (!name) return null;
  const desc = p.description ?? proposeDescription(p);
  return {
    "@context": "https://schema.org",
    "@type": p.path === "/" ? "WebSite" : "WebPage",
    name,
    url: p.canonical ?? p.url,
    ...(desc ? { description: desc } : {}),
    isPartOf: { "@type": "WebSite", name: brand, url: origin },
  };
}

export async function collectPages(website: string, maxPages = 30): Promise<PageSnapshot[]> {
  const origin = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).origin;
  const urls = new Set<string>([origin + "/"]);
  const sm = await safeFetchText(`${origin}/sitemap.xml`, { accept: "application/xml,text/xml,*/*", timeoutMs: 8000 });
  if (sm.ok && sm.status < 400) {
    let entries = parseSitemap(sm.body);
    if (entries.some((e) => e.isIndex)) {
      const kids = entries.filter((e) => e.isIndex).slice(0, 3);
      entries = [];
      for (const k of kids) {
        const r = await safeFetchText(k.loc, { accept: "application/xml,text/xml,*/*", timeoutMs: 8000 });
        if (r.ok && r.status < 400) entries.push(...parseSitemap(r.body));
      }
    }
    // Prefer shallow paths (hubs/landing pages) first: they carry the most weight.
    entries
      .filter((e) => e.loc.startsWith(origin))
      .sort((a, b) => new URL(a.loc).pathname.split("/").length - new URL(b.loc).pathname.split("/").length)
      .slice(0, maxPages * 2)
      .forEach((e) => urls.add(e.loc));
  }
  const out: PageSnapshot[] = [];
  for (const url of [...urls].slice(0, maxPages)) {
    const r = await safeFetchText(url, { timeoutMs: 9000 });
    if (!r.ok || r.status >= 400) continue;
    if (!/<html|<!doctype/i.test(r.body.slice(0, 500))) continue;
    out.push(snapshotPage(r.finalUrl, r.body, r.status));
  }
  return out;
}

export function findDefects(pages: PageSnapshot[], brand: string): Defect[] {
  const origin = pages[0] ? new URL(pages[0].url).origin : "";
  const out: Defect[] = [];
  const titleCounts = new Map<string, number>();
  for (const p of pages) if (p.title) titleCounts.set(p.title.toLowerCase(), (titleCounts.get(p.title.toLowerCase()) ?? 0) + 1);
  // Hubs and shallow pages matter more; thin pages are skipped for description fixes (nothing honest to summarise).
  const weight = (p: PageSnapshot) => Math.max(20, 100 - p.path.split("/").filter(Boolean).length * 20);

  for (const p of pages) {
    const w = weight(p);
    const add = (type: DefectType, detail: string, base: number, fix: Defect["fix"]) => out.push({ type, path: p.path, url: p.url, detail, score: Math.round((base * w) / 100), fix });
    if (p.noindex) continue; // intentionally hidden pages are left alone
    if (!p.title) add("title_missing", "No <title> tag.", 90, { title: proposeTitle(p, brand) ?? undefined });
    else if (p.title.length > 65) add("title_too_long", `Title is ${p.title.length} characters and will be truncated in results.`, 45, { title: proposeTitle(p, brand) ?? undefined });
    else if (p.title.length < 15) add("title_too_short", `Title is only ${p.title.length} characters.`, 40, { title: proposeTitle(p, brand) ?? undefined });
    if (!p.description) add("description_missing", "No meta description; search engines will improvise a snippet.", 70, { description: proposeDescription(p) ?? undefined });
    else if (p.description.length < 50) add("description_too_short", `Meta description is only ${p.description.length} characters.`, 40, { description: proposeDescription(p) ?? undefined });
    else if (p.description.length > 175) add("description_too_long", `Meta description is ${p.description.length} characters and will be cut off.`, 30, { description: proposeDescription(p) ?? undefined });
    if (p.jsonLdTypes.length === 0) add("no_structured_data", "No structured data (JSON-LD) on the page.", 55, { jsonLd: proposeJsonLd(p, brand, origin) ?? undefined });
    if (!p.ogImage && p.images.length > 0) add("no_social_image", "No og:image: links shared on Facebook, LinkedIn, X and iMessage show no preview picture.", 62, { ogImage: p.images[0] });
    if (p.h1s.length === 0) add("no_h1", "No H1 heading.", 50, null);
    if (p.h1s.length > 1) add("multiple_h1", `${p.h1s.length} H1 headings.`, 20, null);
    if (!p.canonical) add("no_canonical", "No canonical link.", 25, null);
    if (p.title && (titleCounts.get(p.title.toLowerCase()) ?? 0) > 1) add("duplicate_title", "Title duplicated on other pages.", 35, { title: proposeTitle(p, brand) ?? undefined });
    if (p.internalLinks < 3 && p.wordCount > 150) add("thin_internal_links", `Only ${p.internalLinks} internal links.`, 25, null);
  }
  return out.sort((a, b) => b.score - a.score);
}

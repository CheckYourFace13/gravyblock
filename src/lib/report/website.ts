import { normalizeUrl } from "@/lib/business/normalize";
import type { WebsiteSignals } from "./types";

export type FetchedHomepage =
  | { ok: true; finalUrl: string; html: string; status: number }
  | { ok: false; error: string; finalUrl?: string };

const emptySignals: WebsiteSignals = {
  fetched: false,
  https: false,
  hasViewportMeta: false,
  hasTelLinks: false,
  hasMapEmbed: false,
  hasStructuredData: false,
  hasNearMeLanguage: false,
  hasClearCtaWords: false,
  hasHoursLanguage: false,
  hasLocationLanguage: false,
  htmlLength: 0,
};

/** Single homepage fetch for crawl + social discovery (one network round-trip per scan). */
export async function fetchWebsiteDocument(website: string | undefined): Promise<FetchedHomepage> {
  const url = website ? normalizeUrl(website) : null;
  if (!url) return { ok: false, error: "No website URL on the Google listing yet." };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "GravyBlockLocalScan/1.0 (+https://gravyblock.local)",
        accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });

    const finalUrl = res.url;
    const html = await res.text();
    return { ok: true, finalUrl, html, status: res.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export function websiteSignalsFromDocument(doc: Extract<FetchedHomepage, { ok: true }>): WebsiteSignals {
  const { html, finalUrl, status } = doc;
  const lower = html.toLowerCase();
  const https = finalUrl.startsWith("https:");

  return {
    fetched: true,
    finalUrl,
    https,
    status,
    title: matchTag(html, "title"),
    h1: matchTag(html, "h1"),
    metaDescription: matchMetaDescription(html),
    hasNoindexMeta: /<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html),
    hasViewportMeta: lower.includes('name="viewport"') || lower.includes("name='viewport'"),
    hasTelLinks: lower.includes("href=\"tel:") || lower.includes("href='tel:"),
    hasMapEmbed:
      lower.includes("google.com/maps") ||
      lower.includes("maps.google.com") ||
      lower.includes("mapbox") ||
      lower.includes("openstreetmap"),
    hasStructuredData:
      lower.includes("application/ld+json") ||
      lower.includes('itemtype="https://schema.org'),
    hasNearMeLanguage:
      /\bnear me\b/i.test(html) ||
      /\bbook (a )?table\b/i.test(html) ||
      /\breservations?\b/i.test(html) ||
      /\border online\b/i.test(html) ||
      /\bschedule\b/i.test(html) ||
      /\bget a quote\b/i.test(html),
    hasHoursLanguage:
      /\bhours?\b/i.test(html) ||
      /\bopen now\b/i.test(html) ||
      /\bclosing\b/i.test(html),
    hasLocationLanguage:
      /\baddress\b/i.test(html) ||
      /\bdirections?\b/i.test(html) ||
      /\bfind us\b/i.test(html) ||
      /\bvisit us\b/i.test(html),
    hasClearCtaWords:
      (/\bmenu\b/i.test(html) || /\bservices?\b/i.test(html) || /\bshop\b/i.test(html)) &&
      (/\bcall\b/i.test(html) || /\bcontact\b/i.test(html) || /\bvisit\b/i.test(html) || /\bhours\b/i.test(html)),
    htmlLength: html.length,
  };
}

export async function fetchWebsiteSignals(website: string | undefined): Promise<WebsiteSignals> {
  const doc = await fetchWebsiteDocument(website);
  if (!doc.ok) {
    return {
      ...emptySignals,
      fetched: Boolean(doc.finalUrl),
      error: doc.error,
      finalUrl: doc.finalUrl,
    };
  }
  return websiteSignalsFromDocument(doc);
}

function matchTag(html: string, tag: string) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = html.match(re);
  if (!m?.[1]) return undefined;
  return decodeEntities(m[1].replace(/\s+/g, " ").trim()).slice(0, 120);
}

function matchMetaDescription(html: string) {
  const m = html.match(
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
  );
  if (m?.[1]) return decodeEntities(m[1]).slice(0, 220);
  const m2 = html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i,
  );
  return m2?.[1] ? decodeEntities(m2[1]).slice(0, 220) : undefined;
}

function decodeEntities(input: string) {
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

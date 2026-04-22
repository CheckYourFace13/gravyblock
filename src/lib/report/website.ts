import { normalizeUrl } from "@/lib/business/normalize";
import type { WebsiteSignals } from "./types";

export async function fetchWebsiteSignals(
  website: string | undefined,
): Promise<WebsiteSignals> {
  const base: WebsiteSignals = {
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

  const url = website ? normalizeUrl(website) : null;
  if (!url) return base;

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
    const https = finalUrl.startsWith("https:");
    const html = await res.text();
    const lower = html.toLowerCase();

    return {
      fetched: true,
      finalUrl,
      https,
      status: res.status,
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
        /\bbook a table\b/i.test(html) ||
        /\breservations?\b/i.test(html) ||
        /\border online\b/i.test(html),
      hasHoursLanguage:
        /\bhours?\b/i.test(html) ||
        /\bopen now\b/i.test(html) ||
        /\bclosing\b/i.test(html),
      hasLocationLanguage:
        /\baddress\b/i.test(html) ||
        /\bdirections?\b/i.test(html) ||
        /\bfind us\b/i.test(html),
      hasClearCtaWords:
        /\bmenu\b/i.test(html) &&
        (/\bcall\b/i.test(html) || /\bvisit\b/i.test(html) || /\bhours\b/i.test(html)),
      htmlLength: html.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      ...base,
      fetched: true,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
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

/**
 * Deterministic fact extraction from a company's OWN web pages. No LLM, no
 * guessing: a fact is only emitted when the page literally states it (JSON-LD,
 * tel:/mailto: links, titles, headings, dates). Everything carries a
 * confidence so downstream generators can prefer authoritative structured data
 * over heading-derived hints.
 */

export type FactKey =
  | "name"
  | "phone"
  | "email"
  | "address"
  | "city"
  | "region"
  | "service"
  | "service_area"
  | "hours"
  | "description"
  | "page_topic"
  | "recent_content"
  | "social_url"
  | "search_demand"
  | "owner_note"
  | "image";

export type ExtractedFact = {
  key: FactKey;
  value: string;
  confidence: number;
  stability: "stable" | "time_sensitive";
  sourceSystem: "website" | "sitemap" | "gbp" | "gsc" | "owner";
  sourceUrl: string | null;
  sourceUpdatedAt?: Date | null;
};

/** Keys that hold exactly one true value at a time (a new value replaces the old one). */
export const SINGLE_VALUED_KEYS: ReadonlySet<FactKey> = new Set<FactKey>([
  "name",
  "phone",
  "email",
  "address",
  "city",
  "region",
  "hours",
  "description",
]);

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };

export function cleanText(input: string | null | undefined, max = 300): string {
  if (!input) return "";
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function tag(html: string, name: string): string {
  const m = html.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return cleanText(m?.[1], 200);
}

function allTags(html: string, name: string, limit: number): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < limit) {
    const t = cleanText(m[1], 140);
    if (t.length >= 4) out.push(t);
  }
  return out;
}

function meta(html: string, attr: "name" | "property", value: string): string {
  const re1 = new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${value}["']`, "i");
  return cleanText(html.match(re1)?.[1] ?? html.match(re2)?.[1], 400);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export function extractJsonLd(html: string): Json[] {
  const out: Json[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1]!.trim());
      const stack: Json[] = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        out.push(node);
        if (Array.isArray(node["@graph"])) stack.push(...node["@graph"]);
      }
    } catch {
      /* malformed JSON-LD — ignore, never guess */
    }
  }
  return out;
}

function typesOf(node: Json): string[] {
  const t = node?.["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
}

function asDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const SOCIAL_HOSTS = /(facebook\.com|instagram\.com|linkedin\.com|youtube\.com|tiktok\.com|twitter\.com|x\.com)\//i;
const SERVICE_PATH = /\/(services?|what-we-do|our-work|treatments?|menu|capabilities|solutions|products?|offerings|specialt(y|ies)|packages?|rentals?|charters?)(\/|$)/i;
const CONTENT_PATH = /\/(blog|news|posts?|projects?|portfolio|gallery|case-stud(y|ies)|events?|updates?|stories|articles?)(\/|$)/i;

export function isServicePath(url: string): boolean {
  try {
    return SERVICE_PATH.test(new URL(url).pathname);
  } catch {
    return false;
  }
}
export function isContentPath(url: string): boolean {
  try {
    return CONTENT_PATH.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function factsFromHtml(html: string, url: string, opts: { isHomepage: boolean; lastModified?: Date | null }): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const push = (f: Omit<ExtractedFact, "sourceSystem" | "sourceUrl"> & { sourceSystem?: ExtractedFact["sourceSystem"] }) => {
    if (!f.value || f.value.length < 2) return;
    facts.push({ sourceSystem: "website", sourceUrl: url, ...f });
  };

  // ── Structured data (highest confidence) ────────────────────────────────
  for (const node of extractJsonLd(html)) {
    const types = typesOf(node);
    const isOrg = types.some((t) => /(Business|Organization|Store|Restaurant|Service|Place|Clinic|Dentist|Attorney|Contractor|Plumber|Electrician|Salon|Spa|Hotel|Gym)/i.test(t));
    if (isOrg && opts.isHomepage) {
      if (typeof node.name === "string") push({ key: "name", value: cleanText(node.name, 120), confidence: 88, stability: "stable" });
      if (typeof node.description === "string") push({ key: "description", value: cleanText(node.description, 400), confidence: 82, stability: "stable" });
      if (typeof node.telephone === "string") push({ key: "phone", value: cleanText(node.telephone, 30), confidence: 88, stability: "stable" });
      if (typeof node.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(node.email)) push({ key: "email", value: node.email.toLowerCase(), confidence: 88, stability: "stable" });
      const addr = node.address;
      if (addr && typeof addr === "object") {
        const line = [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode].filter((x) => typeof x === "string" && x).join(", ");
        if (line) push({ key: "address", value: cleanText(line, 200), confidence: 88, stability: "stable" });
        if (typeof addr.addressLocality === "string") push({ key: "city", value: cleanText(addr.addressLocality, 80), confidence: 88, stability: "stable" });
        if (typeof addr.addressRegion === "string") push({ key: "region", value: cleanText(addr.addressRegion, 40), confidence: 88, stability: "stable" });
      } else if (typeof addr === "string") {
        push({ key: "address", value: cleanText(addr, 200), confidence: 80, stability: "stable" });
      }
      const hoursRaw = node.openingHours ?? node.openingHoursSpecification;
      if (hoursRaw) {
        const spec = (Array.isArray(hoursRaw) ? hoursRaw : [hoursRaw])
          .map((h: Json) =>
            typeof h === "string"
              ? h
              : [Array.isArray(h?.dayOfWeek) ? h.dayOfWeek.join("/") : h?.dayOfWeek, h?.opens, h?.closes].filter(Boolean).join(" "),
          )
          .filter(Boolean)
          .join("; ");
        if (spec) push({ key: "hours", value: cleanText(spec, 300), confidence: 85, stability: "stable" });
      }
      const areas = Array.isArray(node.areaServed) ? node.areaServed : node.areaServed ? [node.areaServed] : [];
      for (const a of areas) {
        const n = typeof a === "string" ? a : a?.name;
        if (typeof n === "string") push({ key: "service_area", value: cleanText(n, 80), confidence: 85, stability: "stable" });
      }
      const sameAs = Array.isArray(node.sameAs) ? node.sameAs : node.sameAs ? [node.sameAs] : [];
      for (const s of sameAs) if (typeof s === "string" && SOCIAL_HOSTS.test(s)) push({ key: "social_url", value: s, confidence: 85, stability: "stable" });
      const offers = [
        ...(Array.isArray(node.makesOffer) ? node.makesOffer : []),
        ...(Array.isArray(node.hasOfferCatalog?.itemListElement) ? node.hasOfferCatalog.itemListElement : []),
      ];
      for (const o of offers) {
        const n = o?.name ?? o?.itemOffered?.name;
        if (typeof n === "string") push({ key: "service", value: cleanText(n, 100), confidence: 85, stability: "stable" });
      }
    }
    if (types.some((t) => /(Article|BlogPosting|NewsArticle|Event)/i.test(t)) && typeof node.headline === "string") {
      const published = asDate(node.datePublished ?? node.startDate);
      push({
        key: "recent_content",
        value: cleanText(node.headline, 160),
        confidence: 80,
        stability: "time_sensitive",
        sourceUpdatedAt: asDate(node.dateModified) ?? published,
      });
    }
  }

  // ── HTML signals ────────────────────────────────────────────────────────
  // The company's own imagery (og:image) — the only images ever reused on its profiles.
  const ogImage = meta(html, "property", "og:image");
  if (ogImage) {
    try {
      const abs = new URL(ogImage, url).toString();
      if (/^https:\/\//i.test(abs) && /\.(jpe?g|png|webp)(\?|$)/i.test(abs)) push({ key: "image", value: abs, confidence: 65, stability: "stable" });
    } catch {
      /* ignore */
    }
  }

  const title = tag(html, "title");
  const h1 = tag(html, "h1");
  const metaDesc = meta(html, "name", "description") || meta(html, "property", "og:description");

  if (opts.isHomepage) {
    const siteName = meta(html, "property", "og:site_name");
    if (siteName) push({ key: "name", value: siteName, confidence: 62, stability: "stable" });
    if (metaDesc) push({ key: "description", value: metaDesc, confidence: 58, stability: "stable" });
    if (title) push({ key: "page_topic", value: title, confidence: 50, stability: "stable" });
    for (const h of allTags(html, "h2", 8)) push({ key: "page_topic", value: h, confidence: 42, stability: "stable" });

    const tel = html.match(/href=["']tel:([+\d()\-.\s]{7,25})["']/i)?.[1];
    if (tel) push({ key: "phone", value: cleanText(tel, 30), confidence: 75, stability: "stable" });
    const mail = html.match(/href=["']mailto:([^"'?\s]+)/i)?.[1];
    if (mail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) push({ key: "email", value: mail.toLowerCase(), confidence: 75, stability: "stable" });
    const socials = new Set<string>();
    const reSocial = /href=["'](https?:\/\/[^"']*(?:facebook\.com|instagram\.com|linkedin\.com|youtube\.com|tiktok\.com)\/[^"']+)["']/gi;
    let sm: RegExpExecArray | null;
    while ((sm = reSocial.exec(html)) && socials.size < 6) socials.add(sm[1]!.replace(/[?#].*$/, ""));
    for (const s of socials) push({ key: "social_url", value: s, confidence: 70, stability: "stable" });
  }

  if (isServicePath(url)) {
    const label = h1 || title;
    if (label) push({ key: "service", value: label, confidence: 66, stability: "stable", sourceSystem: "sitemap" });
    for (const h of allTags(html, "h2", 6)) push({ key: "page_topic", value: h, confidence: 42, stability: "stable", sourceSystem: "sitemap" });
  }

  if (isContentPath(url) && !/\/(blog|news|posts?|projects?|portfolio|gallery|events?|updates?|stories|articles?)\/?$/i.test(new URL(url).pathname)) {
    const label = h1 || title;
    const published =
      asDate(meta(html, "property", "article:published_time")) ??
      asDate(html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1]) ??
      opts.lastModified ??
      null;
    if (label) {
      push({
        key: "recent_content",
        value: label,
        confidence: 72,
        stability: "time_sensitive",
        sourceSystem: "sitemap",
        sourceUpdatedAt: published,
      });
    }
  }

  return facts;
}

/** Parse <loc>/<lastmod> pairs from a sitemap or sitemap index. */
export function parseSitemap(xml: string): { loc: string; lastmod: Date | null; isIndex: boolean }[] {
  const isIndex = /<sitemapindex/i.test(xml);
  const out: { loc: string; lastmod: Date | null; isIndex: boolean }[] = [];
  const re = /<(url|sitemap)>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && out.length < 500) {
    const loc = m[2]!.match(/<loc>\s*([^<\s]+)\s*<\/loc>/i)?.[1];
    if (!loc) continue;
    out.push({ loc, lastmod: asDate(m[2]!.match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i)?.[1]), isIndex });
  }
  return out;
}

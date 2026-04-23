import type { DiscoveredSocialProfile, SocialPresenceSummary } from "@/lib/report/types";

const PLATFORMS = [
  { id: "facebook" as const, hosts: ["facebook.com", "fb.com", "m.facebook.com"] },
  { id: "instagram" as const, hosts: ["instagram.com"] },
  { id: "twitter" as const, hosts: ["twitter.com", "x.com"] },
  { id: "tiktok" as const, hosts: ["tiktok.com"] },
  { id: "youtube" as const, hosts: ["youtube.com", "youtu.be"] },
  { id: "linkedin" as const, hosts: ["linkedin.com"] },
];

function hostOf(u: string): string | null {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function platformForUrl(url: string): DiscoveredSocialProfile["platform"] | null {
  const h = hostOf(url);
  if (!h) return null;
  for (const p of PLATFORMS) {
    if (p.hosts.some((x) => h === x || h.endsWith(`.${x}`))) return p.id;
  }
  return null;
}

function normalizeSocialUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/^\/+/, "");
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "") || "";
    return `${u.protocol}//${u.host.toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

function extractHandle(platform: DiscoveredSocialProfile["platform"], url: string): string | undefined {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (platform === "instagram" || platform === "tiktok") return parts[0]?.replace(/^@/, "");
    if (platform === "twitter") return parts[0]?.replace(/^@/, "");
    if (platform === "facebook") return parts.join("/").slice(0, 80) || undefined;
    if (platform === "youtube") {
      if (parts[0] === "channel" || parts[0] === "c") return parts[1];
      if (parts[0]?.startsWith("@")) return parts[0].replace(/^@/, "");
    }
    if (platform === "linkedin") return parts[1] === "company" || parts[1] === "in" ? parts[2] : parts[0];
  } catch {
    return undefined;
  }
  return undefined;
}

function extractHrefUrls(html: string): string[] {
  const out: string[] = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1];
    if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) continue;
    out.push(raw);
  }
  return out;
}

function extractJsonLdSameAs(html: string): string[] {
  const urls: string[] = [];
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const s of scripts) {
    const text = s[1]?.trim();
    if (!text) continue;
    try {
      const data = JSON.parse(text) as unknown;
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (node && typeof node === "object" && "sameAs" in node) {
          const sa = (node as { sameAs?: unknown }).sameAs;
          if (Array.isArray(sa)) {
            for (const u of sa) {
              if (typeof u === "string") urls.push(u);
            }
          } else if (typeof sa === "string") {
            urls.push(sa);
          }
        }
      }
    } catch {
      /* ignore invalid JSON-LD */
    }
  }
  return urls;
}

function recentYearNear(html: string, needle: string, windowChars = 500): boolean {
  const idx = html.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return false;
  const slice = html.slice(Math.max(0, idx - windowChars), idx + windowChars);
  return /\b20(2[4-9]|3\d)\b/.test(slice);
}

function pathDepth(url: string): number {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    return 0;
  }
}

function activityHintFor(url: string, html: string): DiscoveredSocialProfile["activityHint"] {
  let needle = url;
  try {
    needle = new URL(url).hostname;
  } catch {
    /* keep full */
  }
  if (recentYearNear(html, needle)) return "possibly_active";
  if (pathDepth(url) <= 1) return "basic_only";
  return "unknown";
}

function dedupeProfiles(rows: DiscoveredSocialProfile[]): DiscoveredSocialProfile[] {
  const best = new Map<string, DiscoveredSocialProfile>();
  for (const r of rows) {
    const key = `${r.platform}:${r.url.split("?")[0].toLowerCase()}`;
    const prev = best.get(key);
    if (!prev || r.confidence > prev.confidence) best.set(key, r);
  }
  return [...best.values()];
}

function scorePresence(profiles: DiscoveredSocialProfile[], websiteLinkCount: number): number {
  if (!profiles.length) return Math.min(55, 38 + Math.min(12, websiteLinkCount * 4));
  let s = 48;
  const platforms = new Set(profiles.map((p) => p.platform));
  s += Math.min(24, platforms.size * 6);
  const highConf = profiles.filter((p) => p.confidence >= 78).length;
  s += Math.min(12, highConf * 4);
  const activeish = profiles.filter((p) => p.activityHint === "possibly_active").length;
  s += Math.min(10, activeish * 3);
  s += Math.min(8, websiteLinkCount * 2);
  return Math.max(12, Math.min(96, Math.round(s)));
}

/**
 * First-pass discovery from public HTML + Places website URL only.
 * Does not call platform APIs — labels stay on “publicly observable” signals.
 */
export function buildSocialPresence(input: {
  businessName?: string;
  primaryWebsite?: string;
  html?: string;
  finalUrl?: string;
  fetchNotes?: string;
}): SocialPresenceSummary {
  const rows: DiscoveredSocialProfile[] = [];
  const html = input.html ?? "";

  for (const raw of extractJsonLdSameAs(html)) {
    const url = normalizeSocialUrl(raw);
    if (!url) continue;
    const platform = platformForUrl(url);
    if (!platform) continue;
    rows.push({
      platform,
      url,
      handle: extractHandle(platform, url),
      discoverySource: "json_ld_same_as",
      confidence: 88,
      activityHint: activityHintFor(url, html),
      notes: "Listed in structured data (JSON-LD) on the crawled page.",
    });
  }

  for (const raw of extractHrefUrls(html)) {
    let resolved = raw;
    if (raw.startsWith("//")) resolved = `https:${raw}`;
    else if (raw.startsWith("/") && input.finalUrl) {
      try {
        resolved = new URL(raw, input.finalUrl).toString();
      } catch {
        continue;
      }
    }
    const url = normalizeSocialUrl(resolved);
    if (!url) continue;
    const platform = platformForUrl(url);
    if (!platform) continue;
    const idx = html.toLowerCase().indexOf(raw.toLowerCase());
    const before = idx >= 0 ? html.slice(Math.max(0, idx - 8000), idx).toLowerCase() : "";
    const inFooter = before.includes("<footer");
    rows.push({
      platform,
      url,
      handle: extractHandle(platform, url),
      discoverySource: inFooter ? "website_footer_nav" : "website_html",
      confidence: inFooter ? 64 : 72,
      activityHint: activityHintFor(url, html),
      notes: inFooter ? "Link found in footer / late-page region of homepage HTML." : "Link found in homepage HTML (header, body, or nav).",
    });
  }

  const deduped = dedupeProfiles(rows);
  const socialOnly = deduped;
  const websiteSocialLinkCount = socialOnly.filter((r) =>
    ["website_html", "website_footer_nav", "json_ld_same_as"].includes(r.discoverySource),
  ).length;

  const methodology =
    "Observed from public homepage HTML and your Google listing website URL only. We do not log into social platforms or pull private analytics — presence, link consistency, and light HTML cues (e.g. recent years near outbound links) are indicative, not definitive.";

  const signalsNote =
    socialOnly.length === 0
      ? "No major social network URLs were detected in the fetched homepage markup. You may still have profiles that use different domains or are only linked from interior pages."
      : `${socialOnly.length} public profile URL(s) detected across ${new Set(socialOnly.map((p) => p.platform)).size} platform(s). Treat activity hints as directional; confirm inside each network.`;

  return {
    methodology,
    profiles: deduped,
    score: scorePresence(socialOnly, websiteSocialLinkCount),
    signalsNote,
    websiteSocialLinkCount,
    crawlNotes: input.fetchNotes,
  };
}

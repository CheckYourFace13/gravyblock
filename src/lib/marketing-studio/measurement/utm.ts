/**
 * Privacy-safe campaign tagging for links in Studio posts. Only coarse, non-personal labels are added: where the click came from, which
 * product campaign and which creative idea. No user identifier, email or per-person token is ever put in a URL.
 */
export type UtmInput = { platform: string; campaign: string | null; family: string | null; publicationId: string };

const slug = (v: string, max = 40) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max) || "studio";

/** The short id lets a visit be matched back to exactly one publication without exposing the full row id. */
export const utmIdFor = (publicationId: string) => `ms_${publicationId.replace(/-/g, "").slice(0, 10)}`;

export function withUtm(url: string, input: UtmInput): string {
  const u = new URL(url);
  // Never overwrite tags the product already uses, and never tag a link that already carries a campaign.
  if (u.searchParams.has("utm_source") || u.searchParams.has("utm_campaign")) return u.toString();
  u.searchParams.set("utm_source", slug(input.platform));
  u.searchParams.set("utm_medium", "social");
  u.searchParams.set("utm_campaign", slug(input.campaign ?? "studio"));
  if (input.family) u.searchParams.set("utm_content", slug(input.family));
  u.searchParams.set("utm_id", utmIdFor(input.publicationId));
  return u.toString();
}

/** Replaces the plain link in a caption with the tagged one, or appends the call to action when the caption has no link yet. */
export function applyUtmToCaption(caption: string, ctaUrl: string, tagged: string, ctaText: string | null): string {
  if (caption.includes(ctaUrl)) return caption.split(ctaUrl).join(tagged);
  const label = ctaText?.trim() ? `${ctaText.trim()}: ` : "";
  return `${caption.trimEnd()}\n\n${label}${tagged}`;
}

/** True when a caption holds a link other than the product's own call to action. */
export function foreignLinks(caption: string, allowedHost: string): string[] {
  const found = caption.match(/https?:\/\/[^\s)]+/gi) ?? [];
  return found.filter((l) => {
    try {
      return new URL(l).host.replace(/^www\./, "") !== allowedHost.replace(/^www\./, "");
    } catch {
      return true;
    }
  });
}

/**
 * Finds a real, published contact email on a business's own website instead
 * of inventing one from the domain name. Previously cold outreach and backlink
 * outreach both constructed addresses like `info@{domain}` or
 * `partnerships@{domain}` out of thin air, with no check that the mailbox was
 * ever published anywhere — meaning every send was a guess with an unknown
 * (likely high) bounce rate, hurting GravyBlock's own sending-domain
 * reputation. This fetches the site and looks for a `mailto:` link actually
 * present on the page; if none exists, callers should skip rather than guess.
 */

export type ContactSource = "website_mailto" | "none_found" | "fetch_failed";
export type ContactConfidence = "verified_published" | "none";

export type DiscoveredContact = {
  email: string | null;
  source: ContactSource;
  confidence: ContactConfidence;
};

const FETCH_TIMEOUT_MS = 6000;
const ROLE_ACCOUNT_PREFIXES = ["info", "contact", "hello", "office", "admin", "support"];

function scoreCandidate(email: string, siteDomain: string): number {
  const [local, domain] = email.toLowerCase().split("@");
  if (!domain) return -1;
  // Prefer an address on the business's own domain over a third-party one
  // (e.g. a linked Gmail/Yahoo address) picked up incidentally on the page.
  const sameDomain = domain === siteDomain || domain.endsWith(`.${siteDomain}`);
  if (!sameDomain) return 0;
  // A named/departmental mailbox is a stronger signal than a generic role
  // account, but a same-domain role account is still a real, published
  // address — not an invented one — so it's still usable, just lower ranked.
  return ROLE_ACCOUNT_PREFIXES.includes(local) ? 1 : 2;
}

/** Fetch a business's homepage and return the best real, published contact email found, if any. */
export async function discoverContactEmail(websiteUrl: string): Promise<DiscoveredContact> {
  let siteDomain: string;
  try {
    siteDomain = new URL(websiteUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return { email: null, source: "fetch_failed", confidence: "none" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(websiteUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GravyBlockBot/1.0; +https://gravyblock.com)" },
    });
    if (!res.ok) return { email: null, source: "fetch_failed", confidence: "none" };
    const html = await res.text();

    const matches = [...html.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi)].map((m) =>
      m[1].toLowerCase(),
    );
    const unique = [...new Set(matches)];
    if (!unique.length) return { email: null, source: "none_found", confidence: "none" };

    const best = unique
      .map((email) => ({ email, score: scoreCandidate(email, siteDomain) }))
      .sort((a, b) => b.score - a.score)[0];

    if (!best || best.score <= 0) return { email: null, source: "none_found", confidence: "none" };
    return { email: best.email, source: "website_mailto", confidence: "verified_published" };
  } catch {
    return { email: null, source: "fetch_failed", confidence: "none" };
  } finally {
    clearTimeout(timer);
  }
}

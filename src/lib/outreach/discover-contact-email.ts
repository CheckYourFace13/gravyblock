/**
 * Finds a real, published contact email on a business's own website instead
 * of inventing one from the domain name. Previously cold outreach and backlink
 * outreach both constructed addresses like `info@{domain}` or
 * `partnerships@{domain}` out of thin air, with no check that the mailbox was
 * ever published anywhere — meaning every send was a guess with an unknown
 * (likely high) bounce rate, hurting GravyBlock's own sending-domain
 * reputation.
 *
 * Checks the homepage first, then — if no NAMED (non-role-account) address
 * turned up there — a small set of pages a real business is likely to
 * publish contact info on (contact/about/team), plus any schema.org
 * structured data (Organization/LocalBusiness/Person contactPoint). Every
 * candidate still has to be a real `mailto:`/structured-data value actually
 * present on a page this business controls — if none exists anywhere,
 * callers should skip rather than guess.
 */

export type ContactSource = "website_mailto" | "structured_data" | "none_found" | "fetch_failed";
export type ContactConfidence = "verified_published" | "none";

export type DiscoveredContact = {
  email: string | null;
  source: ContactSource;
  confidence: ContactConfidence;
  /** Exact page this email was found on — for the discovery-quality record, never shown to the recipient. */
  discoverySourceUrl: string | null;
  /** false for a role account (info@, contact@, ...) even though it's still a genuinely published, usable address. */
  isNamed: boolean;
};

const FETCH_TIMEOUT_MS = 6000;
const ROLE_ACCOUNT_PREFIXES = ["info", "contact", "hello", "office", "admin", "support"];

// Never usable as an outreach recipient regardless of domain — these are
// designed not to receive real correspondence (auto-reply/bounce mailboxes),
// not just a lower-quality role account.
const EXCLUDED_PREFIXES = ["noreply", "no-reply", "donotreply", "do-not-reply", "webmaster", "postmaster", "mailer-daemon"];

// Template artifacts left uncustomized (e.g. a theme's placeholder
// "info@yourdomain.com") are not a real published contact for that business.
const PLACEHOLDER_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "yourdomain.com",
  "yoursite.com",
  "domain.com",
  "email.com",
  "mydomain.com",
  "website.com",
  "localhost",
]);

// Checked only if the homepage itself doesn't already yield a named
// (non-role-account) address — most small-business sites that publish a
// real contact do it on one of these. Kept short and specific: not a full
// site crawl, just the pages a business is likely to actually have.
const SECONDARY_PATHS = ["/contact", "/contact-us", "/about", "/about-us", "/team"];

const EMAIL_RE = /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

type Candidate = { email: string; sourceUrl: string; fromStructuredData: boolean };

function scoreCandidate(email: string, siteDomain: string): number {
  const [local, domain] = email.toLowerCase().split("@");
  if (!domain) return -1;
  if (EXCLUDED_PREFIXES.includes(local)) return -1;
  if (PLACEHOLDER_DOMAINS.has(domain)) return -1;
  // Prefer an address on the business's own domain over a third-party one
  // (e.g. a linked Gmail/Yahoo address) picked up incidentally on the page.
  const sameDomain = domain === siteDomain || domain.endsWith(`.${siteDomain}`);
  if (!sameDomain) return 0;
  // A named/departmental mailbox is a stronger signal than a generic role
  // account, but a same-domain role account is still a real, published
  // address — not an invented one — so it's still usable, just lower ranked.
  return ROLE_ACCOUNT_PREFIXES.includes(local) ? 1 : 2;
}

function isNamedAddress(email: string): boolean {
  const local = email.toLowerCase().split("@")[0] ?? "";
  return !ROLE_ACCOUNT_PREFIXES.includes(local) && !EXCLUDED_PREFIXES.includes(local);
}

async function fetchPage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GravyBlockBot/1.0; +https://gravyblock.com)" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** mailto: links actually present on the page — decoded, deduped, validated. */
function extractMailtoCandidates(html: string, sourceUrl: string): Candidate[] {
  // mailto: hrefs are sometimes percent-encoded by the site itself (a stray
  // leading space becomes %20admin@...) — decode first, then trim, then
  // validate strictly. Matching raw percent-encoded text directly let
  // malformed addresses like "%20admin@shroylaw.com" through uncaught.
  const rawMatches = [...html.matchAll(/mailto:[ \t]*([^"'<>\s)]+)/gi)].map((m) => m[1]);
  const emails = rawMatches
    .map((raw) => {
      try {
        return decodeURIComponent(raw.split("?")[0] ?? raw).trim().toLowerCase();
      } catch {
        return raw.split("?")[0]?.trim().toLowerCase() ?? "";
      }
    })
    .filter((email) => EMAIL_RE.test(email));
  return [...new Set(emails)].map((email) => ({ email, sourceUrl, fromStructuredData: false }));
}

/**
 * schema.org structured data (JSON-LD) — Organization/LocalBusiness/Person
 * commonly publish an `email` field directly, or nest one under
 * `contactPoint`. This is business-controlled published data, same standing
 * as a mailto: link, just a different place to look for it.
 */
function extractStructuredDataCandidates(html: string, sourceUrl: string): Candidate[] {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(
    (m) => m[1] ?? "",
  );
  const found: string[] = [];
  for (const block of blocks) {
    try {
      const parsed: unknown = JSON.parse(block);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        collectEmailFields(node, found);
      }
    } catch {
      // Malformed JSON-LD is common (trailing commas, HTML comments inside) — skip, don't crash discovery.
    }
  }
  const emails = found.map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e));
  return [...new Set(emails)].map((email) => ({ email, sourceUrl, fromStructuredData: true }));
}

function collectEmailFields(node: unknown, out: string[], depth = 0): void {
  if (!node || typeof node !== "object" || depth > 4) return;
  const obj = node as Record<string, unknown>;
  if (typeof obj.email === "string") out.push(obj.email.replace(/^mailto:/i, ""));
  for (const key of ["contactPoint", "employee", "member", "founder"]) {
    const value = obj[key];
    if (Array.isArray(value)) value.forEach((v) => collectEmailFields(v, out, depth + 1));
    else if (value) collectEmailFields(value, out, depth + 1);
  }
}

function bestCandidate(candidates: Candidate[], siteDomain: string): Candidate | null {
  const scored = candidates
    .map((c) => ({ c, score: scoreCandidate(c.email, siteDomain) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.c.fromStructuredData === b.c.fromStructuredData ? 0 : a.c.fromStructuredData ? -1 : 1));
  return scored[0]?.c ?? null;
}

/** Fetch a business's site (homepage, then contact/about/team if needed) for the best real, published contact email. */
export async function discoverContactEmail(websiteUrl: string): Promise<DiscoveredContact> {
  let siteDomain: string;
  let origin: string;
  try {
    const parsed = new URL(websiteUrl);
    siteDomain = parsed.hostname.replace(/^www\./, "").toLowerCase();
    origin = parsed.origin;
  } catch {
    return { email: null, source: "fetch_failed", confidence: "none", discoverySourceUrl: null, isNamed: false };
  }

  const homepageHtml = await fetchPage(websiteUrl);
  if (homepageHtml === null) {
    return { email: null, source: "fetch_failed", confidence: "none", discoverySourceUrl: null, isNamed: false };
  }

  let candidates = [
    ...extractMailtoCandidates(homepageHtml, websiteUrl),
    ...extractStructuredDataCandidates(homepageHtml, websiteUrl),
  ];

  let winner = bestCandidate(candidates, siteDomain);

  // Homepage already gave us a real named contact — good enough, no need to
  // spend more requests checking secondary pages.
  if (!winner || !isNamedAddress(winner.email)) {
    const secondaryResults = await Promise.allSettled(
      SECONDARY_PATHS.map(async (path) => {
        const url = `${origin}${path}`;
        const html = await fetchPage(url);
        return html ? { url, html } : null;
      }),
    );
    for (const result of secondaryResults) {
      if (result.status !== "fulfilled" || !result.value) continue;
      const { url, html } = result.value;
      candidates = [...candidates, ...extractMailtoCandidates(html, url), ...extractStructuredDataCandidates(html, url)];
    }
    const improved = bestCandidate(candidates, siteDomain);
    if (improved && (!winner || scoreCandidate(improved.email, siteDomain) > scoreCandidate(winner.email, siteDomain) || isNamedAddress(improved.email))) {
      winner = improved;
    }
  }

  if (!winner) {
    return { email: null, source: "none_found", confidence: "none", discoverySourceUrl: null, isNamed: false };
  }

  return {
    email: winner.email,
    source: winner.fromStructuredData ? "structured_data" : "website_mailto",
    confidence: "verified_published",
    discoverySourceUrl: winner.sourceUrl,
    isNamed: isNamedAddress(winner.email),
  };
}

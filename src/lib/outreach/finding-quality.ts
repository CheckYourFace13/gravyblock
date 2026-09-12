/**
 * Classifies a report finding's fitness as a cold-outreach hook — independent
 * of the report's own internal "impact" field, which ranks by product
 * severity, not by how specific/verifiable/compelling the finding reads in
 * an email. Grounded in the real finding-id taxonomy from
 * src/lib/report/generator.ts and src/lib/audit/site-crawl.ts.
 *
 * Built from a 45-send audit of the current clean cold-outreach system:
 * "Estimated map & local-query visibility is soft" (canonical-estimated-
 * local-visibility) is a MODELED estimate, not a verified fact — its own
 * detail text says so ("modeled directional data") — and it was the top
 * finding on nearly every prospect scanned, including businesses with
 * genuinely strong listings. That ubiquity is exactly what makes it a weak
 * personalization hook: it doesn't read as something a person actually
 * noticed about THIS business.
 */

export type FindingStrength = "strong" | "medium" | "weak";

// Report fix ids are always prefixed "fix-" (see issuesToFixes in
// src/lib/report/generator.ts, id: `fix-${issue.id}`) — match against that
// prefixed form, matching what's actually persisted in reports.payload.

const WEAK_IDS = new Set([
  "fix-canonical-estimated-local-visibility",
  "fix-lr-cross-ref-estimated-visibility",
  "fix-gp-types-thin",
]);

const MEDIUM_IDS = new Set([
  "fix-place-rating-missing",
  "fix-place-review-volume",
  "fix-social-none-found",
  "fix-social-single-channel",
]);

// Everything from a real site crawl (verified, specific, actionable) plus
// verified Google Places facts that are unambiguous (low rating) or real
// connected Search Console data (rare for cold prospects, but strong when present).
const STRONG_PREFIXES = ["fix-crawl-"];
const STRONG_IDS = new Set(["fix-place-rating-low", "fix-gsc-position"]);

export function classifyFindingStrength(findingId: string | null | undefined): FindingStrength {
  if (!findingId) return "weak";
  if (STRONG_IDS.has(findingId) || STRONG_PREFIXES.some((p) => findingId.startsWith(p))) return "strong";
  if (MEDIUM_IDS.has(findingId)) return "medium";
  if (WEAK_IDS.has(findingId)) return "weak";
  // Unknown id (taxonomy changed) — fail toward stricter targeting, not looser.
  return "weak";
}

/** Eligibility gate for item 9: only strong/medium findings justify automatic cold outreach. */
export function isEligibleForOutreach(findingId: string | null | undefined): boolean {
  const strength = classifyFindingStrength(findingId);
  return strength === "strong" || strength === "medium";
}

/**
 * A natural, non-report-jargon phrasing of a finding, meant to complete the
 * sentence "I noticed ___" or "noticed something about your Google presence:
 * ___" in a cold email. Deliberately plain — no report terminology, no
 * severity/impact language, no numbers unless the number itself is the point.
 */
const NATURAL_PHRASES: Record<string, string> = {
  "fix-crawl-hours-clarity": "your hours aren't clearly listed on your site, which can cost you calls from people checking if you're open",
  "fix-crawl-tel-link-missing": "your website doesn't have a clickable phone number, so mobile visitors have to type it in manually",
  "fix-crawl-cta-clarity": "it's not obvious what you want a visitor to do first when they land on your homepage",
  "fix-crawl-h1-missing": "your homepage is missing a clear main heading, which can hurt how Google reads the page",
  "fix-crawl-title-missing": "your homepage doesn't have a page title set — one of the first things Google looks at",
  "fix-crawl-meta-description": "your homepage doesn't have a meta description, so Google has to guess what to show in search results",
  "fix-crawl-schema-missing": "your site doesn't have structured data set up, which helps Google understand exactly what kind of business you are",
  "fix-crawl-mobile-viewport": "your site isn't set up properly for mobile screens",
  "fix-crawl-indexability-noindex": "your site may be telling Google not to index it — worth a quick check",
  "fix-crawl-no-website": "I couldn't actually load a website from your Google listing",
  "fix-crawl-error": "I couldn't load your website when I checked",
  "fix-crawl-location-clarity": "it's not clear from your homepage what area you actually serve",
  "fix-place-rating-low": "your Google rating is a bit lower than what usually wins the click in your area",
  "fix-place-rating-missing": "your Google listing isn't showing a rating yet",
  "fix-place-review-volume": "you don't have as many reviews yet as the stronger listings nearby",
  "fix-social-none-found": "I couldn't find any social links on your homepage",
  "fix-social-single-channel": "your homepage only links to one social platform",
  "fix-gsc-position": "your pages are ranking, just not on page one yet for some real search terms",
};

export function naturalFindingPhrase(findingId: string | null | undefined): string | null {
  if (!findingId) return null;
  return NATURAL_PHRASES[findingId] ?? null;
}

/**
 * Subject line for a strong, specific finding — only used when the finding
 * is worth leading with (see classifyFindingStrength). Falls back to null
 * for anything not worth a dedicated subject; callers should use a neutral
 * business-name subject in that case rather than inventing drama.
 */
const SUBJECT_PHRASES: Record<string, string> = {
  "fix-crawl-hours-clarity": "Your Google hours may be costing calls",
  "fix-crawl-tel-link-missing": "Noticed your site's missing a click-to-call link",
  "fix-place-rating-low": "Noticed something on your Google listing",
  "fix-gsc-position": "Quick note about your Google rankings",
};

export function findingSubjectPhrase(findingId: string | null | undefined): string | null {
  if (!findingId) return null;
  return SUBJECT_PHRASES[findingId] ?? null;
}

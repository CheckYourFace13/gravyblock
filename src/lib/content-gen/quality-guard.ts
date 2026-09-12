/**
 * Catches unfilled template artifacts that LLMs sometimes leave behind
 * (e.g. "As the owner of MicStage in [City], ...") when the prompt gave them
 * a blank or generic placeholder instead of a real value. Content that fails
 * this check must never be queued for customer approval or published —
 * treat it the same as a failed generation and let the next tick retry.
 *
 * Extended 2026-09-12 after confirming live production had been publishing
 * content this guard should have caught but didn't: titles like "Why your
 * area Residents Choose Gravy Block" and "online_brand Services in your
 * area — Gravy Block" straight to the public blog. Two real gaps: (1) the
 * LLM wrote unbracketed "your area"/"your city" when given empty location
 * data — no brackets, so the original bracket-only patterns missed it; (2) a
 * raw unresolved industry token ("online_brand") leaked directly into a
 * title, which no pattern here was checking for at all.
 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\[\s*(city|location|business ?name|company ?name|your ?name|your ?business|insert[^\]]*|name|company|service|address|state|neighborhood)\s*\]/i,
  // Generic bracket placeholder: "[Something Short]" with no punctuation inside
  /\[[A-Za-z][A-Za-z '-]{1,30}\]/,
  /\{\{[^}]+\}\}/, // {{handlebars}}-style leftovers
  /<\s*(city|location|business ?name|name|insert)[^>]*>/i,
  /\byour area\b/i,
  /\byour city\b/i,
  // A resolved industry/vertical label is always Title Case or lowercase
  // words, never underscore_separated — that shape only happens when a raw
  // internal identifier leaked through unresolved.
  /\b[a-z]+_[a-z]+\b/,
  /\/published\/[0-9a-f-]{8,}/i, // raw route id leaked into copy
];

export function containsPlaceholderArtifact(text: string | null | undefined): boolean {
  if (!text) return false;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));
}

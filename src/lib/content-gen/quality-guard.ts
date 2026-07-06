/**
 * Catches unfilled template artifacts that LLMs sometimes leave behind
 * (e.g. "As the owner of MicStage in [City], ...") when the prompt gave them
 * a blank or generic placeholder instead of a real value. Content that fails
 * this check must never be queued for customer approval or published —
 * treat it the same as a failed generation and let the next tick retry.
 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\[\s*(city|location|business ?name|company ?name|your ?name|your ?business|insert[^\]]*|name|company|service|address|state|neighborhood)\s*\]/i,
  // Generic bracket placeholder: "[Something Short]" with no punctuation inside
  /\[[A-Za-z][A-Za-z '-]{1,30}\]/,
  /\{\{[^}]+\}\}/, // {{handlebars}}-style leftovers
  /<\s*(city|location|business ?name|name|insert)[^>]*>/i,
];

export function containsPlaceholderArtifact(text: string | null | undefined): boolean {
  if (!text) return false;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));
}

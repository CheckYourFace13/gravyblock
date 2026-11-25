/**
 * Neutral public wording for GravyBlock's own test sites. Public proof pages never name those sites, link to them, or say who runs them: each appears as
 * "Internal test site N" with its industry. Free text that comes from stored records is scrubbed of the site names, domains and URLs before it is shown.
 */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function testSiteLabels(names: string[]): Map<string, string> {
  const m = new Map<string, string>();
  [...new Set(names)].sort().forEach((n, i) => m.set(n, `Internal test site ${i + 1}`));
  return m;
}

export function neutralize(text: string, names: string[], label: string): string {
  let t = text.replace(/https?:\/\/[^\s)]+/gi, "the site").replace(/\b(?:www\.)?[a-z0-9-]+\.(?:com|net|org|io|co|app|dev|us|ai)\b/gi, "the site");
  for (const n of names) if (n.trim().length >= 3) t = t.replace(new RegExp(esc(n.trim()), "gi"), label);
  return t;
}

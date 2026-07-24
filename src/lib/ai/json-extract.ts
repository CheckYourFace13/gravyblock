/**
 * Extracts the first complete JSON object from an LLM response, tracking
 * string state so braces inside quoted values (e.g. a business whose site
 * copy includes template syntax like "{{first_name}}", or any code/JSON
 * example) don't get mistaken for object boundaries, and so trailing
 * commentary the model adds after the JSON (small/cheap models don't
 * reliably follow "return ONLY JSON") doesn't get swept into the match the
 * way a naive greedy /\{[\s\S]*\}/ regex would.
 *
 * Returns the substring, or null if no balanced object is found (truncated
 * response, or no JSON at all) — callers should treat null as "retry or
 * fall back", never throw past it.
 */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // unbalanced — model got cut off or never closed the object
}

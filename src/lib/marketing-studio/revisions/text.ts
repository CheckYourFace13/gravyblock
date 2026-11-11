/** Pure text helpers for script edits: abbreviations, removing a phrase or clause, and keeping the `{marker}` anchors the timeline is built from. */
import { parseSpoken } from "../video/demo/audio";

export const WEEKDAYS: Record<string, string> = { mon: "Monday", tue: "Tuesday", tues: "Tuesday", wed: "Wednesday", weds: "Wednesday", thu: "Thursday", thur: "Thursday", thurs: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
export const MONTHS: Record<string, string> = { jan: "January", feb: "February", mar: "March", apr: "April", jun: "June", jul: "July", aug: "August", sep: "September", sept: "September", oct: "October", nov: "November", dec: "December" };

const expansion = (w: string): string | null => WEEKDAYS[w.toLowerCase().replace(/\.$/, "")] ?? MONTHS[w.toLowerCase().replace(/\.$/, "")] ?? null;

/** Abbreviated weekdays (and months, when asked for by name) found in a text. */
export function abbreviationsIn(text: string, onlyMonthsIf: string[] = []): string[] {
  const out = new Set<string>();
  for (const m of text.replace(/\{[a-z0-9_-]+\}/gi, "").match(/\b[A-Za-z]{3,5}\b\.?/g) ?? []) {
    const k = m.toLowerCase().replace(/\.$/, "");
    if (WEEKDAYS[k] && m.replace(/\.$/, "").toLowerCase() !== WEEKDAYS[k].toLowerCase()) out.add(m.replace(/\.$/, ""));
    else if (MONTHS[k] && onlyMonthsIf.map((x) => x.toLowerCase()).includes(k)) out.add(m.replace(/\.$/, ""));
  }
  return [...out];
}

/** Spells out abbreviated weekdays (every one when `only` is omitted) and any months named in `only`. Markers stay where they are. */
export function expandAbbreviations(text: string, only?: string[]): string {
  const allowed = only?.map((w) => w.toLowerCase().replace(/\.$/, ""));
  return text.replace(/(\{[a-z0-9_-]+\})?\b([A-Za-z]{3,5})\b(\.(?=\s+[a-z0-9]))?/g, (all, marker: string | undefined, word: string) => {
    const k = word.toLowerCase();
    const full = expansion(k);
    if (!full || full.toLowerCase() === k) return all;
    if (allowed ? !allowed.includes(k) : !WEEKDAYS[k]) return all;
    return `${marker ?? ""}${/^[A-Z]/.test(word) || !marker ? full : full.toLowerCase()}`;
  });
}

export const stripMarkers = (s: string) => s.replace(/\{[a-z0-9_-]+\}/gi, "").replace(/\s+/g, " ").trim();
const words = (s: string) => stripMarkers(s).toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "at", "is", "it", "that", "this", "about", "part", "section", "sentence", "line", "bit", "mention", "where", "says", "say", "talks", "talk"]);
export const keyWords = (s: string) => words(s).filter((w) => !STOP.has(w) && w.length > 2).map((w) => w.replace(/(ing|ed|es|s)$/, ""));

/** Tidies what is left of a line after something was cut out of it. */
function tidy(s: string, hadEnd: boolean): string {
  let t = s.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").replace(/([,;:])\s*([.!?])/g, "$2").replace(/^[\s,;:]+/, "").trim();
  t = t.replace(/[,;:]+$/, "").replace(/\b(and|or|so|but|then)\s*([.!?]?)$/i, "$2").replace(/[,;:]+\s*$/, "").trim();
  if (hadEnd && t && !/[.!?]$/.test(t)) t += ".";
  const m = /^((?:\{[a-z0-9_-]+\}\s*)*)([a-z])/.exec(t);
  if (m) t = m[1] + m[2].toUpperCase() + t.slice(m[1].length + 1);
  return t;
}

/** Splits a line into clauses at commas, semicolons and sentence ends, keeping each clause's exact text and position. */
function clausesOf(text: string): Array<{ from: number; to: number; text: string }> {
  const out: Array<{ from: number; to: number; text: string }> = [];
  const re = /[^,;.!?]+[,;.!?]*\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ from: m.index, to: m.index + m[0].length, text: m[0] });
  return out;
}

/**
 * Removes a phrase (matched ignoring case, punctuation and markers) from a line. When the exact words are not there, removes the clause that shares the most of the phrase's meaningful
 * words. Returns null when nothing in the line is about the phrase. `lost` are the markers that were inside the removed text, so the caller can re-home them.
 */
export function removePhrase(text: string, phrase: string): { text: string; lost: string[] } | null {
  const hadEnd = /[.!?]\s*$/.test(text);
  const pw = words(phrase);
  if (!pw.length) return null;
  const body = pw.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^a-z0-9']+(?:\\{[a-z0-9_-]+\\}[^a-z0-9']*)*");
  const exact = new RegExp(`(?:,\\s*)?(?:\\{[a-z0-9_-]+\\})?${body}`, "i").exec(text);
  let from = -1;
  let to = -1;
  if (exact) {
    from = exact.index;
    to = exact.index + exact[0].length;
  } else {
    const want = new Set(keyWords(phrase));
    if (!want.size) return null;
    let best: { from: number; to: number; score: number } | null = null;
    for (const c of clausesOf(text)) {
      const have = new Set(keyWords(c.text));
      const hit = [...want].filter((w) => have.has(w)).length;
      const score = hit / want.size;
      if (hit >= 1 && score >= 0.5 && (!best || score > best.score)) best = { from: c.from, to: c.to, score };
    }
    if (!best) return null;
    from = best.from;
    to = best.to;
  }
  if (exact) {
    // cutting the middle of a clause must not leave its introduction hanging ("flags problems, like a")
    for (;;) {
      const m = /(?:,\s*)?\b(?:like|such as|including|with|and|or|plus|a|an|the|of|for|to|about)\s+$/i.exec(text.slice(0, from));
      if (!m || m.index === 0) break;
      from = m.index;
    }
  }
  const removed = text.slice(from, to);
  const lost = [...removed.matchAll(/\{([a-z0-9_-]+)\}/gi)].map((m) => m[1]);
  return { text: tidy(text.slice(0, from) + " " + text.slice(to), hadEnd), lost };
}

type Tok = { markers: string[]; word: string };
function tokens(spoken: string): Tok[] {
  const out: Tok[] = [];
  let pending: string[] = [];
  for (const raw of spoken.trim().split(/\s+/).filter(Boolean)) {
    const m = /^\{([a-z0-9_-]+)\}(.*)$/i.exec(raw);
    if (m) {
      pending.push(m[1]);
      if (m[2]) {
        out.push({ markers: pending, word: m[2] });
        pending = [];
      }
    } else {
      out.push({ markers: pending, word: raw });
      pending = [];
    }
  }
  // markers with no word after them point at the last word instead
  if (pending.length && out.length) out[out.length - 1].markers.push(...pending);
  return out;
}
function serialize(t: Tok[]): string {
  return t.map((x) => (x.markers.length ? x.markers.slice(0, -1).map((m) => `{${m}} `).join("") + `{${x.markers[x.markers.length - 1]}}${x.word}` : x.word)).join(" ");
}

export const markersIn = (spoken: string) => Object.keys(parseSpoken(spoken).markers);

/** Removes a marker wherever it is (it is about to be placed somewhere else). */
export function withoutMarker(spoken: string, marker: string): string {
  const t = tokens(spoken).map((x) => ({ ...x, markers: x.markers.filter((m) => m !== marker) }));
  return serialize(t);
}

/** Puts a marker in front of a word: the first word, or the word `fromEnd` positions before the end (0 is the last word). */
export function placeMarker(spoken: string, marker: string, at: "start" | { fromEnd: number }): string {
  const t = tokens(withoutMarker(spoken, marker));
  if (!t.length) return `{${marker}}`;
  const i = at === "start" ? 0 : Math.max(0, t.length - 1 - at.fromEnd);
  t[i].markers.push(marker);
  return serialize(t);
}

/** Puts markers that a rewritten line lost back into it: an `a` tap at the start, a `b` tap about halfway (so it follows the first), any other anchor spread along the line. */
export function carryMarkers(spoken: string, markers: string[]): string {
  let s = spoken;
  const missing = markers.filter((m) => !markersIn(s).includes(m));
  const n = Math.max(1, parseSpoken(spoken).words.length);
  missing.forEach((m, k) => {
    const at = /^a\d+$/.test(m) ? 0 : /^b\d+$/.test(m) ? Math.max(1, Math.floor(n / 2)) : Math.floor((k * n) / missing.length);
    s = placeMarker(s, m, at === 0 ? "start" : { fromEnd: Math.max(0, n - 1 - at) });
  });
  return s;
}

export const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** A plain line for a tap, from the real control name and what the page shows after it. Used only when no better wording was supplied. */
export function autoLine(name: string, payoff: string): string {
  const shown = lowerFirst(payoff.replace(/^showing\s+/i, "").replace(/[.!?]+$/, ""));
  return `Tap ${name}, and the page shows ${shown}.`;
}

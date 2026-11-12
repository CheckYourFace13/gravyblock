/**
 * Self-healing for change requests. When a rebuilt video fails a check, GravyBlock decides by itself whether that is an internal problem (timing, alignment, capture replay, render)
 * or a decision only the customer can make, and for an internal one it adjusts the plan or strategy and rebuilds again from the saved source. The customer is never asked how to fix our
 * renderer. A bounded number of attempts is allowed; an internal problem that survives them is reported to operations, not to the customer.
 */
import { timing } from "../video/concepts/generate";
import { personalityFor } from "../video/concepts/standard";
import type { Concept } from "../video/concepts/types";
import { ensureMarkers } from "./apply";
import { carryMarkers, removePhrase, stripMarkers } from "./text";

export type Strategy = {
  /** extra hold on the closing frame, ms, added on top of what the script itself needs */
  holdMs: number;
  /** multiplies the pauses between spoken lines (1 = as designed) */
  gapScale: number;
  /** page lines that did not replay when captured; the plan must not use them */
  avoid: string[];
  /** words a line says before the screen shows them: that part of the line is cut */
  dropWords: Array<{ line: string; word: string }>;
  /** what went wrong before, in words the planner can act on */
  planProblems: string[];
  /** how many times the plan has been adjusted */
  rounds: number;
};

export const NO_STRATEGY: Strategy = { holdMs: 0, gapScale: 1, avoid: [], dropWords: [], planProblems: [], rounds: 0 };

export type FailureClass = "dead_air" | "too_short" | "too_long" | "alignment" | "capture" | "render" | "owner_decision";
export type Classified = { kind: "internal" | "owner"; cls: FailureClass; message: string };

/** Things only the customer can settle: a missing declaration, a missing brand asset, a claim that cannot be verified. Everything else is ours to fix. */
const OWNER = /made-for-kids declared by the owner|platform declaration|no logo (?:was )?supplied|brand asset (?:is )?missing|cannot be verified and there is no safe/i;

export function classifyFailure(message: string): Classified {
  const m = message.replace(/^Attempt \d+ failed, will retry: /, "");
  if (OWNER.test(m)) return { kind: "owner", cls: "owner_decision", message: m };
  if (/no_dead_air|dead air|pause of [\d.]+s/i.test(m)) return { kind: "internal", cls: "dead_air", message: m };
  const d = /duration: ([\d.]+)s \(target (\d+) to (\d+)s/i.exec(m);
  if (d) return { kind: "internal", cls: Number(d[1]) < Number(d[2]) ? "too_short" : "too_long", message: m };
  if (/visual_alignment|runs ahead of the screen|not on screen|is not about|no record of what is inside/i.test(m)) return { kind: "internal", cls: "alignment", message: m };
  if (/capture:/i.test(m)) return { kind: "internal", cls: "capture", message: m };
  return { kind: "internal", cls: "render", message: m };
}

/** The next strategy after a failure: what to change so the same mistake is not rebuilt. */
export function escalate(prev: Strategy, message: string): Strategy {
  const f = classifyFailure(message);
  const next: Strategy = { ...prev, avoid: [...prev.avoid], dropWords: [...prev.dropWords], planProblems: [...prev.planProblems], rounds: prev.rounds + 1 };
  const note = (s: string) => {
    if (!next.planProblems.includes(s)) next.planProblems.push(s);
    next.planProblems = next.planProblems.slice(-4);
  };
  if (f.cls === "dead_air") next.gapScale = Math.max(0.4, +(prev.gapScale * 0.8).toFixed(3));
  else if (f.cls === "too_short") {
    const d = /duration: ([\d.]+)s \(target (\d+) to (\d+)s/i.exec(f.message)!;
    next.holdMs = Math.min(8000, prev.holdMs + Math.ceil((Number(d[2]) + 1.5 - Number(d[1])) * 1000));
  } else if (f.cls === "too_long") next.gapScale = Math.max(0.4, +(prev.gapScale * 0.85).toFixed(3));
  else if (f.cls === "capture") {
    const q = [...f.message.matchAll(/"([^"]{3,})"/g)].map((x) => x[1]);
    // `after "Tue" the page no longer shows "Texas Union Building"`: the thing it no longer shows is the one to stop relying on
    const shown = /no longer shows "([^"]+)"/.exec(f.message)?.[1] ?? q[q.length - 1];
    if (shown && !next.avoid.includes(shown)) next.avoid.push(shown);
    note(f.message.slice(0, 220));
  } else if (f.cls === "alignment") {
    for (const m of f.message.matchAll(/line (L\d+) runs ahead of the screen: "([^"]+)"/g)) for (const w of m[2].split(/,\s*/)) if (!next.dropWords.some((x) => x.line === m[1] && x.word === w)) next.dropWords.push({ line: m[1], word: w });
    for (const m of f.message.matchAll(/line (L\d+) \("[^"]*"\) talks about ([^"]+?) which is not on the screen/g)) for (const w of m[2].split(/,\s*/)) if (!next.dropWords.some((x) => x.line === m[1] && x.word === w)) next.dropWords.push({ line: m[1], word: w.trim() });
    note(f.message.slice(0, 220));
  } else note(f.message.slice(0, 220));
  return next;
}

/** Applies the strategy to a rebuilt script. Returns the problems it could not resolve (none when the script is consistent). */
export function applyStrategy(c: Concept, s: Strategy): string[] {
  for (const d of s.dropWords) {
    const l = c.narration.find((x) => x.id === d.line);
    if (!l) continue;
    const cut = removePhrase(l.spoken, d.word);
    if (!cut || stripMarkers(cut.text).split(/\s+/).filter(Boolean).length < 3) continue;
    l.spoken = carryMarkers(cut.text, cut.lost);
    if (l.caption) l.caption = undefined;
  }
  const problems = ensureMarkers(c);
  c.gapScale = s.gapScale < 1 ? s.gapScale : undefined;
  c.gapExtraMs = (c.gapExtraMs ?? 0) + s.holdMs || undefined;
  Object.assign(c, timing(c.narration, personalityFor(c.slug), c.gapExtraMs ?? 0, c.gapScale ?? 1));
  return problems;
}

/**
 * The real alternatives an owner edit may choose from. A tap in a video is a REAL probed step of the live product page, so a different tap or a different thing the page showed
 * can only come from what discovery actually saw: the other controls of the same group, and the other lines the page showed after each. The edit plan names one of these by id; it
 * can never invent a control or a result.
 */
import { BOILERPLATE, EMPTY_STATE } from "../video/concepts/standard";
import { speakable } from "../video/concepts/generate";
import { BANNED } from "../video/demo/qa";
import type { Concept, PageDiscovery, Step } from "../video/concepts/types";

export type StepCandidate = { id: string; plate: string; step: 1 | 2; sameControl: boolean; def: Step; label: string };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
/** a line with its numbers blanked out: two live counters with different figures have the same shape */
const shape = (s: string) => norm(s).replace(/[0-9]+/g, "#");
/** a live counter ("87 in view, 12 match filters, 87 on map"): its figures drift as the data changes, so it may not be on the page again when the video is captured */
const COUNTER = (f: string) => (f.match(/[0-9]+/g) ?? []).length >= 3;
const ZERO = /\b0 of \d+|\bno (results|matches|listings)\b|\bnone\b/i;

/** The lines a probed click newly showed, one by one, as they appear on the page. */
export function fragmentsOfNewText(newText: string): string[] {
  const seen = new Set<string>();
  return newText
    .split(" | ")
    .map((f) => f.trim())
    .filter((f) => f && !seen.has(norm(f)) && seen.add(norm(f)));
}

export function candidatesFor(concept: Concept, discoveries: PageDiscovery[], flagged: string[] = []): StepCandidate[] {
  const out: StepCandidate[] = [];
  const bad = flagged.map(norm).filter(Boolean);
  // what the page showed after a tap: any short, plain line of it (the voice paraphrases, so the line need not be sayable verbatim)
  const ok = (f: string) => !COUNTER(f) && !bad.some((b) => shape(f) === shape(b)) && f.length >= 8 && f.length <= 140 && /[a-z]/.test(f) && f !== f.toUpperCase() && !/[<>{}|\\]/.test(f) && !BANNED.test(f) && !BOILERPLATE.test(f) && !EMPTY_STATE.test(f) && !ZERO.test(f) && !bad.some((b) => norm(f).includes(b) || b.includes(norm(f)));
  for (const pl of concept.capturePlan) {
    const group = discoveries.find((d) => d.path === pl.path)?.groups.find((g) => g.id === pl.groupId);
    if (!group) continue;
    for (const k of [0, 1] as const) {
      const cur = pl.clicks[k];
      const other = pl.clicks[1 - k];
      if (cur.kind !== "click") continue;
      const seen = new Set<string>();
      for (const seq of group.sequence) {
        const ctl = group.controls.find((c) => c.index === seq.control);
        if (!ctl) continue;
        if (other.kind === "click" && other.control === ctl.index) continue;
        fragmentsOfNewText(seq.newText).forEach((f, fi) => {
          if (!ok(f)) return;
          const key = `${ctl.index}|${norm(f)}`;
          if (seen.has(key) || (ctl.index === cur.control && norm(f) === norm(cur.payoff))) return;
          seen.add(key);
          const def: Step = { kind: "click", control: ctl.index, name: ctl.name, payoff: f };
          out.push({ id: `${pl.id}.${k + 1}.${ctl.index}.${fi}`, plate: pl.id, step: (k + 1) as 1 | 2, sameControl: ctl.index === cur.control, def, label: `${ctl.index === cur.control ? "same tap" : `tap "${ctl.name}"`}, the page shows: ${f}` });
        });
      }
    }
  }
  // lines the voice can say as they are come first
  return out.sort((a, b) => Number(speakable(b.def.kind === "click" ? b.def.payoff : "")) - Number(speakable(a.def.kind === "click" ? a.def.payoff : "")));
}

/**
 * Turning the owner's exact note into an EditPlan. Two steps, in this order:
 *   1. Rules: the plain, well-defined requests (spell out weekdays, how a word sounds, faster or slower, remove the part about X) are understood without any model.
 *   2. The capped language-model step reads whatever is left, with ONLY: the note, the script, the scene plan, verified Product Truth, the real alternatives, what must not be claimed
 *      and the earlier rounds of feedback. It returns a structured plan. Deterministic validation (apply.ts) then checks it; if the plan does not hold up, the model gets the exact
 *      problems once and tries again. A praise-only note is not an edit and is never an error.
 */
import type { StudioDb } from "../db";
import { askJson, parseJson } from "../video/concepts/ai";
import { pronunciation, type IntentContext } from "../publishing/review-intent";
import type { StepCandidate } from "./candidates";
import { abbreviationsIn, keyWords, stripMarkers } from "./text";
import type { EditOp, EditPlan, NoteHints } from "./types";

export type PlanView = {
  product: string;
  productHost: string;
  cta: { text: string; url: string };
  lines: Array<{ id: string; scene: string; text: string; caption?: string; claims: string[] }>;
  /** the real taps of a generated video, with the line that talks about each */
  taps: Array<{ plate: string; step: 1 | 2; scene: string; name: string; shows: string; line?: string }>;
  candidates: StepCandidate[];
  /** verbatim text the live product showed, which new wording may rely on */
  facts: string[];
  prohibited: string[];
  earlier: Array<{ note: string; summary: string[] }>;
  estSeconds: number;
  structure: "generated" | "hand_written";
  voiceFacts: Array<{ key: string; value: string }>;
};

export type Planned = { plan: EditPlan; by: "language_model" | "rules" | "both"; micros: number };

const ACTION = /\b(remove|delete|cut|drop|take out|get rid of|change|replace|use|show|add|make|fix|spell|shorten|reword|rewrite|rephrase|list|combine|merge|repeat|repetitive|instead|speed|slow|zoom|pronounc|abbreviat)\b/i;
const PRAISE = /^(i\s+(really\s+)?(like|love|liked|enjoy|enjoyed)|(this|it)\s+(is|looks|looked|sounds)\s+(good|great|nice|fine|awesome)|looks?\s+(good|great)|nice|great|good|thanks|thank you|well done|perfect)\b/i;
const WRONG = /\b(error|wrong|incorrect|mistake|mistaken|not true|isn'?t (right|true|correct)|inaccurate|outdated|out of date|doesn'?t look right|looks? (wrong|off)|bug)\b/i;
const SCENEY = /\b(scene|part|section|sentence|line|beginning|start|end(ing)?|middle|first|second|third|last)\b/i;

/** The sentences of a note, with a praise clause split from the request after it ("I like this, but it's too repetitive" is praise and a request). */
export const sentencesOf = (note: string) =>
  note
    .split(/(?<=[.!?])\s+|\n+/)
    .flatMap((s) => s.split(/,?\s+\bbut\b,?\s+/i))
    .map((s) => s.trim())
    .filter(Boolean);
export const isPraise = (s: string) => PRAISE.test(s.trim()) && !ACTION.test(s.replace(PRAISE, ""));

const toIntentCtx = (v: PlanView): IntentContext => ({ narration: v.lines.map((l) => ({ spoken: l.text, caption: l.caption })), ctaText: v.cta.text, ctaUrl: v.cta.url, productHost: v.productHost, facts: v.voiceFacts, current: { lexicon: {}, paceFactor: 1, history: [] } });

/** The clause of a line that talks about `target` (the whole of it, so cutting it leaves no dangling words). */
function clauseAbout(text: string, target: string): string | null {
  const want = new Set(keyWords(target));
  if (!want.size) return null;
  let best: { text: string; score: number } | null = null;
  for (const m of text.matchAll(/[^,;.!?]+[,;.!?]*/g)) {
    const have = new Set(keyWords(m[0]));
    const hit = [...want].filter((w) => have.has(w)).length;
    const score = hit / want.size;
    if (hit >= 1 && score >= 0.6 && (!best || score > best.score)) best = { text: m[0].replace(/[,;.!?]+$/, "").trim(), score };
  }
  return best?.text ?? null;
}

/** Plain requests, understood without a model. Whatever is not understood comes back in `unresolved`, with the praise left out. */
export function rulesPlan(note: string, v: PlanView): { plan: EditPlan; unresolved: string[] } {
  const ops: EditOp[] = [];
  const summary: string[] = [];
  const unresolved: string[] = [];
  let sentiment: EditPlan["sentiment"] = "neutral";
  let factual: EditPlan["factual"];
  for (const s of sentencesOf(note)) {
    const l = s.toLowerCase();
    if (isPraise(s)) {
      sentiment = "positive";
      continue;
    }
    // abbreviations: the owner names the abbreviated words, or the script holds some and the note asks for the full word
    const asksFull = /(abbreviat|full word|spell(ed)? (it |them )?out|instead of using)/.test(l);
    const named = (s.match(/\b[A-Za-z]{3,5}\b/g) ?? []).filter((w) => abbreviationsIn(w, w ? [w] : []).length);
    if (asksFull || (named.length && /\b(full|instead|spell)/.test(l))) {
      const words = [...new Set(named.filter((w) => abbreviationsIn(w).length))];
      ops.push({ op: "expand_abbreviations", ...(words.length ? { words } : {}) });
      summary.push(words.length ? `spell out ${words.join(" and ")}` : "spell out abbreviated weekdays");
      continue;
    }
    if (/(pronunc|pronounc|sounds? (wrong|off|weird))/.test(l)) {
      const r = pronunciation(s, toIntentCtx(v));
      if (!("ok" in r) && r.type === "lexicon") {
        ops.push({ op: "pronunciation", written: r.written, spoken: r.spoken });
        summary.push(`say "${r.written}" as "${r.spoken}"`);
        continue;
      }
    }
    if (/\b(too fast|too slow|speed (it )?up|slow (it )?down|faster|slower|rushed|drags?)\b/.test(l) && !SCENEY.test(l)) {
      const slow = /(too fast|slow (it )?down|slower|rushed)/.test(l) && !/too slow|speed/.test(l);
      ops.push({ op: "pace", direction: slow ? "slower" : "faster", amount: /\b(slightly|a bit|a little)\b/.test(l) ? "slightly" : /\b(much|way|far|really|very)\b/.test(l) ? "much" : "normal" });
      summary.push(slow ? "slower voice" : "faster voice");
      continue;
    }
    const rm = /\b(?:remove|delete|cut|drop|take out|get rid of)\s+(?:the\s+)?(?:(?:part|section|sentence|line|bit|mention|bit)\s+)?(?:about|on|of|where (?:it )?says?|that says?|with)?\s*(.+)$/i.exec(s.replace(/[.!?]+$/, ""));
    if (rm) {
      const target = rm[1].replace(/,?\s*(it|that|this)\b.*(error|wrong|mistake|incorrect).*$/i, "").trim();
      const concern = WRONG.test(s);
      // the line (or tap) that talks about the target
      let best: { line: PlanView["lines"][number]; score: number; clause: string } | null = null;
      for (const ln of v.lines) {
        const clause = clauseAbout(ln.text, target) ?? (ln.caption ? clauseAbout(ln.caption, target) : null);
        if (!clause) continue;
        const have = new Set(keyWords(`${ln.text} ${ln.caption ?? ""}`));
        const want = keyWords(target);
        const score = want.filter((w) => have.has(w)).length / Math.max(1, want.length);
        if (!best || score > best.score) best = { line: ln, score, clause };
      }
      if (best) {
        const tap = v.taps.find((t) => t.line === best!.line.id && keyWords(`${t.name} ${t.shows}`).some((w) => keyWords(target).includes(w)));
        if (tap) {
          ops.push({ op: "remove_step", plate: tap.plate, step: tap.step });
          summary.push(`remove the part about ${target} (the tap that showed "${tap.name}" is replaced by a different real one)`);
        } else {
          ops.push({ op: "remove_text", line: best.line.id, phrase: best.clause });
          summary.push(`remove "${best.clause}"`);
        }
        if (concern) factual = { concern: s, phrases: [target, best.clause] };
        continue;
      }
    }
    unresolved.push(s);
  }
  return { plan: { sentiment, summary, ops, ...(factual ? { factual } : {}) }, unresolved };
}

// ---- the language-model step --------------------------------------------------------------------------------------------------------------

const OPS_HELP = `ops (each an object with "op" and the fields shown):
 {"op":"remove_text","line":"L4","phrase":"like a missing unsubscribe link"}   cut a phrase, clause or sentence out of one line
 {"op":"remove_line","line":"L5"}   delete a whole line (never the first or last, never a scene's only line)
 {"op":"remove_scene","scene":"a2"}   delete a whole scene with its lines
 {"op":"remove_step","plate":"p1","step":2}   the video shows two real taps per scene; replace tap 1 or 2 by a different real one (the engine picks)
 {"op":"replace_step","plate":"p1","step":2,"candidate":"p1.2.5.3"}   same, using one id from CANDIDATES (use it to change which place or example is shown)
 {"op":"rewrite_line","line":"L3","spoken":"...","caption":"optional, only for a closing line that spells a web address"}   new wording for one line
 {"op":"consolidate","lines":["L2","L3"],"spoken":"..."}   merge repeated lines of ONE scene into one line
 {"op":"replace_text","find":"...","replace":"..."}   swap a word or phrase everywhere
 {"op":"expand_abbreviations","words":["Wed","Thu"]}   spell out abbreviated weekdays (omit words for all)
 {"op":"pronunciation","written":"MicStage","spoken":"Mic Stage"}   how the voice says a word; the letters must stay the same
 {"op":"pace","direction":"slower","amount":"slightly|normal|much"}
 {"op":"zoom","direction":"closer|wider"}   {"op":"reorder_scenes","order":["a2","a1"]}   {"op":"recapture","plate":"p1"}   {"op":"cta_text","text":"..."}`;

const SYSTEM = `You edit short vertical marketing videos for a product. The owner wrote a change request; you return ONE JSON object, nothing else:
{"sentiment":"positive|neutral|negative","summary":["one plain sentence per change"],"ops":[...],"factual":{"concern":"...","phrases":["verbatim words of the claim"]},"preserve":["what stays"],"needsOwner":{"reason":"...","options":["...","..."]},"unresolved":["sentences you could not turn into an edit"]}
${OPS_HELP}
Rules:
- Change only what the note asks. Keep every other line exactly. Timing is rebuilt automatically, so removing or rewording is always fine.
- New wording may use ONLY words that appear in LINES, TAPS, CANDIDATES or FACTS (plus spelled-out weekdays and months). Never add a number, price, promise, comparison or claim that is not in them. Never write {markers}.
- Spoken lines are short (at most 22 words), natural to say aloud, and each tap line must name what that tap does or what the page then shows. The video stays 20 to 35 seconds with at least 5 lines: if removing would make it too short, replace a tap or reword instead.
- Never weaken a claim: words the page itself uses to qualify a result (confirmed, verified, official) stay in the video at least once.
- To show a different place or example, use replace_step with a candidate whose id starts with that plate and tap (for example p1.2. for tap 2 of p1), then rewrite_line for the line of that tap using words of the new result.
- A line with claims c-payNa or c-payNb belongs to tap 1 or 2 of scene aN, and the video SHOWS that tap. To remove or change what it shows, use remove_step or replace_step (pick a CANDIDATES id for a different place, example or result), then rewrite_line for that line using words from the new result.
- Repetition: when several lines repeat the same phrase, say the options once: one line per scene that names both of its taps in order, then remove the now-redundant line of that scene (for example "Tap Fuel, then Pump-out, and the list narrows to marinas with each one confirmed.", then remove_line the second line of the scene). Keep every tap named in order.
- If the owner says something looks wrong or is an error, put the claim's verbatim words in factual.phrases and remove it.
- Praise (like "I like this") is not an edit: set sentiment, no op. Do not put it in unresolved.
- Use needsOwner only if the request is contradictory or impossible to do safely, and give two or three simple options. Otherwise make your best safe interpretation.
- hints (quick controls the owner ticked, and where in the video) help you decide; the note itself decides.`;

const OP_NAMES = new Set(["remove_text", "remove_line", "remove_scene", "remove_step", "replace_step", "rewrite_line", "consolidate", "replace_text", "expand_abbreviations", "pronunciation", "pace", "cta_text", "cta_url", "reorder_scenes", "zoom", "recapture"]);

/** Accepts only a well-formed plan: unknown ops and malformed fields are dropped, never guessed at. */
export function normalizePlan(raw: unknown): EditPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const ops: EditOp[] = [];
  for (const o of Array.isArray(r.ops) ? r.ops.slice(0, 16) : []) {
    const x = o as Record<string, unknown>;
    if (!x || typeof x.op !== "string" || !OP_NAMES.has(x.op)) continue;
    const ok =
      (x.op === "remove_text" && str(x.line) && str(x.phrase)) ||
      ((x.op === "remove_line") && str(x.line)) ||
      (x.op === "remove_scene" && str(x.scene)) ||
      ((x.op === "remove_step" || x.op === "replace_step") && str(x.plate) && (x.step === 1 || x.step === 2) && (x.op === "remove_step" || str(x.candidate))) ||
      (x.op === "rewrite_line" && str(x.line) && str(x.spoken)) ||
      (x.op === "consolidate" && Array.isArray(x.lines) && x.lines.length >= 2 && str(x.spoken)) ||
      (x.op === "replace_text" && str(x.find) && typeof x.replace === "string") ||
      x.op === "expand_abbreviations" ||
      (x.op === "pronunciation" && str(x.written) && str(x.spoken)) ||
      (x.op === "pace" && (x.direction === "faster" || x.direction === "slower")) ||
      (x.op === "cta_text" && str(x.text)) ||
      (x.op === "cta_url" && str(x.url)) ||
      (x.op === "reorder_scenes" && Array.isArray(x.order)) ||
      (x.op === "zoom" && (x.direction === "closer" || x.direction === "wider")) ||
      (x.op === "recapture" && str(x.plate));
    if (ok) ops.push(x as unknown as EditOp);
  }
  const f = r.factual as Record<string, unknown> | undefined;
  const need = r.needsOwner as Record<string, unknown> | undefined;
  return {
    sentiment: r.sentiment === "positive" || r.sentiment === "negative" ? r.sentiment : "neutral",
    summary: (Array.isArray(r.summary) ? r.summary : []).map(str).filter(Boolean).slice(0, 12),
    ops,
    ...(f && Array.isArray(f.phrases) ? { factual: { concern: str(f.concern), phrases: f.phrases.map(str).filter(Boolean) } } : {}),
    ...(Array.isArray(r.preserve) ? { preserve: r.preserve.map(str).filter(Boolean) } : {}),
    ...(need && str(need.reason) ? { needsOwner: { reason: str(need.reason), options: (Array.isArray(need.options) ? need.options : []).map(str).filter(Boolean).slice(0, 4) } } : {}),
    ...(Array.isArray(r.unresolved) ? { unresolved: r.unresolved.map(str).filter(Boolean) } : {}),
  };
}

export type PlanInput = { note: string; hints?: NoteHints; view: PlanView; handled: string[]; problems?: string[]; previous?: EditPlan };
export type Planner = (input: PlanInput) => Promise<{ plan: EditPlan; micros: number }>;

/** The user message for the model: small, structured, and only what an edit needs. */
export function modelInput(i: PlanInput): string {
  const v = i.view;
  return JSON.stringify({
    note: i.note,
    hints: i.hints ?? null,
    alreadyHandled: i.handled,
    product: v.product,
    structure: v.structure === "hand_written" ? "this script is hand-written: only text edits (remove_text, rewrite_line, replace_text, expand_abbreviations, pronunciation, pace, cta_text) are possible" : "generated",
    seconds: v.estSeconds,
    LINES: v.lines.map((l) => ({ id: l.id, scene: l.scene, text: l.text, ...(l.caption ? { caption: l.caption } : {}), claims: l.claims })),
    TAPS: v.taps,
    CANDIDATES: v.candidates.slice(0, 24).map((c) => ({ id: c.id, forTap: `${c.plate} tap ${c.step}`, shows: c.label })),
    FACTS: v.facts.slice(0, 30),
    mustNotClaim: v.prohibited.slice(0, 12),
    earlierFeedback: v.earlier.slice(-4),
    ...(i.problems ? { yourLastPlan: i.previous, itFailedBecause: i.problems } : {}),
  });
}

export function aiPlanner(db: StudioDb, specId: string): Planner {
  return async (i) => {
    const r = await askJson(db, { specId, purpose: "owner_edit", system: SYSTEM, user: modelInput(i), maxTokens: 1100, temperature: 0.2 });
    const plan = normalizePlan(parseJson<unknown>(r.text));
    if (!plan) throw new Error("the model's reply was not a usable edit plan");
    return { plan, micros: r.micros };
  };
}

/** Rules first, then the model for what is left. Praise is never an error and an unresolved sentence is reported back, never dropped. */
export async function interpretNote(note: string, view: PlanView, opts: { hints?: NoteHints; planner?: Planner; earlierProblems?: string[] }): Promise<Planned> {
  const rules = rulesPlan(note, view);
  if (!rules.unresolved.length) return { plan: rules.plan, by: "rules", micros: 0 };
  if (!opts.planner) return { plan: { ...rules.plan, unresolved: rules.unresolved }, by: "rules", micros: 0 };
  const handled = rules.plan.summary;
  const ask = await opts.planner({ note, hints: opts.hints, view, handled, ...(opts.earlierProblems?.length ? { problems: opts.earlierProblems } : {}) });
  const ops = [...rules.plan.ops, ...ask.plan.ops.filter((o) => !rules.plan.ops.some((r) => JSON.stringify(r) === JSON.stringify(o)))];
  const factual = ask.plan.factual ?? rules.plan.factual;
  return { plan: { ...ask.plan, ops, summary: [...rules.plan.summary, ...ask.plan.summary], ...(factual ? { factual } : {}) }, by: rules.plan.ops.length ? "both" : "language_model", micros: ask.micros };
}

export const plainLine = (l: { spoken: string }) => stripMarkers(l.spoken);
export { WRONG };

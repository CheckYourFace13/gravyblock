/**
 * The gates. One set of checks judges a concept BEFORE it is rendered (validateConcept) and the finished video BEFORE the owner is emailed (evaluateRecord).
 * The ten desirability checks are the owner's list; around them sit the hard gates: no repeated angle, no unsupported claim, no boring or documentation-style
 * script, no concept that cannot be shown with real interaction. These are mechanical proxies for taste (they catch the failures that can be measured:
 * a weak opening, no payoff, feature-tour language, a repeated hook, an unsupported sentence), not a judgement of quality; the owner's review remains the
 * final word.
 */
import { compareAngles, type AngleEntry } from "../../library";
import { BANNED } from "../demo/qa";
import { BANNED_OPENER, DESIRABILITY_CHECKS, DOC_REGISTER, HOOK_TENSION, INVITE_VERB, OUTCOME_WORD, openingKey, PERSONALITIES, personalityFor, wordCount, type DesirabilityCheck, type DesirabilityId } from "./standard";
import type { Concept, GateResult, GeneratorInput } from "./types";

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
const STOPW = new Set(["the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "at", "is", "it", "your", "you", "with", "that", "this", "how", "what", "do", "does", "can", "from", "by", "as", "are", "be", "s", "i", "we", "our", "my", "even", "get", "want", "but", "not"]);
export const toks = (s: string) => new Set((norm(s).match(/[a-z0-9]+/g) ?? []).filter((w) => !STOPW.has(w) && w.length > 2).map((w) => w.replace(/(ing|ed|es|s)$/, "")));
const shared = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x));
const plain = (s: string) => s.replace(/\{[a-z0-9]+\}/g, "").replace(/\s+/g, " ").trim();

/** The hook gate, shared by the pre- and post-render checks. */
export function hookProblems(hook: string, productName: string): string[] {
  const out: string[] = [];
  const h = hook.trim();
  if (wordCount(h) > 12) out.push(`the hook is ${wordCount(h)} words; it must land in 12 or fewer`);
  if (wordCount(h) < 3) out.push("the hook is too short to be a hook");
  if (BANNED_OPENER.test(h)) out.push("the hook opens with a greeting or an introduction");
  if (norm(h).startsWith(norm(productName))) out.push("the hook opens with the product name (a logo-first opening)");
  if (!HOOK_TENSION.test(h)) out.push("the hook has no question, no second person and no tension");
  if (DOC_REGISTER.test(h)) out.push("the hook sounds like documentation");
  return out;
}

/** Entries of the product's consumed angles that this concept repeats, by the same rule the library gate uses (a different role is expected). */
export function distinctReasons(concept: Concept, input: GeneratorInput): string[] {
  const me: AngleEntry = { id: concept.angle.id, slug: concept.slug, position: 1, role: concept.angle.role, title: concept.title, hook: concept.hook, goal: input.angle.goal, audience: concept.audience, coreBenefit: input.angle.coreBenefit, features: input.angle.features, scenes: input.angle.scenes, cta: { text: concept.cta.text, url: concept.cta.url }, status: "planned", approval: "none", existing: false, funnel: input.angle.funnel as AngleEntry["funnel"] };
  const out: string[] = [];
  for (const e of input.consumed) {
    if (e.id === me.id) continue;
    const sim = compareAngles(me, { ...(e as unknown as AngleEntry), position: 1, audience: "", approval: "none", existing: false, funnel: "cold" });
    const rep = sim.reasons.filter((r) => r !== "fills a role that is already taken");
    if (rep.includes("repeats the hook") || rep.includes("repeats the marketing purpose") || rep.includes("recycles the scene order")) out.push(`repeats "${e.title}": ${rep.join(", ")}`);
  }
  return out;
}

const mk = (id: DesirabilityId, ok: boolean, detail: string): DesirabilityCheck => ({ id, label: DESIRABILITY_CHECKS.find((c) => c.id === id)!.label, ok, detail });

/** Customer outcomes, ratings and growth numbers a script must never invent. */
export const FAKE_OUTCOME = /\b(customers? (love|trust|swear)|rated|five.?star|testimonials?|doubled|tripled|boosts?|boosted|increases?d?|more (sales|bookings|customers|revenue|traffic|clients)|proven|top.?rated|award.?winning)\b/i;

/** Words the frames themselves use (action, payoff, reassurance, call to action): safe by construction, they claim nothing about any product. */
const FRAME_WORDS = (() => {
  const w = new Set<string>();
  const add = (s: string) => (s.toLowerCase().match(/[a-z']+/g) ?? []).forEach((x) => w.add(x));
  for (const p of Object.values(PERSONALITIES)) [...p.action, ...p.payoff, ...p.whyLine, ...p.cta].forEach(add);
  add("open go to keep going scroll on and further down search type jump into dive tap ask then now at dot com");
  return w;
})();

/**
 * Grounded copy. The words of every spoken line (the hook is marketing copy and is judged separately) must come from the frames, from the product's
 * name, or from text the live product showed. Copy may be reworded, but it cannot bring in a capability, a noun or a promise the product never showed.
 */
export function ungroundedWords(spoken: string[], vocabulary: Set<string>, nameTokens: string[]): string[] {
  const out: string[] = [];
  for (const line of spoken)
    for (const w of line.toLowerCase().match(/[a-z']+/g) ?? []) {
      if (w.length <= 2 || FRAME_WORDS.has(w) || vocabulary.has(w) || nameTokens.includes(w)) continue;
      out.push(w);
    }
  return [...new Set(out)];
}

/** The vocabulary of everything discovery saw on the product: pages, probes, links and searches. */
export function pageVocabulary(discoveries: Array<{ lines: string[]; groups: Array<{ heading: string; controls: Array<{ name: string }>; sequence: Array<{ newText: string }> }>; links?: Array<{ text: string; destHeading: string; top: string[]; lower: string[] }>; searches?: Array<{ term: string; resultLines: string[]; result?: { text: string; destLines: string[] } }> }>): Set<string> {
  const v = new Set<string>();
  const add = (s: string) => (s.toLowerCase().match(/[a-z']+/g) ?? []).forEach((x) => v.add(x));
  for (const d of discoveries) {
    d.lines.forEach(add);
    for (const g of d.groups) {
      add(g.heading);
      g.controls.forEach((c) => add(c.name));
      g.sequence.forEach((s) => add(s.newText));
    }
    for (const l of d.links ?? []) [l.text, l.destHeading, ...l.top, ...l.lower].forEach(add);
    for (const s of d.searches ?? []) [s.term, ...s.resultLines, ...(s.result ? [s.result.text, ...s.result.destLines] : [])].forEach(add);
  }
  return v;
}

/** The hard gates every script must pass whoever wrote it. Returns failure reasons. */
export function scriptProblems(lines: Array<{ spoken: string; caption?: string }>, onScreen: string[], prohibited: string[]): string[] {
  const out: string[] = [];
  const text = [...lines.map((l) => `${plain(l.spoken)} ${l.caption ?? ""}`), ...onScreen].join(" | ");
  const banned = BANNED.exec(text);
  if (banned) out.push(`unsupported wording: "${banned[0]}"`);
  const doc = DOC_REGISTER.exec(text);
  if (doc) out.push(`documentation or corporate language: "${doc[0]}"`);
  const fake = FAKE_OUTCOME.exec(text);
  if (fake) out.push(`an outcome, rating or growth claim the product never showed: "${fake[0]}"`);
  for (const p of prohibited) if (p && norm(text).includes(norm(p))) out.push(`says something the product must not claim: "${p}"`);
  return out;
}

/** Pre-render: judges the concept on paper. */
export function validateConcept(c: Concept, input: GeneratorInput): GateResult {
  const p = personalityFor(c.slug);
  const spoken = c.narration.map((l) => plain(l.spoken));
  const reasons: string[] = [];
  const checks: DesirabilityCheck[] = [];

  // unsupported claims and grounding
  const factText = norm(input.discoveries.flatMap((d) => [...d.lines, ...d.groups.flatMap((g) => g.sequence.map((s) => s.newText.replace(/ \| /g, " "))), ...d.links.flatMap((l) => [l.text, l.destHeading, ...l.top, ...l.lower]), ...d.searches.flatMap((s) => [...s.resultLines, ...(s.result?.destLines ?? [])])]).join(" \n "));
  const ungrounded = c.claimsUsed.filter((u) => !factText.includes(norm(u.quote)));
  if (ungrounded.length) reasons.push(`unsupported claim: "${ungrounded[0].quote.slice(0, 50)}" was not seen on the live product`);
  const lineClaims = c.narration.filter((l) => l.claims.length === 0 || l.claims.some((id) => !c.claims.some((x) => x.id === id)));
  if (lineClaims.length) reasons.push(`lines without a Product Truth claim: ${lineClaims.map((l) => l.id).join(", ")}`);
  reasons.push(...scriptProblems(c.narration, c.onScreen.map((o) => o.text), input.prohibited));

  // the hook must be about what the video actually shows
  const content = toks(c.capturePlan.map((pl) => `${pl.heading} ${pl.clicks.map((k) => `${k.name} ${k.payoff} ${k.kind === "search" ? k.term : ""}`).join(" ")}`).join(" "));
  // copy may be reworded, but nothing the product never showed may be said
  const loose = ungroundedWords(spoken.slice(1, -1).concat(spoken.slice(-1)), pageVocabulary(input.discoveries), [...toks(c.productName), ...(c.productName.toLowerCase().match(/[a-z]+/g) ?? []), ...c.ctaHost.toLowerCase().split(/[.-]/)]);
  if (loose.length) reasons.push(`words the product never showed: ${loose.slice(0, 5).join(", ")}`);
  const hookOn = shared(toks(c.hook), content);
  const angleOn = shared(toks(`${input.angle.title} ${input.angle.goal} ${input.angle.features.join(" ")}`), content);
  if (hookOn.length < 1) reasons.push(`the hook is about something the video does not show ("${c.hook}" shares no word with the screens)`);
  if (angleOn.length < 2 && input.angle.hook.trim()) reasons.push(`the demonstrated screens do not match the planned angle (only ${angleOn.length} shared word(s))`);
  // 1 first three seconds
  const hp = hookProblems(c.hook, c.productName);
  const key = openingKey(c.hook);
  const taken = input.takenHooks.some((h) => openingKey(h) === key);
  const early = c.estFirstTapMs <= 4300;
  checks.push(mk("first_3_seconds", hp.length === 0 && !taken && early, [...hp, ...(taken ? [`the opening "${key}" is already used by another video`] : []), ...(early ? [] : [`the first tap lands at about ${(c.estFirstTapMs / 1000).toFixed(1)}s`])].join("; ") || `hook of ${wordCount(c.hook)} words over a live product screen, first tap at about ${(c.estFirstTapMs / 1000).toFixed(1)}s`));
  // 2 reason to care
  checks.push(mk("reason_to_care", HOOK_TENSION.test(c.hook) && c.problem.length >= 20 && c.audience.length >= 8, c.problem.length >= 20 ? `the problem: ${c.problem}` : "no stated problem or audience"));
  // 3 real product action
  const clicks = c.capturePlan.flatMap((pl) => pl.clicks);
  checks.push(mk("real_product_action", c.capturePlan.length >= 2 && clicks.length >= 4 && new Set(clicks.map((x) => norm(x.name))).size === clicks.length, `${clicks.length} real taps in ${c.capturePlan.length} places on the live product: ${clicks.map((x) => x.name).join(", ")}`));
  // 4 visible payoff
  const payoffsOk = clicks.every((x) => x.payoff.length >= 14) && c.claimsUsed.filter((u) => u.id.startsWith("c-pay")).length === clicks.length;
  checks.push(mk("visible_payoff", payoffsOk, `${clicks.length} results the live page shows after the taps`));
  // 5 distinctive
  const dup = distinctReasons(c, input);
  checks.push(mk("distinctive", dup.length === 0, dup.length ? dup.join("; ") : `different from the product's other ${input.consumed.length} angle(s) and uses new controls only`));
  if (dup.length) reasons.push(...dup);
  // 6 desire to try
  const ctaLine = spoken[spoken.length - 1];
  checks.push(mk("desire_to_try", INVITE_VERB.test(ctaLine) && c.cta.text.length >= 4 && clicks.length >= 2, `closing invitation: "${ctaLine}"; button: ${c.cta.text}`));
  // 7 engaging pacing
  const wl = spoken.map(wordCount);
  const avg = wl.reduce((a, b) => a + b, 0) / Math.max(1, wl.length);
  checks.push(mk("engaging_pacing", c.estSeconds >= 22 && c.estSeconds <= 33 && Math.max(...wl) <= 22 && avg <= 15 && clicks.length >= 4, `about ${c.estSeconds}s, ${avg.toFixed(1)} words a line, longest ${Math.max(...wl)}, ${clicks.length} state changes`));
  // 8 not documentation
  const doc = DOC_REGISTER.exec(spoken.join(" "));
  const outcomeLines = spoken.filter((s) => OUTCOME_WORD.test(s)).length;
  checks.push(mk("not_documentation", !doc && outcomeLines / spoken.length >= 0.6, doc ? `documentation language: "${doc[0]}"` : `${outcomeLines} of ${spoken.length} lines are an action or a result`));
  // 9 personality fit
  checks.push(mk("personality_fit", c.personality === p.id && c.pacing.startsWith(String(p.pace)) && c.structure === p.structure, `${p.label}: ${p.tone}, ${p.structure}`));
  // 10 usefulness
  checks.push(mk("clear_usefulness", c.whyItMatters.length >= 20 && clicks.length >= 2 && c.claims.some((x) => x.id === "c-ctx1"), c.whyItMatters || "no stated benefit"));

  for (const k of checks) if (!k.ok) reasons.push(`${k.label}: ${k.detail}`);
  return { ok: reasons.length === 0, checks, reasons };
}

/** What a finished video record and its timeline say, for the post-render gate. */
export type RecordFacts = {
  specId: string;
  slug: string;
  productName: string;
  transcript: Array<{ text: string; caption?: string }>;
  durationMs: number;
  firstActionMs: number | null;
  stateChanges: number;
  interactivePlates: number;
  verifiedClaims: number;
  ctaText: string;
  onScreen: string[];
  /** the openings of the product's other videos and every other product's */
  takenOpenings: string[];
  /** present only for a generated concept; a script written by hand before the standard has none */
  concept?: Pick<Concept, "personality" | "structure" | "pacing" | "problem" | "whyItMatters"> | null;
  prohibited: string[];
};

/** Post-render: the same ten checks, measured on the finished video. */
export function evaluateRecord(r: RecordFacts): GateResult {
  const p = personalityFor(r.slug);
  const spoken = r.transcript.map((t) => plain(t.text));
  const hook = spoken[0] ?? "";
  const checks: DesirabilityCheck[] = [];
  const reasons = scriptProblems(r.transcript.map((t) => ({ spoken: t.text, caption: t.caption })), r.onScreen, r.prohibited);
  const hp = hookProblems(hook, r.productName);
  const taken = r.takenOpenings.includes(openingKey(hook));
  const early = r.firstActionMs !== null && r.firstActionMs <= 4800;
  checks.push(mk("first_3_seconds", hp.length === 0 && !taken && early, [...hp, ...(taken ? [`the opening "${openingKey(hook)}" is already used by another video`] : []), ...(early ? [] : [`first real action at ${r.firstActionMs === null ? "never" : `${(r.firstActionMs / 1000).toFixed(1)}s`}`])].join("; ") || `hook of ${wordCount(hook)} words, first real action at ${(r.firstActionMs! / 1000).toFixed(1)}s`));
  checks.push(mk("reason_to_care", HOOK_TENSION.test(hook), HOOK_TENSION.test(hook) ? `opens on a question or a "you": "${hook}"` : "the opening has no question or tension"));
  checks.push(mk("real_product_action", r.interactivePlates >= 2 && r.stateChanges >= 4, `${r.stateChanges} state changes on ${r.interactivePlates} live screens`));
  checks.push(mk("visible_payoff", r.stateChanges >= 4 && r.verifiedClaims >= 3, `${r.stateChanges} visible results, ${r.verifiedClaims} verified claims`));
  checks.push(mk("distinctive", !taken, taken ? "repeats another video's opening" : "its opening is not used by any other video"));
  const last = spoken[spoken.length - 1] ?? "";
  checks.push(mk("desire_to_try", INVITE_VERB.test(last) || /\bpricing\b|\btry\b|\bsee\b/i.test(r.ctaText), `closing: "${last}"; button: ${r.ctaText}`));
  const wl = spoken.map(wordCount);
  const avg = wl.reduce((a, b) => a + b, 0) / Math.max(1, wl.length);
  checks.push(mk("engaging_pacing", r.durationMs >= 20_000 && r.durationMs <= 35_000 && avg <= 16 && r.stateChanges >= 4, `${(r.durationMs / 1000).toFixed(1)}s, ${avg.toFixed(1)} words a line, ${r.stateChanges} state changes`));
  const doc = DOC_REGISTER.exec(spoken.join(" "));
  const outcome = spoken.filter((s) => OUTCOME_WORD.test(s)).length;
  checks.push(mk("not_documentation", !doc && outcome / Math.max(1, spoken.length) >= 0.5, doc ? `documentation language: "${doc[0]}"` : `${outcome} of ${spoken.length} lines are an action or a result`));
  // a script written by hand before the standard carries no personality record: it is kept as rendered and flagged, never silently passed off as generated
  checks.push(mk("personality_fit", r.concept ? r.concept.personality === p.id : true, r.concept ? `${p.label}` : `written by hand before the standard; the ${p.label.split(":")[0]} profile applies from the next video`));
  checks.push(mk("clear_usefulness", r.verifiedClaims >= 3 && spoken.length >= 5, `${r.verifiedClaims} verified claims across ${spoken.length} lines`));
  for (const k of checks) if (!k.ok) reasons.push(`${k.label}: ${k.detail}`);
  return { ok: reasons.length === 0, checks, reasons };
}

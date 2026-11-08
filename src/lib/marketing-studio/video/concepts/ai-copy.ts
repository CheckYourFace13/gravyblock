/**
 * The language-model creative step. Architecture (owner directive 2026-11-08):
 *   verified Product Truth -> real capture discovery -> deterministic angle/duplicate filter -> THIS STEP -> deterministic grounding validation ->
 *   capture plan validation -> render -> technical QA -> creative QA -> owner review.
 * The model may choose which really-captured demonstration tells the best story and may write the hook, the narration, the transitions, the payoff wording
 * and the call to action. It controls nothing else: it never browses, never picks a click, never sees more than the facts of the candidate plans. Whatever it
 * writes is judged by the same deterministic gates as template copy (validateConcept) plus a stricter grounding check, and then by a second model call that
 * can only reject. Nothing here can approve a concept on its own.
 */
import type { StudioDb } from "../../db";
import { askJson, parseJson } from "./ai";
import { AiCapReached } from "./ai-budget";
import { buildConcept, rankedPairs, spokenHost, timing } from "./generate";
import { personalityFor } from "./standard";
import type { Concept, GeneratorInput, PlatePlan, Step } from "./types";
import { validateConcept } from "./validate";

export type AiCopy = { pick: number; reject?: string; hook: string; steps: string[]; close?: string; cta: string };

const SYSTEM = `You write the voiceover for a 25 second vertical product demo video that marketers would be proud to publish. The viewer watches a REAL screen recording of the live product while a narrator speaks. The recording is already captured; you are given up to 3 candidate demonstrations. Each has two places on the site, and in each place two real taps, with the exact text the page showed after each tap.

Your job: choose the demonstration that makes the most compelling little story, then write the copy. If none of the candidates is worth publishing (the results are dull, off-topic, confusing, or would not make a viewer want to try the product), set pick to 0 and explain why in reject.

Craft:
- Line 1 is the hook, spoken over the first screen, 10 words or fewer. It is a question or a bold, relatable line about the viewer's real situation that this demonstration answers. Never start with the product name, a greeting, "welcome", "introducing", "meet", "discover" or "today".
- Then one line per tap, in order (4 taps, 4 lines). Each line says what the viewer does in a few words, then what they see, in natural spoken English with the personality described. 16 words or fewer per line. Put the token [tap] immediately before the word where the finger lands, exactly once per line.
- The seeing part may only restate or lightly paraphrase the page text shown for that tap. It must not add anything the page text does not support.
- Optionally a short closing line (3 to 8 words) that sums up why it matters without claiming anything new.
- The call to action: an invitation of 3 to 6 words that starts with a verb (try, find, see, plan, explore, play, check, read, make, start). Do not include the product name or the website; the address is added automatically.
- Sound like a person who likes this product, not like a brochure. Concrete, warm, specific, a little playful where the personality allows. Vary the rhythm. No filler, no corporate words.

Truth rules, which are checked by software and a second reviewer, and anything that fails them is thrown away:
- Never invent or imply a feature, capability, statistic, number, result, customer, testimonial, review, award, price, discount, free offer, availability, or superiority over anything. No "best", "fastest", "only", "instantly", "automatically", "AI", "unlimited", "always", "never".
- Do not mention anything the viewer cannot see in the captured screens or read in the page text you were given.
- Do not use digits or spell out numbers other than "one".

Reply with JSON only: {"pick": 1, "reject": "", "hook": "...", "steps": ["...", "...", "...", "..."], "close": "...", "cta": "..."}`;

type Plan = PlatePlan[];

const doing = (s: Step) => (s.kind === "click" ? `taps "${s.name}"` : s.kind === "link" ? `opens the link "${s.name}"` : s.kind === "search" ? `searches for "${s.term}" and presses Enter` : "scrolls further down the page");

function userPrompt(input: GeneratorInput, plans: Plan[], feedback: string[]): string {
  const p = personalityFor(input.slug);
  const own = new Set(plans.flatMap((pl) => pl.flatMap((x) => x.clicks.flatMap((c) => `${x.heading} ${c.name} ${c.payoff}`.toLowerCase().match(/[a-z]{4,}/g) ?? []))));
  const truth = input.verifiedFacts.filter((f) => (f.toLowerCase().match(/[a-z]{4,}/g) ?? []).some((w) => own.has(w))).slice(0, 8);
  return JSON.stringify(
    {
      product: input.productName,
      website: new URL(input.home).host.replace(/^www\./, ""),
      audience: input.angle.audience,
      problemThisVideoAnswers: input.angle.goal,
      personality: { tone: p.tone, story: p.structure, pace: p.pace >= 1.06 ? "quick and punchy" : p.pace <= 0.99 ? "unhurried" : "easy" },
      verifiedProductTruth: truth,
      candidates: plans.map((pl, i) => ({
        pick: i + 1,
        places: pl.map((x) => ({ page: x.path, area: x.heading || "(none)", taps: x.clicks.map((c) => ({ viewer: doing(c), pageThenShows: c.payoff })) })),
      })),
      mustNotOpenLike: input.takenHooks.slice(0, 24),
      ...(feedback.length ? { yourPreviousAttemptWasRejectedBecause: feedback.slice(0, 6), fixThemAll: true } : {}),
    },
    null,
    1,
  );
}

const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

/** The model's copy in the shape the renderer takes: markers, claims and scenes stay the generator's; only the words change. */
export function applyCopy(base: Concept, copy: AiCopy): Concept {
  const p = personalityFor(base.slug);
  const host = base.ctaHost;
  const narration: Concept["narration"] = [];
  let n = 0;
  const add = (sceneId: string, spoken: string, claims: string[], caption?: string) => {
    n++;
    narration.push({ id: `L${n}`, sceneId, spoken, ...(caption ? { caption } : {}), claims });
  };
  const plates = base.capturePlan;
  add("a1", copy.hook, ["c-ctx1"]);
  plates.forEach((_, pi) => {
    [0, 1].forEach((ci) => {
      const marker = `{${ci === 0 ? "a" : "b"}${pi + 1}}`;
      let line = copy.steps[pi * 2 + ci];
      line = line.includes("[tap]") ? line.replace("[tap]", marker).replace(/\[tap\]/g, "") : `${marker}${line}`;
      add(`a${pi + 1}`, line, [`c-ctx${pi + 1}`, `c-pay${pi + 1}${ci === 0 ? "a" : "b"}`]);
    });
  });
  if (copy.close) add(`a${plates.length}`, copy.close, [`c-ctx${plates.length}`]);
  const ctaWord = copy.cta.replace(/[.!?]+$/, "");
  add("end", `${ctaWord}, at ${spokenHost(host)}.`, ["c-cta"], `${ctaWord}, at ${base.cta.display}.`);
  const headlines = { ...base.headlines, end: `${ctaWord}.` };
  const onScreen = base.onScreen.map((o) => (o.sceneId === "end" && o.kind === "headline" ? { ...o, text: `${ctaWord}.` } : o));
  const t = timing(narration, p);
  return { ...base, hook: copy.hook, narration, headlines, onScreen, ...t, sceneMeta: { ...base.sceneMeta, a1: { ...base.sceneMeta.a1, purpose: `Hook and first payoff: ${copy.hook}` } } };
}

export type AiOutcome = { concept?: Concept; micros: number; calls: number; cachedCalls: number; reasons: string[]; log: string[]; model?: string; copy?: AiCopy; rejectedByModel?: string };

type Verdict = { unsupported?: Array<{ line?: string; statement?: string; why?: string }> };

/** The second reader: given only the page text, finds sentences in the script that say more than the page supports. It can only reject. */
async function verify(db: StudioDb, input: GeneratorInput, c: Concept): Promise<{ problems: string[]; micros: number; cached: boolean }> {
  const shown = c.capturePlan.flatMap((pl) => [pl.heading, ...pl.clicks.flatMap((k) => [k.name, k.kind === "search" ? k.term : "", k.payoff])]).filter(Boolean);
  const r = await askJson(db, {
    specId: c.specId,
    purpose: "verify",
    temperature: 0,
    maxTokens: 4000,
    reasoning: { effort: "low" },
    system: `You are a strict fact-checker for marketing copy. You get the text a product's live pages showed and a voiceover script. List every statement in the script that claims, implies or promises something the page text does not support: a feature, capability, number, result, price, availability, outcome or comparison that is not there. Harmless framing (a question to the viewer, the viewer's own situation, "tap", "look", "see") is fine, and so is lightly paraphrasing what the page text says. Be strict about capabilities and outcomes, relaxed about tone. Reply with JSON only: {"unsupported":[{"line":"the sentence","why":"what is not supported"}]} and an empty list when everything is supported.`,
    user: JSON.stringify({ product: input.productName, pageText: [...new Set(shown)], verifiedProductTruth: input.verifiedFacts.slice(0, 12), script: c.narration.map((l) => l.spoken.replace(/\{[a-z0-9]+\}/g, "")) }, null, 1),
  });
  const v = parseJson<Verdict>(r.text);
  if (!v) return { problems: ["the fact-checker returned no readable verdict"], micros: r.micros, cached: r.cached };
  return { problems: (v.unsupported ?? []).map((u) => `fact-checker: "${clean(u.line ?? u.statement).slice(0, 80)}" (${clean(u.why).slice(0, 90)})`), micros: r.micros, cached: r.cached };
}

/** Writes one concept with the language model for one angle. Returns the concept only when every deterministic gate and the fact-checker accept it. */
export async function aiConcept(db: StudioDb, input: GeneratorInput, opts: { attempts?: number; pool?: number } = {}): Promise<AiOutcome> {
  const out: AiOutcome = { micros: 0, calls: 0, cachedCalls: 0, reasons: [], log: [] };
  const rp = rankedPairs(input);
  if (rp.reason) return { ...out, reasons: [rp.reason] };
  const plans: Plan[] = rp.pairs.slice(0, opts.pool ?? 3).map((pair) => pair.map((c, i) => ({ ...c.plan, id: `p${i + 1}` })));
  const p = personalityFor(input.slug);
  let feedback: string[] = [];
  const count = (r: { micros: number; cached: boolean }) => {
    out.micros += r.micros;
    out.calls += 1;
    if (r.cached) out.cachedCalls += 1;
  };
  for (let attempt = 0; attempt < (opts.attempts ?? 3); attempt++) {
    let text: string;
    try {
      const r = await askJson(db, { specId: input.specId, purpose: "copy", system: SYSTEM, user: userPrompt(input, plans, feedback), maxTokens: 2500, temperature: 0.8 });
      count(r);
      out.model = r.model;
      text = r.text;
    } catch (e) {
      if (e instanceof AiCapReached) return { ...out, reasons: [e.message] };
      throw e;
    }
    const raw = parseJson<Partial<AiCopy>>(text);
    if (!raw) {
      feedback = ["the reply was not valid JSON in the requested shape"];
      out.log.push(`attempt ${attempt + 1}: unreadable reply`);
      continue;
    }
    if (Number(raw.pick) === 0) {
      out.rejectedByModel = clean(raw.reject) || "no reason given";
      out.reasons = [`the model judged every candidate demonstration too weak to publish: ${out.rejectedByModel}`];
      return out;
    }
    const pick = Number(raw.pick);
    const steps = Array.isArray(raw.steps) ? raw.steps.map(clean) : [];
    const copy: AiCopy = { pick, hook: clean(raw.hook), steps, close: clean(raw.close), cta: clean(raw.cta) };
    if (!plans[pick - 1] || steps.length !== 4 || steps.some((s) => !s) || !copy.hook || !copy.cta) {
      feedback = ["the reply must pick 1 to " + plans.length + " (or 0), give exactly 4 non-empty steps, a hook and a cta"];
      out.log.push(`attempt ${attempt + 1}: wrong shape`);
      continue;
    }
    const built = buildConcept(input, plans[pick - 1], { text: copy.hook, style: p.hookStyles[0] }, 0, 0);
    if ("error" in built) {
      out.reasons = [built.error];
      return out;
    }
    const concept = applyCopy(built, copy);
    const gate = validateConcept(concept, input, { ai: true });
    out.copy = copy;
    if (!gate.ok) {
      feedback = gate.reasons;
      out.reasons = gate.reasons;
      out.log.push(`attempt ${attempt + 1}: rejected by the gates: ${gate.reasons.join(" | ")}`);
      continue;
    }
    let v: Awaited<ReturnType<typeof verify>>;
    try {
      v = await verify(db, input, concept);
    } catch (e) {
      if (e instanceof AiCapReached) return { ...out, reasons: [e.message] };
      // a fact-checker that could not run is a rejection, never a pass
      v = { problems: [`fact-checker unavailable: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`], micros: 0, cached: false };
    }
    count(v);
    if (v.problems.length) {
      feedback = v.problems;
      out.reasons = v.problems;
      out.log.push(`attempt ${attempt + 1}: rejected by the fact-checker: ${v.problems.join(" | ")}`);
      continue;
    }
    concept.gate = { ok: true, checks: gate.checks };
    concept.ai = { model: out.model ?? "", copy: copy as unknown as Record<string, unknown> };
    out.concept = concept;
    out.reasons = [];
    out.log.push(`attempt ${attempt + 1}: accepted`);
    return out;
  }
  return out;
}

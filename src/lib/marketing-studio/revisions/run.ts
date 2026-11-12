/**
 * The change-request engine, end to end up to (not including) the render:
 *   owner note -> plan (rules, then the capped model) -> deterministic validation (one model repair attempt) -> Product Truth recheck when something looks wrong -> the video's SOURCE is
 *   rewritten (stored concept, or the stored text edits of a hand-written script) -> structured revision history.
 * The caller renders the rebuilt script with the normal pipeline (capture, voice, timeline, QA), uploads a NEW unlisted video and sends one new review email. A revision answers the SAME
 * video, so it never touches the plan allowance.
 */
import type { StudioDb } from "../db";
import { listClaims, listFacts } from "../repository";
import { getSetting, setSetting } from "../runtime";
import { INTERNAL_SCOPE } from "../scope";
import { getOverrides, saveOverrides } from "../video/demo/overrides";
import { DEMO_SPECS, demoSpecFor, type DemoSpec } from "../video/demo/specs";
import { conceptKey, discoveryKey, ensureSpec, type StoredConcept } from "../video/concepts/registry";
import { pageVocabulary } from "../video/concepts/validate";
import type { Concept, PageDiscovery } from "../video/concepts/types";
import { mergeOverrides, type Intent } from "../publishing/review-intent";
import { applyPlan, intentOf, snapshotOf, type ApplyContext } from "./apply";
import { candidatesFor } from "./candidates";
import { applyScriptEdits, loadScriptEdits, planHandwritten, scriptEditsKey, type ScriptEdits } from "./handwritten";
import { earlierFeedback, revisionFor, saveRevision } from "./history";
import { aiPlanner, interpretNote, isPraise, sentencesOf, type PlanView, type Planner } from "./plan";
import { applyStrategy, type Strategy } from "./heal";
import { flagForCorrection, flaggedPhrases, recheckProductTruth } from "./recheck";
import { removePhrase, stripMarkers } from "./text";
import type { EditPlan, NoteHints, Revision, ScriptSnapshot } from "./types";

const ACTOR = "change-request-engine";
const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

export type PrepareInput = { productId: string; slug: string; productName: string; origin: string; specId: string; supersedes: string; note: string; hints?: NoteHints; /** what earlier attempts of this request taught: applied to the rebuilt script and given to the planner */ strategy?: Strategy; /** plan again from the source even if an earlier attempt left a revision behind */ fresh?: boolean };
export type PrepareDeps = { planner?: Planner; fetchText?: (url: string) => Promise<string | null>; now?: () => Date; /** a plan that fails validation is reported as `replan` (the caller tries again) instead of asking the owner */ replan?: boolean; /** plan and validate only: nothing is stored, flagged or changed (a preview of what a note would do) */ dry?: boolean };
export type Prepared =
  | { ok: true; revision: Revision; understood: string[]; concept: Concept | null }
  | { ok: false; kind: "needs_owner"; reason: string; options: string[]; revision?: Revision }
  | { ok: false; kind: "retry"; reason: string }
  | { ok: false; kind: "replan"; reason: string };

const DEFAULT_OPTIONS = ["Tell us the exact words or scene to change (for example: remove the second sentence)", "Approve this video as it is"];

function viewOf(spec: DemoSpec, concept: Concept | null, i: { origin: string; productName: string; facts: string[]; prohibited: string[]; earlier: PlanView["earlier"]; candidates: PlanView["candidates"]; voiceFacts: PlanView["voiceFacts"] }): PlanView {
  const lines = (concept?.narration ?? spec.narration).map((l) => ({ id: l.id, scene: l.sceneId, text: stripMarkers(l.spoken), ...(l.caption ? { caption: l.caption } : {}), claims: l.claims }));
  const taps: PlanView["taps"] = [];
  concept?.capturePlan.forEach((pl, pi) =>
    pl.clicks.forEach((k, ki) => taps.push({ plate: pl.id, step: (ki + 1) as 1 | 2, scene: `a${pi + 1}`, name: k.kind === "scroll" ? "scroll down" : k.display ?? k.name, shows: k.payoff, line: (concept.narration.find((l) => l.claims.includes(`c-pay${pi + 1}${ki === 0 ? "a" : "b"}`)) ?? { id: undefined }).id })),
  );
  return { product: i.productName, productHost: new URL(i.origin).host.replace(/^www\./, ""), cta: { text: spec.cta.text, url: spec.cta.url }, lines, taps, candidates: i.candidates, facts: i.facts, prohibited: i.prohibited, earlier: i.earlier, estSeconds: concept?.estSeconds ?? 0, structure: concept ? "generated" : "hand_written", voiceFacts: i.voiceFacts };
}

/** The title and description the replacement is uploaded with: rebuilt from the revised script, never carried over from text the owner just edited. */
export function copyFor(c: Concept, previousTitle: string): { title: string; description: string } {
  const clean = /\(open slot\)|objection or feature payoff/i.test(previousTitle) ? `${c.productName}: ${stripMarkers(c.hook).replace(/[?!.]+$/, "")}` : previousTitle;
  const title = clean.length <= 100 ? clean : `${clean.slice(0, 97)}...`;
  const body = c.payoff.map((p) => (/[.!?]$/.test(p) ? p : `${p}.`)).join(" ");
  const hook = /[?!.]$/.test(c.hook) ? c.hook : `${c.hook}${/\?/.test(c.hook) ? "." : "?"}`;
  return { title, description: `${hook} ${body}\n\n${c.cta.text}: ${c.cta.url}` };
}

const NL = String.fromCharCode(10);

/** A description carried over from the earlier version, with the wording the owner had removed taken out of it too (links and line breaks stay). */
export function scrubDescription(description: string, plan: EditPlan): string {
  const phrases = [...plan.ops.flatMap((o) => (o.op === "remove_text" ? [o.phrase] : [])), ...(plan.factual?.phrases ?? [])];
  return description
    .split(NL)
    .map((line) => (/https?:\/\//.test(line) ? line : phrases.reduce((l, p) => removePhrase(l, p)?.text ?? l, line)))
    .join(NL);
}

export async function prepareRevision(db: StudioDb, input: PrepareInput, deps: PrepareDeps = {}): Promise<Prepared> {
  const now = deps.now ?? (() => new Date());
  await ensureSpec(db, input.specId);
  const spec = demoSpecFor(input.specId);
  const stored = spec.concept ? await getSetting<StoredConcept | null>(conceptKey(input.specId), null, db) : null;
  const concept = stored?.concept ?? null;
  const existing = await revisionFor(db, input.specId, input.supersedes);
  if (!input.fresh && existing && (existing.status === "applied" || existing.status === "rendered" || existing.status === "sent")) {
    // a retry of the same request: the script was already rebuilt
    return { ok: true, revision: existing, understood: existing.plan.summary, concept };
  }

  const discoveries = ((await getSetting<PageDiscovery[] | null>(discoveryKey(input.slug), null, db)) ?? []).filter(Boolean);
  const flagged = await flaggedPhrases(db, input.productId);
  const facts = (await listFacts(INTERNAL_SCOPE, input.productId, db)).filter((f) => f.status === "current" && f.verifiedAt);
  const prohibited = (await listClaims(INTERNAL_SCOPE, input.productId, db)).filter((c) => c.kind === "prohibited").map((c) => c.text);
  const factStrings = [...new Set([...(concept?.claimsUsed.map((u) => u.quote) ?? []), ...facts.map((f) => f.factValue)])];
  const candidates = concept ? candidatesFor(concept, discoveries, [...flagged, ...(input.strategy?.avoid ?? [])]) : [];
  const view = viewOf(spec, concept, { origin: input.origin, productName: input.productName, facts: factStrings, prohibited, earlier: await earlierFeedback(db, input.specId, input.supersedes), candidates, voiceFacts: facts.map((f) => ({ key: f.factKey, value: f.factValue })) });

  const planner = deps.planner ?? aiPlanner(db, input.specId);
  let planned;
  try {
    planned = await interpretNote(input.note, view, { hints: input.hints, planner, earlierProblems: input.strategy?.planProblems });
  } catch (e) {
    return { ok: false, kind: "retry", reason: `the edit could not be interpreted yet (${e instanceof Error ? e.message : String(e)}); it will be tried again` };
  }
  let micros = planned.micros;
  const base: Omit<Revision, "plan" | "before" | "after" | "status" | "scenesAffected"> = { id: existing?.id ?? `rev-${now().getTime().toString(36)}`, round: (await earlierFeedback(db, input.specId, input.supersedes)).length + 1, at: now().toISOString(), supersedes: input.supersedes, note: input.note, ...(input.hints ? { hints: input.hints } : {}), interpretedBy: planned.by, aiMicros: micros, updatedAt: now().toISOString() };
  const before: ScriptSnapshot = concept ? snapshotOf(concept) : { title: spec.title, seconds: 0, lines: spec.narration.map((l) => ({ id: l.id, scene: l.sceneId, spoken: stripMarkers(l.spoken), ...(l.caption ? { caption: l.caption } : {}) })), steps: [], cta: spec.cta.text };
  const needs = async (reason: string, options: string[], plan: EditPlan): Promise<Prepared> => {
    const draft: Revision = { ...base, aiMicros: micros, plan, before, after: before, scenesAffected: [], status: "needs_owner", detail: reason };
    const revision = deps.dry ? draft : await saveRevision(db, input.specId, draft);
    return { ok: false, kind: "needs_owner", reason, options, revision };
  };

  let plan = planned.plan;
  if (plan.needsOwner) return needs(plan.needsOwner.reason, plan.needsOwner.options.length ? plan.needsOwner.options : DEFAULT_OPTIONS, plan);
  if (!plan.ops.length) {
    const only = sentencesOf(input.note).every(isPraise);
    return needs(only ? "The note says what you liked but not what to change, so there is nothing to rebuild." : `No edit could be found for: ${(plan.unresolved?.length ? plan.unresolved : [input.note]).join(" ")}`, DEFAULT_OPTIONS, plan);
  }

  // ---- apply and validate; one model repair attempt with the exact problems ----
  const cx: ApplyContext = { candidates, vocabulary: pageVocabulary(discoveries), factText: norm(discoveries.flatMap((d) => [...d.lines, ...d.groups.flatMap((g) => g.sequence.map((s) => s.newText.replace(/ \| /g, " ")))]).join(" \n ")), prohibited, flagged: [...flagged, ...(plan.factual?.phrases ?? [])] };
  type Applied = { ok: true; concept: Concept | null; changes: string[]; affected: string[]; intents: Intent[]; edits?: ScriptEdits } | { ok: false; reason: string; kind?: string };
  const run = (p: EditPlan): Applied => {
    if (concept) {
      const r = applyPlan(concept, p, { ...cx, flagged: [...flagged, ...(p.factual?.phrases ?? [])] });
      return r.ok ? r : { ok: false, reason: r.reason, kind: r.kind };
    }
    const h = planHandwritten(spec, p);
    if (!h.ok) return { ok: false, reason: h.reason };
    const intents: Intent[] = [];
    for (const op of p.ops) {
      const it = intentOf(op, { narration: spec.narration, productName: spec.productName, ctaHost: spec.site.ctaHost });
      if (it && "ok" in it) return { ok: false, reason: it.reason };
      if (it) intents.push(it);
    }
    return { ok: true, concept: null, changes: h.changes, affected: [], intents, edits: h.edits };
  };
  let result = run(plan);
  if (!result.ok) {
    // the model gets the exact problems once
    try {
      const again = await planner({ note: input.note, hints: input.hints, view, handled: [], problems: [result.reason], previous: plan });
      micros += again.micros;
      plan = { ...again.plan, factual: again.plan.factual ?? plan.factual };
      if (plan.needsOwner) return needs(plan.needsOwner.reason, plan.needsOwner.options.length ? plan.needsOwner.options : DEFAULT_OPTIONS, plan);
      result = run(plan);
    } catch {
      /* the first problem stands */
    }
  }
  if (!result.ok && deps.replan && (result.kind === "invalid" || result.kind === undefined)) return { ok: false, kind: "replan", reason: result.reason };
  if (!result.ok) return needs(`The change could not be made safely: ${result.reason}`, DEFAULT_OPTIONS, plan);
  const ok = result;
  if (ok.concept && input.strategy) {
    const left = applyStrategy(ok.concept, input.strategy);
    if (left.length) return deps.replan ? { ok: false, kind: "replan", reason: left.join("; ") } : needs(`The change could not be made safely: ${left.join("; ")}`, DEFAULT_OPTIONS, plan);
  }

  // ---- Product Truth recheck ----
  const recheck = concept ? await recheckProductTruth(db, { productId: input.productId, origin: input.origin, before: concept, after: ok.concept, plan, note: input.note, fetchText: deps.fetchText }) : undefined;
  if (recheck?.flagged.length && !deps.dry) await flagForCorrection(db, input.productId, recheck, input.note);

  // ---- rewrite the source ----
  if (deps.dry) {
    const lines = ok.edits ? before.lines.map((l) => (ok.edits!.lines[l.id] ? { ...l, spoken: stripMarkers(ok.edits!.lines[l.id].spoken) } : l)) : before.lines;
    const preview: Revision = { ...base, aiMicros: micros, plan, ...(recheck ? { recheck } : {}), before, after: ok.concept ? snapshotOf(ok.concept) : { ...before, lines }, scenesAffected: ok.affected, status: "planned", detail: ok.changes.join("; ") };
    return { ok: true, revision: preview, understood: plan.summary.length ? plan.summary : ok.changes, concept: ok.concept ?? null };
  }
  if (concept && stored) {
    await setSetting(conceptKey(input.specId), { ...stored, concept: ok.concept, note: `revised from the owner's note on ${now().toISOString().slice(0, 10)}` }, ACTOR, db, { audited: false });
    delete DEMO_SPECS[input.specId];
    await ensureSpec(db, input.specId);
  } else if (ok.edits) {
    await setSetting(scriptEditsKey(input.specId), ok.edits, ACTOR, db, { audited: true });
    applyScriptEdits(spec, await loadScriptEdits(db, input.specId));
  }
  if (ok.intents.length) await saveOverrides(db, ACTOR, input.productId, mergeOverrides(await getOverrides(db, input.productId), ok.intents, input.note));

  const after: ScriptSnapshot = ok.concept ? snapshotOf(ok.concept) : { ...before, lines: demoSpecFor(input.specId).narration.map((l) => ({ id: l.id, scene: l.sceneId, spoken: stripMarkers(l.spoken), ...(l.caption ? { caption: l.caption } : {}) })) };
  const revision = await saveRevision(db, input.specId, { ...base, aiMicros: micros, plan, ...(recheck ? { recheck } : {}), before, after, scenesAffected: ok.affected, status: "applied", detail: ok.changes.join("; ") });
  return { ok: true, revision, understood: [...(plan.summary.length ? plan.summary : ok.changes), ...(recheck?.note && recheck.entries.length ? [recheck.note] : [])], concept: ok.concept ?? null };
}

/**
 * Applies an EditPlan to a video's SOURCE (a generated Concept, or the narration of a hand-written script) and rebuilds what depends on it: markers, claims, facts, the on-screen
 * text, the payoff list, the estimated length. Pure and deterministic. The edit plan came from a language model, so every op is checked here: ids must exist, a different tap must be a
 * real probed one, new wording may only use words the live product showed (plus the spelled-out weekdays and months), and the result must still be a valid video script.
 * Nothing in here renders anything; timing is recalculated by the normal build from the new script.
 */
import { parseSpoken } from "../video/demo/audio";
import type { NarrationLine } from "../video/demo/types";
import { timing } from "../video/concepts/generate";
import { personalityFor } from "../video/concepts/standard";
import { aiGrounding, contentTokens, scriptProblems } from "../video/concepts/validate";
import type { Concept, Step } from "../video/concepts/types";
import type { Intent } from "../publishing/review-intent";
import type { StepCandidate } from "./candidates";
import { autoLine, carryMarkers, expandAbbreviations, abbreviationsIn, markersIn, MONTHS, placeMarker, placeMarkerBefore, removePhrase, stripMarkers, WEEKDAYS, withoutMarker } from "./text";
import type { EditOp, EditPlan, ScriptSnapshot } from "./types";

export type ApplyContext = {
  candidates: StepCandidate[];
  /** every word the live product showed (pageVocabulary of the discoveries) */
  vocabulary: Set<string>;
  /** the live product's text, normalized, for checking figures */
  factText: string;
  prohibited: string[];
  /** phrases the owner reported as wrong or that Product Truth flagged: they must not appear anywhere in the result */
  flagged: string[];
};

export type ApplyOk = { ok: true; concept: Concept; changes: string[]; affected: string[]; intents: Intent[]; changedLines: string[] };
export type ApplyFail = { ok: false; kind: "invalid" | "unsupported" | "unsafe"; reason: string };
export type ApplyResult = ApplyOk | ApplyFail;

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const sceneNo = (id: string) => (/^a(\d+)$/.exec(id) ? Number(/^a(\d+)$/.exec(id)![1]) : 0);
const fail = (kind: ApplyFail["kind"], reason: string): ApplyFail => ({ ok: false, kind, reason });

export function snapshotOf(c: Concept): ScriptSnapshot {
  return { title: c.title, seconds: c.estSeconds, lines: c.narration.map((l) => ({ id: l.id, scene: l.sceneId, spoken: stripMarkers(l.spoken), ...(l.caption ? { caption: l.caption } : {}) })), steps: c.capturePlan.flatMap((p) => p.clicks.map((k) => `${p.id}: ${k.kind === "scroll" ? "scroll" : k.name} -> ${k.payoff}`)), cta: c.cta.text };
}

// ---- structure: renumbering scenes -----------------------------------------------------------------------------------------------------

/** Renames scene `a<old>` to `a<new>` everywhere it is used (line scene, markers, claim ids, headlines, on-screen text, scene notes). */
function renumber(c: Concept, map: Map<number, number>) {
  const rename = (s: string) =>
    s
      .replace(/\{([ab])(\d+)\}/g, (all, k: string, n: string) => (map.has(+n) ? `{${k}~${map.get(+n)}}` : all))
      .replace(/\{([ab])~(\d+)\}/g, "{$1$2}");
  const claimId = (id: string) => id.replace(/^c-(ctx|pay)(\d+)([ab]?)$/, (all, kind: string, n: string, ab: string) => (map.has(+n) ? `c-${kind}${map.get(+n)}${ab}` : all));
  for (const l of c.narration) {
    const n = sceneNo(l.sceneId);
    if (n && map.has(n)) l.sceneId = `a${map.get(n)}`;
    l.spoken = rename(l.spoken);
    if (l.caption) l.caption = rename(l.caption);
    l.claims = l.claims.map(claimId);
  }
  for (const cl of c.claims) cl.id = claimId(cl.id);
  for (const u of c.claimsUsed) u.id = claimId(u.id);
  for (const o of c.onScreen) {
    const n = sceneNo(o.sceneId);
    if (n && map.has(n)) o.sceneId = `a${map.get(n)}`;
    o.claim = claimId(o.claim);
  }
  const heads: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.headlines)) heads[sceneNo(k) && map.has(sceneNo(k)) ? `a${map.get(sceneNo(k))}` : k] = v;
  c.headlines = heads;
  const meta: Concept["sceneMeta"] = {};
  for (const [k, v] of Object.entries(c.sceneMeta)) meta[sceneNo(k) && map.has(sceneNo(k)) ? `a${map.get(sceneNo(k))}` : k] = v;
  c.sceneMeta = meta;
}

function dropScene(c: Concept, n: number): string | null {
  if (n < 1 || n > c.capturePlan.length) return `scene a${n} does not exist`;
  if (c.capturePlan.length < 2) return "a video needs at least one scene besides the closing card";
  const id = `a${n}`;
  const hook = c.narration[0];
  c.capturePlan.splice(n - 1, 1);
  c.narration = c.narration.filter((l) => l.sceneId !== id || (n === 1 && l === hook));
  c.claims = c.claims.filter((x) => !new RegExp(`^c-(ctx|pay)${n}[ab]?$`).test(x.id));
  c.claimsUsed = c.claimsUsed.filter((x) => !new RegExp(`^c-(ctx|pay)${n}[ab]?$`).test(x.id));
  c.onScreen = c.onScreen.filter((o) => o.sceneId !== id || (n === 1 && o.kind === "headline" && stripMarkers(o.text) === stripMarkers(hook.spoken)));
  delete c.headlines[id];
  delete c.sceneMeta[id];
  const map = new Map<number, number>();
  for (let k = 1; k <= c.capturePlan.length + 1; k++) if (k !== n) map.set(k, k < n ? k : k - 1);
  renumber(c, map);
  if (n === 1) {
    // the hook belongs to the first scene that is left
    hook.sceneId = "a1";
    hook.claims = c.claims.some((x) => x.id === "c-ctx1") ? ["c-ctx1"] : hook.claims.filter((x) => c.claims.some((y) => y.id === x));
    if (!c.headlines.a1) c.headlines.a1 = stripMarkers(hook.spoken);
  }
  return null;
}

function reorder(c: Concept, order: string[]): string | null {
  const n = c.capturePlan.length;
  const nums = order.map(sceneNo);
  if (nums.length !== n || new Set(nums).size !== n || nums.some((x) => x < 1 || x > n)) return `the new order must list every scene (a1 to a${n}) exactly once`;
  if (nums.every((x, i) => x === i + 1)) return "the scenes are already in that order";
  const hook = c.narration[0];
  const map = new Map<number, number>();
  nums.forEach((old, i) => map.set(old, i + 1));
  const plates = nums.map((old) => c.capturePlan[old - 1]);
  const byOld = (sceneId: string) => c.narration.filter((l) => l !== hook && l.sceneId === sceneId);
  const rest = nums.flatMap((old) => byOld(`a${old}`));
  const tail = c.narration.filter((l) => l !== hook && !sceneNo(l.sceneId));
  c.capturePlan = plates;
  c.narration = [hook, ...rest, ...tail];
  renumber(c, map);
  hook.sceneId = "a1";
  hook.claims = ["c-ctx1"].filter((x) => c.claims.some((y) => y.id === x));
  // the order of the on-screen text follows the order of the scenes
  c.onScreen.sort((a, b) => (sceneNo(a.sceneId) || 99) - (sceneNo(b.sceneId) || 99));
  return null;
}

// ---- markers ---------------------------------------------------------------------------------------------------------------------------

/** Every scene needs its two tap markers in the narration exactly once (the timeline lands each tap on the word that carries its marker). Missing ones are placed, duplicates dropped. */
export function ensureMarkers(c: Concept): string[] {
  const problems: string[] = [];
  const n = c.capturePlan.length;
  const seen = new Set<string>();
  for (const l of c.narration)
    for (const m of markersIn(l.spoken)) {
      const k = /^[ab](\d+)$/.exec(m);
      if (!k) continue;
      if (+k[1] > n || seen.has(m)) l.spoken = withoutMarker(l.spoken, m);
      else seen.add(m);
    }
  // a tap marker belongs on the line that says what that tap shows: if it ended up elsewhere (a merged or removed line), take it off and let it be placed again below
  for (let i = 1; i <= n; i++)
    for (const k of [0, 1] as const) {
      const m = `${k === 0 ? "a" : "b"}${i}`;
      const owner = stepLine(c, i - 1, k);
      if (!owner || markersIn(owner.spoken).includes(m)) continue;
      for (const l of c.narration) if (l !== owner && markersIn(l.spoken).includes(m)) l.spoken = withoutMarker(l.spoken, m);
      const tap = c.capturePlan[i - 1]?.clicks[k];
      const sameLine = k === 1 && stepLine(c, i - 1, 0) === owner;
      const named = sameLine && tap && tap.kind !== "scroll" ? placeMarkerBefore(owner.spoken, m, expandAbbreviations(tap.display ?? tap.name)) ?? placeMarkerBefore(owner.spoken, m, tap.display ?? tap.name) : null;
      owner.spoken = named ?? placeMarker(owner.spoken, m, k === 0 || !sameLine ? "start" : { fromEnd: Math.min(1, Math.max(0, parseSpoken(owner.spoken).words.length - 3)) });
      seen.add(m);
    }
  for (let i = 1; i <= n; i++) {
    const lines = c.narration.filter((l) => l.sceneId === `a${i}`);
    if (!lines.length) {
      problems.push(`scene a${i} has no narration left`);
      continue;
    }
    const first = i === 1 ? lines.find((l) => l !== c.narration[0]) ?? c.narration[0] : lines[0];
    const second = lines[lines.indexOf(first) + 1] ?? first;
    if (!seen.has(`a${i}`)) first.spoken = placeMarker(first.spoken, `a${i}`, "start");
    if (!seen.has(`b${i}`)) {
      const tap = c.capturePlan[i - 1]?.clicks[1];
      // two taps in one line: the second lands on the word that names it
      const named = second === first && tap && tap.kind !== "scroll" ? placeMarkerBefore(second.spoken, `b${i}`, tap.display ?? tap.name) : null;
      second.spoken = named ?? (second === first ? placeMarker(second.spoken, `b${i}`, { fromEnd: Math.min(1, Math.max(0, parseSpoken(second.spoken).words.length - 3)) }) : placeMarker(second.spoken, `b${i}`, "start"));
    }
    seen.add(`a${i}`);
    seen.add(`b${i}`);
  }
  // each tap must come after the one before it
  const at = (m: string) => {
    const li = c.narration.findIndex((l) => markersIn(l.spoken).includes(m));
    return li < 0 ? -1 : li * 1000 + (parseSpoken(c.narration[li].spoken).markers[m] ?? 0);
  };
  for (let i = 1; i <= n; i++) if (at(`b${i}`) <= at(`a${i}`)) problems.push(`the second tap of scene a${i} comes before the first in the narration`);
  return problems;
}

// ---- claims, facts, payoffs ------------------------------------------------------------------------------------------------------------

const payId = (plateIdx: number, k: 0 | 1) => `c-pay${plateIdx + 1}${k === 0 ? "a" : "b"}`;
const stepLine = (c: Concept, plateIdx: number, k: 0 | 1) => c.narration.find((l) => l.claims.includes(payId(plateIdx, k)));

function setStep(c: Concept, plateIdx: number, k: 0 | 1, def: Step) {
  const pl = c.capturePlan[plateIdx];
  const old = pl.clicks[k];
  pl.clicks[k] = def;
  const id = payId(plateIdx, k);
  const text = def.kind === "scroll" ? `After scrolling the page shows: ${def.payoff}` : `After opening "${def.name}" the page shows: ${def.payoff}`;
  const claim = c.claims.find((x) => x.id === id);
  if (claim) {
    claim.text = text;
    claim.facts = [def.payoff];
    claim.sources = [{ plate: pl.id, quote: def.payoff }, ...(def.kind === "scroll" ? [] : [{ plate: pl.id, quote: def.name }])];
  }
  const used = c.claimsUsed.find((x) => x.id === id);
  if (used) Object.assign(used, { text, quote: def.payoff, path: pl.path });
  // the on-screen label that named the old tap now names the new one
  if (old.kind === "click" && def.kind === "click") for (const o of c.onScreen) if (o.kind === "label" && norm(o.text) === norm(old.display ?? old.name)) o.text = def.display ?? def.name;
  // the context claim names both taps
  const ctx = c.claims.find((x) => x.id === `c-ctx${plateIdx + 1}`);
  const names = pl.clicks.map((s) => (s.kind === "scroll" ? s.name : s.name));
  if (ctx) {
    ctx.text = ctx.text.replace(/shown with: .*$/, `shown with: ${names[0]} and ${names[1]}.`);
    const q = [pl.heading, ...names].filter(Boolean);
    ctx.sources = q.map((quote) => ({ plate: pl.id, quote }));
    const usedCtx = c.claimsUsed.find((x) => x.id === ctx.id);
    if (usedCtx) usedCtx.text = ctx.text;
  }
  if (!c.facts.some((f) => f.plate === pl.id && norm(f.value) === norm(def.payoff))) c.facts.push({ plate: pl.id, value: def.payoff });
}

/** Drops what nothing refers to any more, and refreshes what is derived from the script. */
function settle(c: Concept) {
  const refs = new Set([...c.narration.flatMap((l) => l.claims), ...c.onScreen.map((o) => o.claim)]);
  c.claims = c.claims.filter((x) => refs.has(x.id));
  c.claimsUsed = c.claimsUsed.filter((x) => c.claims.some((y) => y.id === x.id) || !/^c-(ctx|pay)/.test(x.id));
  const quotes = c.claims.flatMap((x) => [...x.facts, ...x.sources.map((s) => s.quote)]).map(norm);
  c.facts = c.facts.filter((f) => quotes.some((q) => q.includes(norm(f.value)) || norm(f.value).includes(q)));
  c.payoff = c.capturePlan.flatMap((p) => p.clicks.map((k) => k.payoff));
  const first = c.narration[0];
  const hookText = stripMarkers(first.spoken);
  if (c.headlines.a1 && norm(c.headlines.a1) === norm(c.hook) && norm(hookText) !== norm(c.hook)) {
    for (const o of c.onScreen) if (o.kind === "headline" && o.sceneId === "a1" && norm(o.text) === norm(c.hook)) o.text = hookText;
    c.headlines.a1 = hookText;
  }
  c.hook = hookText;
  c.gapExtraMs = undefined;
  Object.assign(c, timing(c.narration, personalityFor(c.slug)));
  // a revision that came out under the 20s minimum gets a little more air between lines instead of being refused
  if (c.estSeconds < 23 && c.estSeconds >= 15 && c.narration.length > 1) {
    c.gapExtraMs = Math.min(900, Math.ceil(((23 - c.estSeconds) * 1000) / (c.narration.length - 1)));
    Object.assign(c, timing(c.narration, personalityFor(c.slug), c.gapExtraMs));
  }
}

// ---- the text operations (shared with hand-written scripts) -----------------------------------------------------------------------------

export type Script = { narration: NarrationLine[]; claims: Array<{ id: string; text: string }>; onScreen: Array<{ sceneId: string; kind: string; text: string }>; headlines?: Record<string, string> };

const everyText = (s: Script) => [...s.narration.flatMap((l) => [l.spoken, l.caption ?? ""]), ...s.onScreen.map((o) => o.text), ...Object.values(s.headlines ?? {})];

/** Applies one text op. Returns the ids of the lines it changed, or a failure. */
export function textOp(s: Script, op: EditOp, changed: Set<string>, changes: string[]): ApplyFail | null {
  const line = (id: string) => s.narration.find((l) => l.id === id);
  if (op.op === "remove_text") {
    const l = line(op.line);
    if (!l) return fail("invalid", `there is no line ${op.line}`);
    const r = removePhrase(l.spoken, op.phrase);
    const rc = l.caption ? removePhrase(l.caption, op.phrase) : null;
    if (!r && !rc) return fail("invalid", `line ${op.line} says nothing about "${op.phrase}"`);
    if (r) l.spoken = carryMarkers(r.text, r.lost);
    if (rc) l.caption = rc.text;
    if (!parseSpoken(l.spoken).words.length) return fail("invalid", `removing "${op.phrase}" would leave line ${op.line} empty; remove the whole line instead`);
    for (const cl of s.claims) {
      if (!l.claims.includes(cl.id)) continue;
      const rr = removePhrase(cl.text, op.phrase);
      if (rr) cl.text = rr.text;
    }
    const key = norm(op.phrase);
    s.onScreen = s.onScreen.filter((o) => !(o.kind !== "cta" && key.includes(norm(o.text)) && norm(o.text).length > 3));
    changed.add(l.id);
    changes.push(`line ${l.id}: removed "${op.phrase}"`);
  } else if (op.op === "rewrite_line") {
    const l = line(op.line);
    if (!l) return fail("invalid", `there is no line ${op.line}`);
    const keep = markersIn(l.spoken);
    l.spoken = carryMarkers(op.spoken, keep);
    if (op.caption !== undefined) l.caption = op.caption || undefined;
    else if (l.caption && l !== s.narration[s.narration.length - 1]) l.caption = undefined;
    changed.add(l.id);
    changes.push(`line ${l.id}: reworded`);
  } else if (op.op === "replace_text") {
    if (!op.find.trim() || norm(op.find) === norm(op.replace)) return fail("invalid", "nothing to replace");
    const re = new RegExp(`\\b${op.find.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    let hits = 0;
    const sub = (t: string) => t.replace(re, () => (hits++, op.replace));
    for (const l of s.narration) {
      const before = l.spoken + (l.caption ?? "");
      l.spoken = sub(l.spoken);
      if (l.caption) l.caption = sub(l.caption);
      if (l.spoken + (l.caption ?? "") !== before) changed.add(l.id);
    }
    for (const o of s.onScreen) o.text = sub(o.text);
    if (s.headlines) for (const k of Object.keys(s.headlines)) s.headlines[k] = sub(s.headlines[k]);
    if (!hits) return fail("invalid", `"${op.find}" is not in the script`);
    changes.push(`replaced "${op.find}" with "${op.replace}" (${hits} place${hits === 1 ? "" : "s"})`);
  } else if (op.op === "expand_abbreviations") {
    const found = new Set(everyText(s).flatMap((t) => abbreviationsIn(t, op.words?.filter((w) => MONTHS[w.toLowerCase().replace(/\.$/, "")]) ?? [])));
    const only = op.words?.length ? op.words : undefined;
    let any = false;
    for (const l of s.narration) {
      const b = l.spoken + (l.caption ?? "");
      l.spoken = expandAbbreviations(l.spoken, only);
      if (l.caption) l.caption = expandAbbreviations(l.caption, only);
      if (l.spoken + (l.caption ?? "") !== b) (changed.add(l.id), (any = true));
    }
    for (const o of s.onScreen) {
      const t = expandAbbreviations(o.text, only);
      if (t !== o.text) ((o.text = t), (any = true));
    }
    if (s.headlines)
      for (const k of Object.keys(s.headlines)) {
        const t = expandAbbreviations(s.headlines[k], only);
        if (t !== s.headlines[k]) ((s.headlines[k] = t), (any = true));
      }
    if (any || found.size) changes.push(`spelled out ${[...found].join(", ") || "abbreviations"}`);
    // nothing abbreviated in the words is fine for a concept: the control labels may still carry abbreviations (handled by the caller)
  } else return fail("unsupported", `${op.op} is not a text edit`);
  return null;
}

// ---- the plan ---------------------------------------------------------------------------------------------------------------------------

const PHASE: Record<EditOp["op"], number> = { remove_scene: 0, reorder_scenes: 1, remove_step: 2, replace_step: 2, remove_line: 3, consolidate: 4, rewrite_line: 5, remove_text: 6, replace_text: 7, expand_abbreviations: 8, zoom: 9, recapture: 9, pronunciation: 10, pace: 10, cta_text: 10, cta_url: 10 };

const TEXT_OPS = new Set<EditOp["op"]>(["remove_text", "rewrite_line", "replace_text", "expand_abbreviations"]);
export const isTextOp = (o: EditOp) => TEXT_OPS.has(o.op);

/** The intents that change the voice or the call to action rather than the script. The caller merges them into the product's standing overrides. */
export function intentOf(op: EditOp, concept: Pick<Concept, "narration" | "productName" | "ctaHost">): Intent | ApplyFail | null {
  if (op.op === "pronunciation") {
    const key = letters(op.written);
    if (key.length < 3) return fail("invalid", "a pronunciation needs a written word of at least three letters");
    if (letters(op.spoken) !== key) return fail("unsafe", `"${op.spoken}" is a different word from "${op.written}": only how a word sounds can change, never the words`);
    if (!/^[A-Za-z]+(?: [A-Za-z]+){0,3}$/.test(op.spoken.trim())) return fail("unsafe", "a pronunciation can only be letters and spaces");
    const hay = letters(`${concept.narration.map((l) => `${l.spoken} ${l.caption ?? ""}`).join(" ")} ${concept.productName} ${concept.ctaHost}`);
    if (!hay.includes(key)) return fail("invalid", `"${op.written}" is not said in the video`);
    return { type: "lexicon", key, written: op.written, spoken: op.spoken.trim() };
  }
  if (op.op === "pace") {
    const mag = op.amount === "slightly" ? 0.04 : op.amount === "much" ? 0.12 : 0.08;
    const slow = op.direction === "slower";
    const factor = slow ? 1 - mag : 1 + mag * 0.75;
    return { type: "pace", factor, label: `${slow ? "slower" : "faster"} voice (${Math.round(Math.abs(factor - 1) * 100)}%)` };
  }
  if (op.op === "cta_text") return { type: "cta_text", text: op.text };
  if (op.op === "cta_url") return { type: "cta_url", url: op.url };
  return null;
}

export function applyPlan(source: Concept, plan: EditPlan, cx: ApplyContext): ApplyResult {
  const c: Concept = structuredClone(source);
  const changes: string[] = [];
  const changed = new Set<string>();
  const affected = new Set<string>();
  const intents: Intent[] = [];
  const stepsChanged: Array<[number, 0 | 1]> = [];
  const rewritten = new Set<string>();
  const ops = plan.ops.map((o, i) => ({ o, i })).sort((a, b) => PHASE[a.o.op] - PHASE[b.o.op] || (a.o.op === "remove_scene" && b.o.op === "remove_scene" ? sceneNo((b.o as { scene: string }).scene) - sceneNo((a.o as { scene: string }).scene) : a.i - b.i)).map((x) => x.o);

  for (const op of ops) {
    if (op.op === "remove_scene") {
      const n = sceneNo(op.scene);
      const e = dropScene(c, n);
      if (e) return fail("invalid", e);
      affected.add(op.scene);
      changes.push(`removed scene ${op.scene}`);
      for (const l of c.narration) changed.add(l.id);
    } else if (op.op === "reorder_scenes") {
      const e = reorder(c, op.order);
      if (e) return fail("invalid", e);
      changes.push(`scenes reordered: ${op.order.join(", ")}`);
      op.order.forEach((s) => affected.add(s));
    } else if (op.op === "remove_step" || op.op === "replace_step") {
      const pi = c.capturePlan.findIndex((p) => p.id === op.plate);
      if (pi < 0) return fail("invalid", `there is no scene for ${op.plate}`);
      const k = (op.step - 1) as 0 | 1;
      const cands = cx.candidates.filter((x) => x.plate === op.plate && x.step === op.step);
      const pick = op.op === "replace_step" ? cands.find((x) => x.id === op.candidate) : [...cands].sort((a, b) => Number(a.sameControl) - Number(b.sameControl))[0];
      if (!pick) return fail("invalid", op.op === "replace_step" ? `"${op.candidate}" is not one of the real alternatives for that tap` : `there is no other real tap to show in place of tap ${op.step} of ${op.plate}`);
      setStep(c, pi, k, structuredClone(pick.def));
      stepsChanged.push([pi, k]);
      affected.add(`a${pi + 1}`);
      changes.push(`scene a${pi + 1}, tap ${op.step}: now ${pick.def.kind === "click" ? `"${pick.def.name}", and the page shows "${pick.def.payoff}"` : "a different step"}`);
    } else if (op.op === "remove_line") {
      const i = c.narration.findIndex((l) => l.id === op.line);
      if (i < 0) return fail("invalid", `there is no line ${op.line}`);
      if (i === 0 || i === c.narration.length - 1) return fail("invalid", "the opening and closing lines cannot be removed; reword them instead");
      const l = c.narration[i];
      if (c.narration.filter((x) => x.sceneId === l.sceneId).length < 2) return fail("invalid", `${op.line} is the only line of its scene; remove the scene instead`);
      // what the removed line was tied to stays tied to a spoken line of its scene
      const near = c.narration.slice(0, i).reverse().find((x) => x.sceneId === l.sceneId) ?? c.narration.slice(i + 1).find((x) => x.sceneId === l.sceneId);
      if (near) near.claims = [...new Set([...near.claims, ...l.claims])];
      c.narration.splice(i, 1);
      affected.add(l.sceneId);
      changes.push(`removed line ${l.id}: "${stripMarkers(l.spoken)}"`);
    } else if (op.op === "consolidate") {
      const ls = op.lines.map((id) => c.narration.find((l) => l.id === id));
      if (ls.some((l) => !l) || ls.length < 2) return fail("invalid", "a consolidation needs at least two existing lines");
      const lines = ls as NarrationLine[];
      if (new Set(lines.map((l) => l.sceneId)).size !== 1) return fail("invalid", "lines can only be consolidated within one scene");
      const keep = lines[0];
      const markers = lines.flatMap((l) => markersIn(l.spoken));
      keep.spoken = carryMarkers(op.spoken, markers);
      keep.caption = op.caption || undefined;
      keep.claims = [...new Set(lines.flatMap((l) => l.claims))];
      c.narration = c.narration.filter((l) => l === keep || !lines.includes(l));
      changed.add(keep.id);
      rewritten.add(keep.id);
      affected.add(keep.sceneId);
      changes.push(`consolidated ${op.lines.join(", ")} into one line`);
    } else if (op.op === "zoom") {
      c.zoomBias = Math.max(-0.1, Math.min(0.15, +((c.zoomBias ?? 0) + (op.direction === "closer" ? 0.06 : -0.05)).toFixed(3)));
      changes.push(`camera ${op.direction === "closer" ? "closer" : "wider"}`);
    } else if (op.op === "recapture") {
      if (!c.capturePlan.some((p) => p.id === op.plate)) return fail("invalid", `there is no scene for ${op.plate}`);
      affected.add(`a${c.capturePlan.findIndex((p) => p.id === op.plate) + 1}`);
    } else if (isTextOp(op)) {
      if (op.op === "rewrite_line") rewritten.add(op.line);
      const e = textOp(c, op, changed, changes);
      if (e) return e;
      if (op.op === "rewrite_line" || op.op === "remove_text") affected.add(c.narration.find((l) => l.id === (op as { line: string }).line)?.sceneId ?? "");
      if (op.op === "expand_abbreviations") {
        // the focus label names the control; spell out an abbreviated control name there too
        c.capturePlan.forEach((pl, pi) =>
          pl.clicks.forEach((k, ki) => {
            if (k.kind !== "click") return;
            const full = expandAbbreviations(k.name, op.words?.length ? op.words : undefined);
            if (full !== k.name) {
              k.display = full;
              affected.add(`a${pi + 1}`);
              const line = stepLine(c, pi, ki as 0 | 1);
              if (line) changed.add(line.id);
              changes.push(`label "${k.name}" now reads "${full}"`);
            }
          }),
        );
      }
    } else {
      const it = intentOf(op, c);
      if (!it) return fail("unsupported", `${(op as { op: string }).op} is not an edit this engine knows`);
      if ("ok" in it) return it;
      intents.push(it);
      changes.push(it.type === "lexicon" ? `say "${it.written}" as "${it.spoken}" (written text unchanged)` : it.type === "pace" ? it.label : it.type === "cta_text" ? `call-to-action wording: "${it.text}"` : `call-to-action destination: ${it.url}`);
    }
  }

  // a tap that was swapped but whose line was not reworded gets a plain, accurate line
  for (const [pi, k] of stepsChanged) {
    const line = stepLine(c, pi, k);
    const st = c.capturePlan[pi].clicks[k];
    if (line && !rewritten.has(line.id) && st.kind === "click") {
      line.spoken = carryMarkers(autoLine(st.display ?? st.name, st.payoff), markersIn(line.spoken));
      line.caption = undefined;
      changed.add(line.id);
    }
  }

  const problems = ensureMarkers(c);
  settle(c);
  problems.push(...resultProblems(c, plan, cx, changed, stepsChanged, source));
  if (problems.length) return fail("invalid", problems.join("; "));
  affected.delete("");
  return { ok: true, concept: c, changes, affected: [...affected].sort(), intents, changedLines: [...changed] };
}

/** The checks a rebuilt script must pass before anything is rendered. */
export function resultProblems(c: Concept, plan: EditPlan, cx: ApplyContext, changed: Set<string>, stepsChanged: Array<[number, 0 | 1]>, source?: Concept): string[] {
  const out: string[] = [];
  const claimIds = new Set(c.claims.map((x) => x.id));
  for (const l of c.narration) {
    if (!l.claims.length || l.claims.some((x) => !claimIds.has(x))) out.push(`line ${l.id} is not tied to a Product Truth claim`);
    if (!parseSpoken(l.spoken).words.length) out.push(`line ${l.id} is empty`);
  }
  const changedLines = c.narration.filter((l) => changed.has(l.id));
  const extra = new Set<string>();
  for (const w of [...Object.values(WEEKDAYS), ...Object.values(MONTHS), ...c.capturePlan.flatMap((p) => p.clicks.map((k) => (k.kind === "scroll" ? "" : (k.display ?? k.name)))), c.productName, c.ctaHost]) (w.toLowerCase().match(/[a-z']+/g) ?? []).forEach((x) => extra.add(x));
  for (const u of c.claimsUsed) (u.quote.toLowerCase().match(/[a-z']+/g) ?? []).forEach((x) => extra.add(x));
  const vocab = new Set([...cx.vocabulary, ...extra]);
  // the numerals the product showed may be written as words (13 as thirteen)
  for (const m of cx.factText.match(/\b\d{1,2}\b/g) ?? []) numberWords(Number(m)).forEach((w) => vocab.add(w));
  // Only what a line NEW says is held to the product: ordinary words are free, but a figure, a promise, a capability, or a name the product never showed is not. Words a line already had are not re-judged.
  for (const l of changedLines) {
    const old = new Set((source?.narration.find((x) => x.id === l.id)?.spoken ?? "").toLowerCase().match(/[a-z0-9’'-]+/g) ?? []);
    const text = stripMarkers(l.spoken);
    const fresh = (text.match(/[A-Za-z0-9’'-]+/g) ?? []).filter((w) => !old.has(w.toLowerCase()));
    const names = fresh.filter((w) => /^[A-Z][a-z]{2,}/.test(w) && text.indexOf(w) > 0 && !w.toLowerCase().split(/[-’']/).filter(Boolean).every((p) => vocab.has(p)));
    if (names.length) out.push(`a name the product never showed: ${[...new Set(names)].join(", ")}`);
    out.push(...aiGrounding({ ...c, narration: [{ id: "x", sceneId: "x", spoken: "x", claims: [] }, { id: l.id, sceneId: l.sceneId, spoken: fresh.join(" "), claims: l.claims }] } as Concept, vocab, cx.factText));
  }
  out.push(...scriptProblems(changedLines, c.onScreen.map((o) => o.text), cx.prohibited));
  // a qualifier the page itself uses (confirmed, verified, official) is part of what the claim says: it may be said once instead of four times, never dropped
  if (source) {
    const said = (x: Concept) => x.narration.map((l) => `${stripMarkers(l.spoken)} ${l.caption ?? ""}`).join(" ").toLowerCase();
    const wasSaid = said(source);
    const nowSaid = said(c);
    for (const q of ["confirmed", "verified", "official"]) if (wasSaid.includes(q) && !nowSaid.includes(q) && !plan.ops.some((o) => o.op === "remove_text" && o.phrase.toLowerCase().includes(q))) out.push(`"${q}" is a qualifier the page uses, so it must still be said at least once`);
  }
  for (const f of cx.flagged) {
    const key = norm(f);
    if (!key) continue;
    const hay = [...c.narration.flatMap((l) => [stripMarkers(l.spoken), l.caption ?? ""]), ...c.onScreen.map((o) => o.text), ...Object.values(c.headlines), ...c.claims.map((x) => x.text), ...c.capturePlan.flatMap((p) => p.clicks.flatMap((k) => [k.payoff, k.kind === "scroll" ? "" : k.name]))].map(norm);
    if (hay.some((h) => h.includes(key))) out.push(`"${f}" is reported as wrong but is still in the video`);
  }
  for (const o of plan.ops) {
    if (o.op !== "remove_text") continue;
    const key = norm(o.phrase);
    if (key.split(" ").length >= 2 && c.narration.some((l) => norm(stripMarkers(l.spoken)).includes(key))) out.push(`"${o.phrase}" is still said after it was removed`);
  }
  for (const pi of new Set(stepsChanged.map(([p]) => p))) {
    const [s1, s2] = c.capturePlan[pi].clicks;
    if (s1.kind === "click" && s2.kind === "click" && s1.control === s2.control) out.push(`both taps of ${c.capturePlan[pi].id} would be "${s1.name}"; pick two different taps`);
  }
  for (const [pi, k] of stepsChanged) {
    const line = stepLine(c, pi, k);
    const st = c.capturePlan[pi].clicks[k];
    if (!line) continue;
    const tapText = `${st.kind === "scroll" ? "" : `${st.name} ${expandAbbreviations(st.name)} ${st.display ?? ""}`} ${st.payoff}`;
    const shared = contentTokens(stripMarkers(line.spoken)).filter((w) => contentTokens(tapText).includes(w));
    if (!shared.length) out.push(`the line for tap ${pi * 2 + k + 1} ("${stripMarkers(line.spoken).slice(0, 60)}") is not about that tap`);
  }
  if (c.narration.length < 5) out.push(`only ${c.narration.length} spoken lines are left (a video needs at least 5)`);
  if (c.estSeconds < 15) out.push(`the video would run about ${c.estSeconds}s, which is too short (it needs 20 to 35s): reword or replace instead of removing`);
  if (c.estSeconds > 36) out.push(`the video would run about ${c.estSeconds}s, which is too long (it needs 20 to 35s)`);
  return [...new Set(out)];
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
/** The words for a whole number under a hundred ("thirteen", "twenty", "twenty-one"). */
export function numberWords(n: number): string[] {
  if (n < 20) return [ONES[n]];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? [t, ONES[n % 10]] : [t];
}

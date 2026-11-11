/**
 * Hand-written scripts (the older, product-specific demos) keep their timeline code, so an owner edit to one is a TEXT edit layered over the script: reworded or trimmed lines, claim
 * text and on-screen text. The edits are stored per script and applied every time the script loads, so they last for later versions. The renderer reads the same narration array, the voice
 * is recorded from the edited text, and the timeline is rebuilt from the new audio lengths. Whole-scene edits need a generated script, which has a plan the engine can rebuild.
 */
import type { StudioDb } from "../db";
import { getSetting } from "../runtime";
import type { DemoSpec } from "../video/demo/specs";
import type { EditOp, EditPlan } from "./types";
import { isTextOp, textOp, type Script } from "./apply";

export const scriptEditsKey = (specId: string) => `video_script_edits_${specId.replace(/[^a-z0-9]+/gi, "_")}`;
export type ScriptEdits = { lines: Record<string, { spoken: string; caption: string | null }>; claims: Record<string, string>; onScreen: Array<{ sceneId: string; kind: "headline" | "label" | "cta"; text: string; claim: string }> | null };

type Original = { narration: DemoSpec["narration"]; claims: DemoSpec["claims"]; onScreen: DemoSpec["onScreen"] };
const ORIGINAL = new WeakMap<DemoSpec, Original>();

/** Puts the stored edits over the script's own text (in place, because the timeline code reads the same arrays). Always starts from the untouched original. */
export function applyScriptEdits(spec: DemoSpec, edits: ScriptEdits | null): void {
  if (!ORIGINAL.has(spec)) ORIGINAL.set(spec, structuredClone({ narration: spec.narration, claims: spec.claims, onScreen: spec.onScreen }));
  const orig = ORIGINAL.get(spec)!;
  for (const o of orig.narration) {
    const l = spec.narration.find((x) => x.id === o.id);
    if (!l) continue;
    l.spoken = o.spoken;
    if (o.caption) l.caption = o.caption;
    else delete l.caption;
    const e = edits?.lines[o.id];
    if (e) {
      l.spoken = e.spoken;
      if (e.caption) l.caption = e.caption;
      else delete l.caption;
    }
  }
  for (const o of orig.claims) {
    const c = spec.claims.find((x) => x.id === o.id);
    if (c) c.text = edits?.claims[o.id] ?? o.text;
  }
  const want = edits?.onScreen ?? orig.onScreen;
  spec.onScreen.splice(0, spec.onScreen.length, ...structuredClone(want));
}

export async function loadScriptEdits(db: StudioDb, specId: string): Promise<ScriptEdits | null> {
  return getSetting<ScriptEdits | null>(scriptEditsKey(specId), null, db);
}

export const isHandwrittenOp = (o: EditOp) => isTextOp(o) || ["pronunciation", "pace", "cta_text", "cta_url", "recapture", "zoom"].includes(o.op);

/** Runs the plan's text edits on a copy of the script and returns what to store (the difference from the original), or why it cannot be done. */
export function planHandwritten(spec: DemoSpec, plan: EditPlan): { ok: true; edits: ScriptEdits; changes: string[]; changedLines: string[] } | { ok: false; reason: string } {
  const orig = ORIGINAL.get(spec) ?? structuredClone({ narration: spec.narration, claims: spec.claims, onScreen: spec.onScreen });
  const script: Script = structuredClone({ narration: spec.narration, claims: spec.claims, onScreen: spec.onScreen });
  const bad = plan.ops.find((o) => !isHandwrittenOp(o));
  if (bad) return { ok: false, reason: `this older script can only be edited line by line; "${bad.op}" needs a script the engine can rebuild` };
  const changed = new Set<string>();
  const changes: string[] = [];
  for (const op of plan.ops) {
    if (!isTextOp(op)) continue;
    const e = textOp(script, op, changed, changes);
    if (e) return { ok: false, reason: e.reason };
  }
  const edits: ScriptEdits = { lines: {}, claims: {}, onScreen: null };
  for (const l of script.narration) {
    const o = orig.narration.find((x) => x.id === l.id)!;
    if (l.spoken !== o.spoken || (l.caption ?? null) !== (o.caption ?? null)) edits.lines[l.id] = { spoken: l.spoken, caption: l.caption ?? null };
  }
  for (const c of script.claims) {
    const o = orig.claims.find((x) => x.id === c.id)!;
    if (c.text !== o.text) edits.claims[c.id] = c.text;
  }
  if (JSON.stringify(script.onScreen) !== JSON.stringify(orig.onScreen)) edits.onScreen = script.onScreen as ScriptEdits["onScreen"];
  return { ok: true, edits, changes, changedLines: [...changed] };
}

/**
 * The visual scene editor's model. The customer sees their video as scenes (a frame, the words, the on-screen text, where the visual comes from) and says what is wrong with each
 * one in plain terms: keep it, change its wording, replace its visual, or remove it. They never see markers, timing, scripts or capture internals. What they choose is turned into the
 * same structured edit plan the free-text note produces, so unchanged scenes are left exactly as they were and only the touched ones are rebuilt.
 */
import { eq } from "drizzle-orm";
import { ms, type StudioDb } from "../db";
import { getSetting } from "../runtime";
import type { StepCandidate } from "./candidates";
import { conceptKey, type StoredConcept } from "../video/concepts/registry";
import { speakable } from "../video/concepts/generate";
import type { EditOp } from "./types";
import type { ReviewState } from "../publishing/video-review";

export const framesKey = (videoRowId: string) => `video_scene_frames_${videoRowId}`;

export const SCENE_ACTIONS = ["keep", "wording", "visual", "remove"] as const;
export type SceneAction = (typeof SCENE_ACTIONS)[number];
export const ACTION_LABELS: Record<SceneAction, string> = { keep: "Keep", wording: "Change wording", visual: "Replace visual", remove: "Remove scene" };

/** Shortcuts for the whole video; each adds one plain sentence to the overall instructions. */
export const OVERALL_SHORTCUTS = {
  repetitive: { label: "Make it less repetitive", sentence: "Make this less repetitive." },
  shorter: { label: "Shorten the whole video", sentence: "Shorten the whole video." },
  us: { label: "Use U.S. examples", sentence: "Use U.S. examples and locations." },
  exciting: { label: "Make it more exciting", sentence: "Make it more exciting." },
} as const;
export type OverallShortcut = keyof typeof OVERALL_SHORTCUTS;

export type SceneEdit = { scene: string; action: SceneAction; note?: string; /** only the lines whose words the customer changed */ lines?: Record<string, { spoken?: string; caption?: string }> };
export type SceneEdits = { overall: string; scenes: SceneEdit[]; cta?: { text: string } };

export type SceneLine = { id: string; spoken: string; caption: string };
export type SceneView = { id: string; n: number; label: string; kind: "screen" | "end"; startSec: number; endSec: number; lines: SceneLine[]; onScreen: string[]; visual: string; frame?: string; canRemove: boolean; canReplaceVisual: boolean };
export type SceneEditView = { publicationId: string; title: string; durationSec: number; structure: "generated" | "hand_written"; ctaText: string; scenes: SceneView[] };

type Board = {
  title?: string;
  durationMs?: number;
  cta?: { text: string };
  scenes?: Array<{ id: string; kind: string; startMs: number; endMs: number; headline?: string; sourceVisual?: { plate?: string; url?: string; states?: string[] } }>;
  transcript?: Array<{ id: string; sceneId: string; text: string; caption?: string }>;
  onScreen?: Array<{ sceneId: string; kind: string; text: string }>;
};

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n) : "");

/** The scenes of a rendered video, in words a customer understands. Built from the video's own record, never from the script's internals. */
export async function buildSceneEditView(db: StudioDb, review: ReviewState): Promise<SceneEditView | null> {
  const [row] = await db.select({ storyboard: ms.msVideos.storyboard }).from(ms.msVideos).where(eq(ms.msVideos.id, review.videoRowId)).limit(1);
  const board = row?.storyboard as Board | null | undefined;
  if (!board?.scenes?.length || !board.transcript?.length) return null;
  const stored = review.specId ? await getSetting<StoredConcept | null>(conceptKey(review.specId), null, db) : null;
  const concept = stored?.concept ?? null;
  const frames = (await getSetting<Record<string, string> | null>(framesKey(review.videoRowId), null, db)) ?? {};
  const screenCount = board.scenes.filter((s) => s.kind === "screen").length;
  const scenes: SceneView[] = board.scenes.map((s, i) => {
    const plate = concept?.capturePlan.find((p) => p.id === s.sourceVisual?.plate);
    const taps = plate?.clicks.map((k) => (k.kind === "scroll" ? "scrolls down the page" : `taps ${k.display ?? k.name}`)) ?? [];
    let where = "";
    try {
      if (s.sourceVisual?.url) where = new URL(s.sourceVisual.url).host.replace(/^www\./, "") + new URL(s.sourceVisual.url).pathname.replace(/\/$/, "");
    } catch {
      where = "";
    }
    const visual = s.kind === "end" ? "Closing card with your logo and call to action" : `Live page${where ? ` ${where}` : ""}${taps.length ? `: the video ${taps.join(", then ")}` : ""}`;
    return {
      id: s.id,
      n: i + 1,
      label: s.kind === "end" ? "Closing" : `Scene ${i + 1}`,
      kind: s.kind === "end" ? "end" : "screen",
      startSec: Math.round(s.startMs / 100) / 10,
      endSec: Math.round(s.endMs / 100) / 10,
      lines: (board.transcript ?? []).filter((l) => l.sceneId === s.id).map((l) => ({ id: l.id, spoken: l.text, caption: l.caption ?? l.text })),
      onScreen: [...new Set((board.onScreen ?? []).filter((o) => o.sceneId === s.id && o.kind !== "cta").map((o) => o.text))],
      visual,
      ...(frames[s.id] ? { frame: frames[s.id] } : {}),
      canRemove: Boolean(concept) && s.kind === "screen" && screenCount > 1,
      canReplaceVisual: Boolean(concept) && s.kind === "screen",
    };
  });
  // each scene runs until the next one starts (the cross-fades between them are not shown to the customer as overlaps)
  const total = Math.round((board.durationMs ?? 0) / 100) / 10;
  scenes.forEach((sc, i) => {
    sc.endSec = i + 1 < scenes.length ? scenes[i + 1].startSec : Math.max(total, sc.endSec);
  });
  return { publicationId: review.publicationId, title: board.title ?? review.title, durationSec: total, structure: concept ? "generated" : "hand_written", ctaText: board.cta?.text ?? review.ctaText, scenes };
}

/** What the customer changed, read from the editor form. Only real changes are kept; an untouched editor yields null. */
export function sceneEditsFromForm(get: (name: string) => string | null, view: SceneEditView): SceneEdits | null {
  const shortcuts = (Object.keys(OVERALL_SHORTCUTS) as OverallShortcut[]).filter((k) => get(`overall_${k}`) === "on").map((k) => OVERALL_SHORTCUTS[k].sentence);
  const overall = [clip(get("overall"), 1200), ...shortcuts].filter(Boolean).join(" ");
  const scenes: SceneEdit[] = [];
  for (const sc of view.scenes) {
    let action = (SCENE_ACTIONS as readonly string[]).includes(get(`action_${sc.id}`) ?? "") ? (get(`action_${sc.id}`) as SceneAction) : "keep";
    if ((action === "remove" && !sc.canRemove) || (action === "visual" && !sc.canReplaceVisual)) action = "keep";
    const note = clip(get(`note_${sc.id}`), 600);
    const lines: SceneEdit["lines"] = {};
    for (const l of sc.lines) {
      const spoken = clip(get(`spoken_${l.id}`), 400);
      const caption = clip(get(`caption_${l.id}`), 400);
      const entry: { spoken?: string; caption?: string } = {};
      if (spoken && norm(spoken) !== norm(l.spoken)) entry.spoken = spoken;
      if (caption && norm(caption) !== norm(l.caption)) entry.caption = caption;
      if (entry.spoken || entry.caption) lines[l.id] = entry;
    }
    if (action !== "keep" || note || Object.keys(lines).length) scenes.push({ scene: sc.id, action: Object.keys(lines).length && action === "keep" ? "wording" : action, ...(note ? { note } : {}), ...(Object.keys(lines).length ? { lines } : {}) });
  }
  const ctaText = clip(get("cta_text"), 60);
  const cta = ctaText && norm(ctaText) !== norm(view.ctaText) ? { text: ctaText } : undefined;
  return overall || scenes.length || cta ? { overall, scenes, ...(cta ? { cta } : {}) } : null;
}

/** The same request in plain words, kept as the note of the request and shown back to the customer. */
export function composeNote(edits: SceneEdits, view: SceneEditView): string {
  const parts: string[] = [];
  if (edits.overall) parts.push(`Whole video: ${edits.overall}`);
  for (const e of edits.scenes) {
    const sc = view.scenes.find((x) => x.id === e.scene);
    const label = sc?.label ?? e.scene;
    const bits = [e.action === "remove" ? "remove this scene" : e.action === "visual" ? "replace the visual" : "", Object.keys(e.lines ?? {}).length ? "new wording" : "", e.note ?? ""].filter(Boolean);
    parts.push(`${label}: ${bits.join("; ") || "keep"}`);
  }
  if (edits.cta) parts.push(`Call to action: "${edits.cta.text}"`);
  return parts.join(" | ").slice(0, 2000);
}

/** Reads stored edits back safely (they are customer input stored as JSON). */
export function cleanSceneEdits(raw: unknown): SceneEdits | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { overall?: unknown; scenes?: unknown; cta?: { text?: unknown } };
  const scenes: SceneEdit[] = [];
  for (const s of Array.isArray(r.scenes) ? r.scenes : []) {
    const e = s as { scene?: unknown; action?: unknown; note?: unknown; lines?: unknown };
    const scene = clip(e.scene, 12);
    if (!/^(a\d{1,2}|end)$/.test(scene)) continue;
    const action = (SCENE_ACTIONS as readonly string[]).includes(String(e.action)) ? (e.action as SceneAction) : "keep";
    const lines: NonNullable<SceneEdit["lines"]> = {};
    for (const [id, v] of Object.entries((e.lines && typeof e.lines === "object" ? e.lines : {}) as Record<string, { spoken?: unknown; caption?: unknown }>)) {
      if (!/^L\d{1,3}$/.test(id)) continue;
      const spoken = clip(v?.spoken, 400);
      const caption = clip(v?.caption, 400);
      if (spoken || caption) lines[id] = { ...(spoken ? { spoken } : {}), ...(caption ? { caption } : {}) };
    }
    const note = clip(e.note, 600);
    scenes.push({ scene, action, ...(note ? { note } : {}), ...(Object.keys(lines).length ? { lines } : {}) });
  }
  const overall = clip(r.overall, 1500);
  const cta = clip(r.cta?.text, 60);
  return overall || scenes.length || cta ? { overall, scenes, ...(cta ? { cta: { text: cta } } : {}) } : null;
}

export type CompileContext = {
  lines: Array<{ id: string; scene: string; text: string }>;
  taps: Array<{ plate: string; step: 1 | 2; control?: number; shows: string }>;
  candidates: StepCandidate[];
  structure: "generated" | "hand_written";
};

/**
 * Turns the editor's choices into engine edits. What can be decided exactly (the customer's own words, removing a scene, picking another real visual, the call to action) becomes
 * an exact edit; what is said in words (a note on a scene, the overall instructions) is returned as text for the planner, mentioning which scene it is about.
 */
export function compileSceneEdits(edits: SceneEdits, cx: CompileContext): { ops: EditOp[]; freeText: string; summary: string[] } {
  const ops: EditOp[] = [];
  const free: string[] = [];
  const summary: string[] = [];
  const scenesInOrder = [...new Set(cx.lines.map((l) => l.scene))];
  const num = (id: string) => scenesInOrder.indexOf(id) + 1;
  const used = new Set(cx.taps.map((t) => t.shows));
  for (const e of edits.scenes) {
    const n = num(e.scene);
    if (n < 1) continue;
    if (e.action === "remove") {
      if (cx.structure === "generated" && /^a\d+$/.test(e.scene)) {
        ops.push({ op: "remove_scene", scene: e.scene });
        summary.push(`Scene ${n} is removed.`);
        continue;
      }
      free.push(`Scene ${n}: remove this scene.`);
      continue;
    }
    for (const [id, v] of Object.entries(e.lines ?? {})) {
      const cur = cx.lines.find((l) => l.id === id && l.scene === e.scene);
      if (!cur) continue;
      ops.push({ op: "rewrite_line", line: id, spoken: v.spoken ?? cur.text, ...(v.caption ? { caption: v.caption } : {}) });
      summary.push(`Scene ${n}: the wording of ${id} is replaced with the customer's own words.`);
    }
    if (e.action === "visual") {
      const plate = /^a(\d+)$/.exec(e.scene) ? `p${/^a(\d+)$/.exec(e.scene)![1]}` : "";
      const pick = cx.structure === "generated" && plate ? pickVisual(plate, cx, used) : null;
      if (pick) {
        ops.push({ op: "replace_step", plate, step: 1, candidate: pick[0].id }, { op: "replace_step", plate, step: 2, candidate: pick[1].id });
        for (const c of pick) used.add(c.def.payoff);
        summary.push(`Scene ${n}: the visual is replaced with another real result from the same page.`);
      } else free.push(`Scene ${n}: show a different visual.`);
    }
    if (e.note) free.push(`Scene ${n} (scene id ${e.scene}, lines ${cx.lines.filter((l) => l.scene === e.scene).map((l) => l.id).join(", ")}): ${e.note}`);
  }
  if (edits.cta?.text) {
    ops.push({ op: "cta_text", text: edits.cta.text });
    summary.push("The call to action wording is changed.");
  }
  if (edits.overall) free.push(`Whole video: ${edits.overall}`);
  return { ops, freeText: free.join(" "), summary };
}

/** Two real alternatives for a scene's two taps: different controls, never what this scene already shows, results shown nowhere else first, then ones the voice can say first. */
function pickVisual(plate: string, cx: CompileContext, used: Set<string>): [StepCandidate, StepCandidate] | null {
  const own = new Set(cx.taps.filter((t) => t.plate === plate).map((t) => t.shows));
  const fresh = (step: 1 | 2) =>
    cx.candidates
      .filter((c) => c.plate === plate && c.step === step && c.def.kind === "click" && !own.has(c.def.payoff))
      .sort((a, b) => Number(used.has(a.def.kind === "click" ? a.def.payoff : "")) - Number(used.has(b.def.kind === "click" ? b.def.payoff : "")) || Number(speakable(b.def.kind === "click" ? b.def.payoff : "")) - Number(speakable(a.def.kind === "click" ? a.def.payoff : "")) || Number(a.sameControl) - Number(b.sameControl));
  const ctl = (c: StepCandidate) => (c.def.kind === "click" ? c.def.control : -1);
  for (const a of fresh(1)) {
    const b = fresh(2).find((x) => ctl(x) !== ctl(a));
    if (b) return [a, b];
  }
  return null;
}

/** The engine's own plan wins where the customer was exact: it never overrides their words, their removed scene or the visual they asked to be replaced. */
export function mergeOps(structured: EditOp[], planned: EditOp[], lines: Array<{ id: string; scene: string }>): EditOp[] {
  const removed = new Set(structured.flatMap((o) => (o.op === "remove_scene" ? [o.scene] : [])));
  const removedLines = new Set(lines.filter((l) => removed.has(l.scene)).map((l) => l.id));
  const removedPlates = new Set([...removed].map((s) => `p${s.slice(1)}`));
  const exactLines = new Set(structured.flatMap((o) => (o.op === "rewrite_line" ? [o.line] : [])));
  const exactSteps = new Set(structured.flatMap((o) => (o.op === "replace_step" ? [`${o.plate}.${o.step}`] : [])));
  const keep = planned.filter((o) => {
    if ("line" in o && removedLines.has(o.line)) return false;
    if (o.op === "rewrite_line" && exactLines.has(o.line)) return false;
    if ((o.op === "replace_step" || o.op === "remove_step") && (removedPlates.has(o.plate) || exactSteps.has(`${o.plate}.${o.step}`))) return false;
    if (o.op === "remove_scene" && removed.has(o.scene)) return false;
    return true;
  });
  return [...structured, ...keep];
}

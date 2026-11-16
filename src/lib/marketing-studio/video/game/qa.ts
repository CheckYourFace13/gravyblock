/**
 * The GAME HARD QA. Before any game video can reach review, every one of these must hold: enough REAL gameplay, little menu, a cut that never breaks understanding, an objective a stranger can
 * follow, narration that sounds like game marketing and matches the picture, gameplay at once, no dead time, no footage repeated from another video, no level overused, a payoff, real frames
 * that are not black or blank, the right orientation with nothing cropped away, a voice that is there, balanced against the game audio and as energetic as the game's setting, a clip that sells
 * rather than teaches, and a clear reason to want to play. Pure: the finished file's own measurements are passed in. A failure is classified so the pipeline knows what to redo.
 */
import { GAME_FORMATS, gameRepeats, type GameCheck, type GameClip, type GameFormat, type GameMoment } from "./engine";
import type { GameProfile } from "./profile";
import { DEAD_KINDS, RESULT_KINDS, SHAPES, type Span } from "./sequence";
import { languageChecks, voiceEnergyCheck, type ScriptLine } from "./script";

export type FinalLine = ScriptLine & { startMs: number; endMs: number };
export type QaInput = {
  format: GameFormat;
  clip: GameClip;
  spans: Span[];
  profile: GameProfile;
  narrated: boolean;
  lines: FinalLine[];
  captions: string[];
  /** the gameplay length of the file (before the end card) and the end card's start */
  gameplayEndMs: number;
  canvas: { w: number; h: number };
  source: { w: number; h: number } | null;
  /** the size the footage is drawn at, inside the canvas */
  drawn: { w: number; h: number } | null;
  voice: { wordsPerSec: number; pitchSpread: number | null } | null;
  voiceOverBedDb: number | null;
  prior: GameClip[];
  /** levels no delivered video has used yet */
  unusedLevels: number;
  levelUses: ReadonlyMap<string, number>;
  /** before the render: the voice and the mix cannot be measured yet */
  planOnly?: boolean;
};

const live = (m: GameMoment) => !DEAD_KINDS.includes(m.kind) && m.source === "real_capture";
const content = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 3));

export function gameVideoChecks(i: QaInput): GameCheck[] {
  const spec = GAME_FORMATS[i.format];
  const shape = SHAPES[i.format];
  const ms = [...i.clip.moments].sort((a, b) => a.startMs - b.startMs);
  const total = Math.max(1, i.clip.durationMs);
  // real footage between two annotated live moments is still gameplay (captures that log events annotate sparsely); only a long unannotated gap, or a menu or idle moment, is dead time
  const BRIDGE = 2500;
  const liveRuns: Array<[number, number]> = [];
  for (const mm of ms.filter(live)) {
    const last = liveRuns[liveRuns.length - 1];
    if (last && mm.startMs - last[1] <= BRIDGE) last[1] = Math.max(last[1], mm.endMs);
    else liveRuns.push([mm.startMs, mm.endMs]);
  }
  const liveMs = liveRuns.reduce((n, r) => n + (r[1] - r[0]), 0);
  const deadMomentMs = ms.filter((m) => DEAD_KINDS.includes(m.kind)).reduce((n, m) => n + (m.endMs - m.startMs), 0);
  const c: GameCheck[] = [];
  const add = (id: string, ok: boolean, detail: string) => c.push({ id, ok, detail });

  // real gameplay, and enough of it
  const allReal = ms.length > 0 && ms.every((m) => m.source === "real_capture");
  add("real_gameplay", allReal && liveMs / total >= 0.85 && liveMs >= 6000, `${Math.round((liveMs / total) * 100)}% of the footage is real gameplay (${(liveMs / 1000).toFixed(1)}s), at least 85% and 6s; ${allReal ? "every moment is real capture" : "a moment is not real capture"}`);
  add("menu_footage", deadMomentMs / total <= 0.04, `${Math.round((deadMomentMs / total) * 100)}% menu, settings or instruction footage, at most 4%`);

  // continuity: few, long, whole stretches, each with an action and a visible result
  const spanMoments = (s: Span, k: number) => {
    const from = i.spans.slice(0, k).reduce((n, x) => n + (x.toMs - x.fromMs), 0);
    return ms.filter((m) => m.startMs >= from - 5 && m.endMs <= from + (s.toMs - s.fromMs) + 5);
  };
  const minSpan = Math.min(shape.minMs, 3500);
  const whole = i.spans.every((s, k) => {
    const inside = spanMoments(s, k);
    return inside.some((m) => m.kind === "input") && inside.some((m) => RESULT_KINDS.includes(m.kind)) && s.toMs - s.fromMs >= minSpan;
  });
  const oneLevel = i.spans.every((s, k) => new Set(spanMoments(s, k).filter(live).map((m) => m.level)).size <= 1);
  add("continuity", i.spans.length > 0 && i.spans.length <= shape.spans && whole && oneLevel, `${i.spans.length} continuous stretch${i.spans.length === 1 ? "" : "es"} (at most ${shape.spans}), each inside one level with an action and its result, none under ${(minSpan / 1000).toFixed(1)}s`);

  // the opening and the pace
  const lead = ms.filter((m) => m.startMs < 3000 && live(m));
  const firstAction = ms.find(live);
  const leadIntensity = lead.length ? lead.reduce((n, m) => n + m.intensity, 0) / lead.length : 0;
  add("gameplay_first_seconds", lead.some((m) => m.kind === "input") && leadIntensity >= 0.5 && Boolean(firstAction) && (firstAction as GameMoment).startMs <= spec.firstActionMaxMs, `real action at ${firstAction?.startMs ?? "never"} ms (limit ${spec.firstActionMaxMs}), opening intensity ${leadIntensity.toFixed(2)} (at least 0.5)`);
  let deadMoment = 0;
  for (const m of ms) if (DEAD_KINDS.includes(m.kind)) deadMoment = Math.max(deadMoment, m.endMs - m.startMs);
  let gap = 0;
  let cursor = 0;
  for (const r of liveRuns) {
    gap = Math.max(gap, r[0] - cursor);
    cursor = Math.max(cursor, r[1]);
  }
  gap = Math.max(gap, i.gameplayEndMs - cursor);
  add("no_dead_periods", deadMoment <= 1200 && gap <= BRIDGE, `longest menu or idle moment ${(deadMoment / 1000).toFixed(1)}s (at most 1.2s), longest stretch with no action at all ${(gap / 1000).toFixed(1)}s (at most ${BRIDGE / 1000}s)`);

  // the payoff
  const tail = ms.filter((m) => m.endMs > i.gameplayEndMs * 0.6);
  const lastLive = [...ms].reverse().find(live);
  add("payoff_present", tail.some((m) => ["win", "reward", "unlock", "close_call", "animation", "score"].includes(m.kind)) && Boolean(lastLive) && RESULT_KINDS.includes((lastLive as GameMoment).kind), `the closing stretch ${tail.some((m) => RESULT_KINDS.includes(m.kind)) ? "has" : "has no"} a visible result, and the footage ${lastLive && RESULT_KINDS.includes(lastLive.kind) ? "ends on" : "does not end on"} it`);

  // not a repeat of anything the game already has
  const clipsWith = [...i.prior, i.clip];
  const repeats = gameRepeats(clipsWith).filter((r) => r.b === clipsWith.length - 1 || r.a === clipsWith.length - 1);
  const footageRepeat = (i.clip.footage ?? []).some((f) => i.prior.some((p) => (p.footage ?? []).some((g) => g.sessionId === f.sessionId && g.level === f.level && Math.max(0, Math.min(f.toMs, g.toMs) - Math.max(f.fromMs, g.fromMs)) / Math.max(1, f.toMs - f.fromMs) > 0.25)));
  add("fresh_footage", !repeats.length && !footageRepeat, repeats.length ? `repeats an earlier video (overlap ${repeats.map((r) => r.overlap).join(", ")})` : footageRepeat ? "cuts footage another video already used" : "different footage from every earlier video");
  const levels = [...new Set(ms.filter(live).map((m) => m.level))];
  const overused = levels.filter((l) => (i.levelUses.get(l) ?? 0) >= 2 || ((i.levelUses.get(l) ?? 0) >= 1 && i.unusedLevels > 0));
  add("level_not_overused", overused.length === 0, overused.length ? `level ${overused.join(", ")} was already used by an earlier video while ${i.unusedLevels} unused level${i.unusedLevels === 1 ? "" : "s"} exist` : "no level is shown again without a reason");

  // the picture itself: orientation, nothing cropped
  const srcPortrait = i.source ? i.source.h >= i.source.w : null;
  const canvasPortrait = i.canvas.h >= i.canvas.w;
  const want = i.profile.orientation === "adaptive" ? null : i.profile.orientation === "portrait";
  const fits = i.drawn ? i.drawn.w <= i.canvas.w + 1 && i.drawn.h <= i.canvas.h + 1 : false;
  add("orientation_and_framing", fits && srcPortrait === canvasPortrait && (want === null || want === canvasPortrait), `${canvasPortrait ? "portrait" : "landscape"} video from ${srcPortrait === null ? "unknown" : srcPortrait ? "portrait" : "landscape"} footage${want === null ? "" : `, the game is ${i.profile.orientation}`}; the gameplay is drawn ${i.drawn ? `${i.drawn.w}x${i.drawn.h}` : "at an unknown size"} in ${i.canvas.w}x${i.canvas.h}${fits ? ", fully inside the frame" : ", NOT fully inside the frame"}`);

  // what is said
  if (i.narrated) {
    const spoken = i.lines.map((l) => l.text);
    const lang = languageChecks(spoken, i.profile.energy);
    for (const l of lang) add(l.id, l.ok, l.detail);
    const matches = i.lines.filter((l) => l.slot !== "close").map((l) => ms.some((m) => l.anchor.includes(m.kind) && m.endMs > l.startMs - 1200 && m.startMs < l.endMs + 600));
    add("narration_matches_gameplay", matches.length > 0 && matches.every(Boolean), `${matches.filter(Boolean).length} of ${matches.length} spoken lines are spoken while what they describe is on screen`);
    const keys = new Set([...content(i.profile.objective), ...content(i.profile.controls), ...i.profile.mechanics.flatMap((m) => [...content(m)])]);
    const explains = i.lines.filter((l) => l.slot === "explain" || l.slot === "hook" || l.slot === "payoff");
    const hit = explains.some((l) => [...content(l.text)].filter((w) => keys.has(w)).length >= 2);
    add("objective_understandable", hit || i.captions.some((t) => [...content(t)].filter((w) => keys.has(w)).length >= 2), hit ? "the narration says what the player is doing and why" : "nothing said or shown tells a stranger what the player is trying to do");
    const teach = i.lines.filter((l) => l.slot === "explain").length;
    add("sells_rather_than_teaches", teach <= Math.max(2, Math.ceil(i.lines.length / 2)) && i.lines[0]?.slot === "hook", `${teach} explaining line${teach === 1 ? "" : "s"} of ${i.lines.length}, and it ${i.lines[0]?.slot === "hook" ? "opens with a hook" : "does not open with a hook"}`);
  } else {
    const keys = new Set([...content(i.profile.objective), ...i.profile.mechanics.flatMap((m) => [...content(m)])]);
    add("objective_understandable", i.captions.some((t) => [...content(t)].filter((w) => keys.has(w)).length >= 1), "the captions say what the player is doing");
  }

  // the voice and the mix
  if (i.narrated && !i.planOnly) {
    if (i.voice) {
      const v = voiceEnergyCheck(i.voice, i.profile.energy);
      add("voice_energy", v.ok, v.detail);
    } else add("voice_energy", false, "the voice was not measured");
    add("game_audio_balance", i.voiceOverBedDb !== null && i.voiceOverBedDb >= 5, i.voiceOverBedDb === null ? "the balance between voice and game audio was not measured" : `the voice is ${i.voiceOverBedDb.toFixed(1)} dB over the game audio and music under it, at least 5`);
  }

  // a reason to want to play
  const results = ms.filter((m) => RESULT_KINDS.includes(m.kind)).length;
  const mean = ms.length ? ms.reduce((n, m) => n + m.intensity, 0) / ms.length : 0;
  const hooked = !i.narrated || i.lines.some((l) => l.slot === "hook" && l.startMs <= 3500);
  add("reason_to_play", results >= 2 && mean >= 0.5 && hooked, `${results} visible results, average intensity ${mean.toFixed(2)} (at least 0.5)${i.narrated ? hooked ? ", a spoken hook in the first 3.5s" : ", no spoken hook in the first 3.5s" : ""}`);
  return c;
}

/** What to redo for a failed check: write different words, choose different footage (or capture more), or render again with the fix. */
export const SCRIPT_CHECK_IDS = new Set(["not_saas_voice", "not_a_tutorial", "has_energy", "narration_matches_gameplay", "objective_understandable", "sells_rather_than_teaches", "reason_to_play"]);
export const FOOTAGE_CHECK_IDS = new Set(["real_gameplay", "menu_footage", "continuity", "gameplay_first_seconds", "no_dead_periods", "payoff_present", "fresh_footage", "level_not_overused"]);
export const RENDER_CHECK_IDS = new Set(["orientation_and_framing", "voice_energy", "game_audio_balance", "no_black_screen", "no_blank_screen", "narration_audible"]);
export function failureKind(checks: GameCheck[]): "footage" | "script" | "render" | null {
  const bad = checks.filter((x) => !x.ok).map((x) => x.id);
  if (!bad.length) return null;
  if (bad.some((b) => FOOTAGE_CHECK_IDS.has(b))) return "footage";
  if (bad.some((b) => SCRIPT_CHECK_IDS.has(b))) return "script";
  return "render";
}

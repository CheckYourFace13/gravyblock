/**
 * The GAME VIDEO MODE (owner directive 2026-11-10), kept permanently apart from the SaaS and software storytelling used for every other product. The rule is SELL FUN FIRST:
 * real gameplay at once, quick movement, challenge, cause and effect, progression, variety, rewards, personality, close calls and the "one more try" pull. A game clip never
 * opens on a menu, settings, a feature list, a static screen, instructions or long narration, and every frame of gameplay is REAL capture: nothing here fabricates gameplay.
 * This file holds the pure decisions: the formats, what a captured moment is worth, the fun-first QA and the distinctness rule between a game's videos.
 */
export type GameFormat = "gameplay_hook" | "challenge" | "progression" | "reward_unlock" | "mechanic_spotlight" | "variety_montage" | "short_form";

export type GameMomentKind = "input" | "stage_transition" | "win" | "loss" | "score" | "unlock" | "reward" | "animation" | "close_call" | "restart" | "menu" | "settings" | "instructions" | "static" | "idle";

export type GameFormatSpec = { label: string; maxSeconds: number; vertical: boolean; firstActionMaxMs: number; needs: GameMomentKind[]; minLevels: number; minMechanics: number; promise: string };
export const GAME_FORMATS: Record<GameFormat, GameFormatSpec> = {
  gameplay_hook: { label: "Gameplay hook", maxSeconds: 20, vertical: true, firstActionMaxMs: 800, needs: ["input", "reward"], minLevels: 1, minMechanics: 1, promise: "immediate, satisfying gameplay" },
  challenge: { label: "Challenge", maxSeconds: 25, vertical: true, firstActionMaxMs: 1200, needs: ["input", "close_call"], minLevels: 1, minMechanics: 1, promise: "can you beat this?" },
  progression: { label: "Progression", maxSeconds: 35, vertical: false, firstActionMaxMs: 1500, needs: ["input", "stage_transition", "score"], minLevels: 3, minMechanics: 1, promise: "easy, then harder, then surprising" },
  reward_unlock: { label: "Reward and unlock", maxSeconds: 25, vertical: true, firstActionMaxMs: 1500, needs: ["input", "unlock", "reward"], minLevels: 1, minMechanics: 1, promise: "the payoff, collection or celebration" },
  mechanic_spotlight: { label: "Mechanic spotlight", maxSeconds: 25, vertical: true, firstActionMaxMs: 1000, needs: ["input", "animation"], minLevels: 1, minMechanics: 1, promise: "one genuinely fun mechanic" },
  variety_montage: { label: "Variety montage", maxSeconds: 35, vertical: false, firstActionMaxMs: 1200, needs: ["input", "stage_transition"], minLevels: 3, minMechanics: 2, promise: "different stages, characters and problems" },
  short_form: { label: "Short-form", maxSeconds: 15, vertical: true, firstActionMaxMs: 500, needs: ["input"], minLevels: 1, minMechanics: 1, promise: "a very fast vertical clip for discovery" },
};

export type GameMoment = { startMs: number; endMs: number; kind: GameMomentKind; level: string; mechanic?: string; /** 0 to 1: how striking the moment is on screen */ intensity: number; source: "real_capture" | "synthetic" };

/** Moments that are never worth showing. */
const DEAD: GameMomentKind[] = ["menu", "settings", "instructions", "static", "idle"];
/** What a moment is worth when choosing highlights: payoffs and tension first, plain input last. */
const WORTH: Record<GameMomentKind, number> = { close_call: 1, unlock: 0.95, reward: 0.9, win: 0.85, stage_transition: 0.8, animation: 0.7, loss: 0.6, score: 0.55, restart: 0.45, input: 0.4, menu: 0, settings: 0, instructions: 0, static: 0, idle: 0 };

export const momentScore = (m: GameMoment) => (DEAD.includes(m.kind) || m.source !== "real_capture" ? 0 : +(WORTH[m.kind] * (0.5 + 0.5 * m.intensity)).toFixed(3));

/** Pure: the best moments that fit the format's length, in time order. Dead time and non-real capture are never chosen. */
export function pickHighlights(moments: GameMoment[], format: GameFormat): GameMoment[] {
  const budget = GAME_FORMATS[format].maxSeconds * 1000;
  const ranked = [...moments].filter((m) => momentScore(m) > 0).sort((a, b) => momentScore(b) - momentScore(a));
  const chosen: GameMoment[] = [];
  let used = 0;
  for (const m of ranked) {
    const len = m.endMs - m.startMs;
    if (len <= 0 || used + len > budget) continue;
    chosen.push(m);
    used += len;
  }
  return chosen.sort((a, b) => a.startMs - b.startMs);
}

export type AudioMode = "gameplay_audio_music_captions" | "short_energetic_narration" | "reaction_copy" | "challenge_text" | "minimal_voice";
/** Narration is a choice, not a default: the standard product narrator is never forced onto a game clip. */
export const GAME_AUDIO_MODES: Record<GameFormat, AudioMode[]> = {
  gameplay_hook: ["gameplay_audio_music_captions", "minimal_voice"],
  challenge: ["challenge_text", "gameplay_audio_music_captions", "short_energetic_narration"],
  progression: ["gameplay_audio_music_captions", "short_energetic_narration", "reaction_copy"],
  reward_unlock: ["reaction_copy", "gameplay_audio_music_captions", "minimal_voice"],
  mechanic_spotlight: ["short_energetic_narration", "gameplay_audio_music_captions", "minimal_voice"],
  variety_montage: ["gameplay_audio_music_captions", "reaction_copy"],
  short_form: ["gameplay_audio_music_captions", "challenge_text"],
};
export const MAX_NARRATION_WORDS: Record<AudioMode, number> = { short_energetic_narration: 40, reaction_copy: 25, minimal_voice: 14, gameplay_audio_music_captions: 0, challenge_text: 0 };

export type GameClip = {
  game: string;
  format: GameFormat;
  moments: GameMoment[];
  durationMs: number;
  audio: AudioMode;
  narrationWords: number;
  vertical: boolean;
};
export type GameCheck = { id: string; ok: boolean; detail: string };

/** Pure: the fun-first QA. A clip that fails any check is not sent for review. */
export function gameFunChecks(c: GameClip): GameCheck[] {
  const spec = GAME_FORMATS[c.format];
  const real = c.moments.length > 0 && c.moments.every((m) => m.source === "real_capture");
  const ordered = [...c.moments].sort((a, b) => a.startMs - b.startMs);
  const firstAction = ordered.find((m) => !DEAD.includes(m.kind));
  const lead = ordered.filter((m) => m.startMs < 3000);
  const deadMs = c.moments.filter((m) => DEAD.includes(m.kind)).reduce((n, m) => n + (m.endMs - m.startMs), 0);
  const live = c.moments.filter((m) => !DEAD.includes(m.kind));
  const levels = new Set(live.map((m) => m.level));
  const mechanics = new Set(c.moments.map((m) => m.mechanic).filter(Boolean));
  const inputs = c.moments.filter((m) => m.kind === "input").length;
  const results = c.moments.filter((m) => ["win", "score", "reward", "unlock", "animation", "close_call"].includes(m.kind)).length;
  const mean = c.moments.length ? c.moments.reduce((n, m) => n + m.intensity, 0) / c.moments.length : 0;
  return [
    { id: "real_gameplay", ok: real, detail: real ? "every moment is real capture" : "a moment is synthetic or there is no capture: gameplay is never fabricated" },
    { id: "gameplay_first", ok: lead.length > 0 && lead.every((m) => !DEAD.includes(m.kind)), detail: lead.some((m) => DEAD.includes(m.kind)) ? "the clip opens on a menu, settings, instructions or a static screen" : "the first three seconds are gameplay" },
    { id: "first_action", ok: Boolean(firstAction) && (firstAction as GameMoment).startMs <= spec.firstActionMaxMs, detail: firstAction ? `first real action at ${firstAction.startMs} ms, limit ${spec.firstActionMaxMs} ms` : "no action at all" },
    { id: "no_dead_time", ok: c.durationMs > 0 && deadMs / c.durationMs <= 0.1, detail: `${Math.round((deadMs / Math.max(1, c.durationMs)) * 100)}% dead time, at most 10%` },
    { id: "cause_and_effect", ok: inputs >= 2 && results >= 1, detail: `${inputs} inputs, ${results} visible results` },
    { id: "required_moments", ok: spec.needs.every((k) => c.moments.some((m) => m.kind === k)), detail: `${spec.label} needs ${spec.needs.join(", ")}` },
    { id: "variety", ok: levels.size >= spec.minLevels && mechanics.size >= spec.minMechanics, detail: `${levels.size} levels (need ${spec.minLevels}), ${mechanics.size} mechanics (need ${spec.minMechanics})` },
    { id: "energy", ok: mean >= 0.45, detail: `average intensity ${mean.toFixed(2)}, at least 0.45` },
    { id: "length", ok: c.durationMs <= spec.maxSeconds * 1000, detail: `${Math.round(c.durationMs / 1000)}s, at most ${spec.maxSeconds}s` },
    { id: "audio_choice", ok: GAME_AUDIO_MODES[c.format].includes(c.audio) && c.narrationWords <= MAX_NARRATION_WORDS[c.audio], detail: `${c.audio}, ${c.narrationWords} narrated words` },
    { id: "format_shape", ok: c.vertical === spec.vertical, detail: spec.vertical ? "this format is vertical" : "this format is landscape" },
  ];
}
export const gameClipPasses = (c: GameClip) => gameFunChecks(c).every((x) => x.ok);

const signature = (c: GameClip) => new Set(c.moments.filter((m) => !DEAD.includes(m.kind)).flatMap((m) => [`L:${m.level}`, ...(m.mechanic ? [`M:${m.mechanic}`] : [])]));
/** Pure: two videos of one game must not be the same format or show essentially the same levels and mechanics. Returns the pairs that repeat. */
export function gameRepeats(clips: GameClip[], limit = 0.6): Array<{ a: number; b: number; overlap: number }> {
  const out: Array<{ a: number; b: number; overlap: number }> = [];
  for (let i = 0; i < clips.length; i++)
    for (let j = i + 1; j < clips.length; j++) {
      const A = signature(clips[i]);
      const B = signature(clips[j]);
      const inter = [...A].filter((x) => B.has(x)).length;
      const overlap = +(inter / (new Set([...A, ...B]).size || 1)).toFixed(2);
      if (clips[i].format === clips[j].format || overlap > limit) out.push({ a: i, b: j, overlap });
    }
  return out;
}

/** The game video types a library should cover, in the order they are made. */
export const GAME_LIBRARY_ORDER: GameFormat[] = ["gameplay_hook", "challenge", "mechanic_spotlight", "progression", "reward_unlock", "variety_montage", "short_form"];

/** The game engine never uses the product-storytelling stage or narrator template. */
export const isGameProduct = (p: { kind?: string }) => p.kind === "game";

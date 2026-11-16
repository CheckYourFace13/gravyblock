/**
 * CONTINUITY: how a game video is cut. A viewer who has never seen the game must be able to follow what is happening, so a video is built from a few CONTINUOUS stretches of real gameplay
 * (a level beginning, the player acting, the result, the challenge, the payoff), never from many separate "best moments" stitched together. Each stretch stays inside one level, is played
 * straight through, and ends on its payoff. A format decides how many stretches there are (one for most, three for progression and variety) and how long each is. Pure functions only.
 */
import { GAME_FORMATS, type GameFormat, type GameMoment, type GameMomentKind } from "./engine";

export const DEAD_KINDS: GameMomentKind[] = ["menu", "settings", "instructions", "static", "idle"];
export const RESULT_KINDS: GameMomentKind[] = ["win", "score", "reward", "unlock", "animation", "close_call"];
const PAYOFF_KINDS: GameMomentKind[] = ["win", "reward", "unlock"];

export type Span = { fromMs: number; toMs: number; level: string; sessionId?: string };
export type Footage = { sessionId: string; level: string; fromMs: number; toMs: number };

export type LevelSeg = {
  level: string;
  fromMs: number;
  toMs: number;
  /** where the payoff of the level lands (the end of its win, reward or unlock; failing that, its last visible result) */
  payoffMs: number | null;
  inputs: number;
  results: number;
  intensity: number;
  hasClose: boolean;
  hasWin: boolean;
  hasLoss: boolean;
  hasReward: boolean;
  hasCharacter: boolean;
  mechanics: string[];
  /** the mechanic most of the player's inputs use, and how many */
  topMechanic: { name: string; inputs: number } | null;
};

const live = (m: GameMoment) => !DEAD_KINDS.includes(m.kind) && m.source === "real_capture";
export const levelNo = (l: string) => (l === "Ldaily" ? 1000 : Number(l.replace(/\D/g, "")) || 0);

/** Pure: one segment per level, from its first live moment to its last. A level with no live moment has none. */
export function levelSegments(moments: GameMoment[]): LevelSeg[] {
  const by = new Map<string, GameMoment[]>();
  for (const m of moments.filter(live)) by.set(m.level, [...(by.get(m.level) ?? []), m]);
  const out: LevelSeg[] = [];
  for (const [level, ms] of by) {
    const sorted = [...ms].sort((a, b) => a.startMs - b.startMs);
    const results = sorted.filter((m) => RESULT_KINDS.includes(m.kind));
    const payoff = [...sorted].reverse().find((m) => PAYOFF_KINDS.includes(m.kind)) ?? [...results].reverse()[0] ?? null;
    const perMech = new Map<string, number>();
    for (const m of sorted.filter((x) => x.kind === "input" && x.mechanic)) perMech.set(m.mechanic as string, (perMech.get(m.mechanic as string) ?? 0) + 1);
    const top = [...perMech.entries()].sort((a, b) => b[1] - a[1])[0];
    out.push({
      level,
      fromMs: sorted[0].startMs,
      toMs: Math.max(...sorted.map((m) => m.endMs)),
      payoffMs: payoff ? payoff.endMs : null,
      inputs: sorted.filter((m) => m.kind === "input").length,
      results: results.length,
      intensity: sorted.reduce((n, m) => n + m.intensity, 0) / sorted.length,
      hasClose: sorted.some((m) => m.kind === "close_call"),
      hasWin: sorted.some((m) => m.kind === "win"),
      hasLoss: sorted.some((m) => m.kind === "loss"),
      hasReward: sorted.some((m) => m.kind === "reward" || m.kind === "unlock"),
      hasCharacter: sorted.some((m) => Boolean(m.character)),
      mechanics: [...new Set(sorted.map((m) => m.mechanic).filter((x): x is string => Boolean(x)))],
      topMechanic: top ? { name: top[0], inputs: top[1] } : null,
    });
  }
  return out.sort((a, b) => a.fromMs - b.fromMs);
}

export type Shape = { spans: number; minMs: number; maxMs: number; ok: (s: LevelSeg) => boolean; prefer?: (s: LevelSeg) => number; levels: "any" | "ascending" | "distinct" };
const someResult = (s: LevelSeg) => s.results >= 1 && s.inputs >= 2;
/** How each format is cut: stretches, their length and what a level must hold to be used. */
export const SHAPES: Record<GameFormat, Shape> = {
  gameplay_hook: { spans: 1, minMs: 7000, maxMs: 15000, ok: someResult, levels: "any" },
  how_you_play: { spans: 1, minMs: 10000, maxMs: 19000, ok: (s) => s.inputs >= 3 && s.results >= 1, levels: "any" },
  challenge: { spans: 1, minMs: 8000, maxMs: 17000, ok: (s) => someResult(s) && (s.hasClose || s.results >= 2), prefer: (s) => (s.hasClose ? 1 : 0), levels: "any" },
  progression: { spans: 3, minMs: 5000, maxMs: 9000, ok: someResult, levels: "ascending" },
  reward_unlock: { spans: 1, minMs: 7000, maxMs: 14000, ok: (s) => someResult(s) && s.hasReward, levels: "any" },
  mechanic_spotlight: { spans: 1, minMs: 9000, maxMs: 16000, ok: (s) => someResult(s) && (s.topMechanic?.inputs ?? 0) >= 3, prefer: (s) => Math.min(1, (s.topMechanic?.inputs ?? 0) / 8), levels: "any" },
  character_collection: { spans: 1, minMs: 7000, maxMs: 14000, ok: (s) => someResult(s) && s.hasReward && s.hasCharacter, levels: "any" },
  variety_montage: { spans: 3, minMs: 5000, maxMs: 8500, ok: someResult, levels: "distinct" },
  one_more_try: { spans: 1, minMs: 10000, maxMs: 22000, ok: (s) => s.hasLoss && s.hasWin, levels: "any" },
  short_form: { spans: 1, minMs: 5000, maxMs: 9500, ok: someResult, prefer: (s) => s.intensity, levels: "any" },
};

/** Pure: why a format cannot be made from this footage (null when it can). A format is only chosen when the game really supports it. */
export function formatUnsupported(format: GameFormat, moments: GameMoment[], opts: { hasCharacters?: boolean } = {}): string | null {
  const shape = SHAPES[format];
  const segs = levelSegments(moments).filter((s) => shape.ok(s) && s.toMs - s.fromMs >= shape.minMs);
  if (format === "character_collection" && !opts.hasCharacters) return "the game has no characters or collectibles set up";
  if (segs.length < shape.spans) return `the captured gameplay has ${segs.length} level${segs.length === 1 ? "" : "s"} that can make this format, it needs ${shape.spans}`;
  if (shape.levels === "ascending" && !consecutiveRuns(segs, shape.spans).length) return `it needs ${shape.spans} levels in a row`;
  return null;
}

const consecutiveRuns = (segs: LevelSeg[], n: number): LevelSeg[][] => {
  const sorted = [...segs].sort((a, b) => levelNo(a.level) - levelNo(b.level));
  const out: LevelSeg[][] = [];
  for (let i = 0; i + n <= sorted.length; i++) {
    const run = sorted.slice(i, i + n);
    if (run.every((s, k) => k === 0 || (levelNo(s.level) > levelNo(run[k - 1].level) && levelNo(s.level) < 1000))) out.push(run);
  }
  return out;
};

/** Pure: the stretch of a level to play: it ends on the level's payoff and is as long as the format allows, never starting on dead time. */
export function windowFor(seg: LevelSeg, moments: GameMoment[], shape: Pick<Shape, "minMs" | "maxMs">, o: { fromLoss?: boolean } = {}): { fromMs: number; toMs: number } | null {
  const lv = moments.filter((m) => m.level === seg.level && live(m)).sort((a, b) => a.startMs - b.startMs);
  let end = Math.min(seg.toMs, (seg.payoffMs ?? seg.toMs) + 700);
  let start = Math.max(seg.fromMs, end - shape.maxMs);
  if (o.fromLoss) {
    const loss = lv.find((m) => m.kind === "loss");
    const win = [...lv].reverse().find((m) => m.kind === "win");
    if (!loss || !win || win.endMs <= loss.startMs) return null;
    end = Math.min(seg.toMs, win.endMs + 700);
    start = Math.max(seg.fromMs, Math.min(loss.startMs - 5000, end - shape.maxMs));
    if (end - start > shape.maxMs) start = Math.max(seg.fromMs, end - shape.maxMs);
    if (start > loss.startMs - 1500) return null;
  }
  const first = lv.find((m) => m.endMs > start);
  if (first && first.startMs > start) start = first.startMs;
  if (end - start < shape.minMs) return null;
  return { fromMs: Math.round(start), toMs: Math.round(end) };
}

const overlapShare = (a: { fromMs: number; toMs: number }, b: { fromMs: number; toMs: number }) => Math.max(0, Math.min(a.toMs, b.toMs) - Math.max(a.fromMs, b.fromMs)) / Math.max(1, a.toMs - a.fromMs);

export type SequencePick = { ok: true; spans: Span[]; levels: string[]; reused: string[] } | { ok: false; reason: string; needsMore: boolean };

/**
 * Pure: the continuous stretches for one video. Levels earlier videos used are skipped while any other level can make the format; footage another video already cut from the same session is
 * never cut again. `skip` lets a retry avoid levels that already failed QA. `variant` rotates between equally good choices so a re-edit differs from the last attempt.
 */
export function pickSequences(moments: GameMoment[], format: GameFormat, o: { sessionId?: string; usedLevels?: ReadonlySet<string>; usedFootage?: Footage[]; skip?: ReadonlySet<string>; variant?: number; maxMsOverride?: number; budgetMs?: number; hasCharacters?: boolean } = {}): SequencePick {
  const shape = { ...SHAPES[format], maxMs: Math.min(SHAPES[format].maxMs, o.maxMsOverride ?? SHAPES[format].maxMs) };
  if (format === "character_collection" && !o.hasCharacters) return { ok: false, reason: "the game has no characters or collectibles set up", needsMore: false };
  const used = o.usedLevels ?? new Set<string>();
  const fresh = (w: { fromMs: number; toMs: number }, level: string) => !(o.usedFootage ?? []).some((f) => f.sessionId === o.sessionId && f.level === level && overlapShare(w, f) > 0.25);
  const cands: Array<{ seg: LevelSeg; win: { fromMs: number; toMs: number }; score: number }> = [];
  for (const seg of levelSegments(moments)) {
    if (o.skip?.has(seg.level) || !shape.ok(seg)) continue;
    const win = windowFor(seg, moments, shape, { fromLoss: format === "one_more_try" });
    if (!win || !fresh(win, seg.level)) continue;
    const score = seg.intensity * 0.5 + (Math.min(seg.results, 4) / 4) * 0.3 + (shape.prefer ? shape.prefer(seg) * 0.2 : 0) - (used.has(seg.level) ? 1 : 0);
    cands.push({ seg, win, score });
  }
  if (cands.length < shape.spans) return { ok: false, reason: `not enough distinct real gameplay for ${GAME_FORMATS[format].label}: ${cands.length} usable level${cands.length === 1 ? "" : "s"}, ${shape.spans} needed`, needsMore: true };
  const v = o.variant ?? 0;
  let chosen: typeof cands;
  if (shape.levels === "ascending") {
    const runs = consecutiveRuns(cands.map((c) => c.seg), shape.spans).map((run) => run.map((s) => cands.find((c) => c.seg === s) as (typeof cands)[number]));
    if (!runs.length) return { ok: false, reason: `${GAME_FORMATS[format].label} needs ${shape.spans} levels in a row`, needsMore: true };
    runs.sort((a, b) => b.reduce((n, c) => n + c.score, 0) - a.reduce((n, c) => n + c.score, 0));
    chosen = runs[v % runs.length];
  } else {
    const ranked = [...cands].sort((a, b) => b.score - a.score || levelNo(a.seg.level) - levelNo(b.seg.level));
    const start = shape.spans === 1 ? v % ranked.length : 0;
    chosen = ranked.slice(start, start + shape.spans);
    if (chosen.length < shape.spans) chosen = ranked.slice(0, shape.spans);
    chosen.sort((a, b) => levelNo(a.seg.level) - levelNo(b.seg.level));
  }
  // a multi-stretch format shares the length between its stretches so the whole stays inside the format
  const budget = o.budgetMs ?? (GAME_FORMATS[format].maxSeconds - 3) * 1000;
  const per = Math.floor(budget / chosen.length);
  const spans: Span[] = chosen.map((c) => {
    const len = Math.min(c.win.toMs - c.win.fromMs, per);
    return { fromMs: c.win.toMs - len, toMs: c.win.toMs, level: c.seg.level, sessionId: o.sessionId };
  });
  // trimming from the front must still start on live gameplay
  for (const s of spans) {
    const first = moments.filter((m) => m.level === s.level && live(m) && m.endMs > s.fromMs).sort((a, b) => a.startMs - b.startMs)[0];
    if (first && first.startMs > s.fromMs) s.fromMs = first.startMs;
  }
  if (spans.some((s) => s.toMs - s.fromMs < Math.min(shape.minMs, 3500))) return { ok: false, reason: `the stretches left are too short to follow for ${GAME_FORMATS[format].label}`, needsMore: true };
  return { ok: true, spans, levels: spans.map((s) => s.level), reused: spans.filter((s) => used.has(s.level)).map((s) => s.level) };
}

/** Pure: the clip's own moments, shifted to clip time, for the spans cut (each stretch played straight, one after the other). */
export function clipMomentsOf(all: GameMoment[], spans: Span[]): { moments: GameMoment[]; durationMs: number; cuts: number[] } {
  let offset = 0;
  const moments: GameMoment[] = [];
  const cuts: number[] = [];
  spans.forEach((s, k) => {
    for (const m of all.filter((x) => x.endMs > s.fromMs && x.startMs < s.toMs)) {
      const a = Math.max(m.startMs, s.fromMs);
      const b = Math.min(m.endMs, s.toMs);
      if (b > a) moments.push({ ...m, startMs: offset + (a - s.fromMs), endMs: offset + (b - s.fromMs) });
    }
    offset += s.toMs - s.fromMs;
    if (k < spans.length - 1) cuts.push(offset);
  });
  return { moments: moments.sort((a, b) => a.startMs - b.startMs), durationMs: offset, cuts };
}

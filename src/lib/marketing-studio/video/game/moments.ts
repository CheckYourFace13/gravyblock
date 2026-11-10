/**
 * Interesting-moment detection for a recorded REAL gameplay session. A session is what scripts/ops/marketing-sz-capture.mts leaves behind: a screencast of the real game played by scripted
 * touch input (frames with timestamps) and a HUD text log sampled after each action. This turns that log into GameMoments (inputs, score changes, stage transitions, wins, losses,
 * restarts, unlocks, rewards, close calls, menus and idle gaps) that the fun-first engine can choose from. Nothing here makes up footage: every moment points at real captured time.
 */
import type { GameMoment, GameMomentKind } from "./engine";

export type SessionFrame = { t: number; f: string };
export type SessionLog = { t: number; tag: string; txt: string };

const BURST = /(NICE|GOOD|BIG|AWESOME) ?CUT|x[2-9]\b|COMBO|CLUTCH/i;
const fillOf = (txt: string) => {
  const m = /(\d+)% \/ (\d+)%/.exec(txt);
  return m ? { fill: +m[1], goal: +m[2] } : null;
};
const levelOf = (tag: string, prev: string) => {
  const m = /^L?(?:evel)?(\d+)/i.exec(tag) ?? /^level(\d+)/i.exec(tag);
  return m ? `L${m[1]}` : prev;
};

/** Pure: moments of a session, in session seconds (0 is the first frame). */
export function detectMoments(frames: SessionFrame[], log: SessionLog[]): GameMoment[] {
  if (!frames.length || !log.length) return [];
  const t0 = frames[0].t;
  const rel = (t: number) => Math.max(0, t - t0);
  const frameTimes = frames.map((f) => rel(f.t));
  const density = (a: number, b: number) => {
    // frames per second inside the window: a moving game emits many screencast frames, an idle one very few
    const n = frameTimes.filter((x) => x >= a && x < b).length;
    return b > a ? n / (b - a) : 0;
  };
  const out: GameMoment[] = [];
  let prevEnd = 0;
  let prevFill: number | null = null;
  let level = "L1";
  const push = (kind: GameMomentKind, a: number, b: number, mech: string | undefined, base: number) => {
    if (b - a < 0.25) return;
    const fps = density(a, b);
    out.push({ startMs: Math.round(a * 1000), endMs: Math.round(b * 1000), kind, level, mechanic: mech, intensity: Math.min(1, Math.max(0.25, base * (0.55 + Math.min(fps, 50) / 110))), source: "real_capture" });
  };
  for (const s of log) {
    const end = rel(s.t);
    const start = Math.max(prevEnd, end - 4);
    if (end <= start) {
      prevEnd = Math.max(prevEnd, end);
      continue;
    }
    level = levelOf(s.tag, level);
    const f = fillOf(s.txt);
    if (/picker|home/i.test(s.tag)) push("menu", start, end, undefined, 0.3);
    else if (/^start$/i.test(s.tag)) push("menu", start, end, undefined, 0.3);
    else if (/board$/i.test(s.tag)) push("stage_transition", start, end, "stage", 0.8);
    else if (/cut\d+$/i.test(s.tag)) {
      push("input", start, end, "cut", 0.55);
      if (BURST.test(s.txt)) push("animation", Math.max(start, end - 1.2), end, "cut", 0.85);
      if (f && prevFill !== null && f.fill > prevFill) push("score", Math.max(start, end - 0.9), end, "fill", 0.6);
      if (f && f.goal - f.fill <= 6 && f.fill < f.goal) push("close_call", Math.max(start, end - 1.4), end, "fill", 1);
    } else if (/clear$/i.test(s.tag)) {
      push("win", start, end, "stage", 0.9);
      if (/UNLOCKED/i.test(s.txt)) push("unlock", start, end, "unlock", 1);
      if (/ZAPS|★/.test(s.txt)) push("reward", start, end, "reward", 0.95);
    } else if (/lost$/i.test(s.tag)) push("loss", start, end, "stage", 0.6);
    else if (/retry|restart/i.test(s.tag)) push("restart", start, end, "stage", 0.45);
    else if (/daily/i.test(s.tag)) push("stage_transition", start, end, "daily", 0.85);
    else push(density(start, end) < 4 ? "idle" : "animation", start, end, undefined, 0.5);
    if (f) prevFill = f.fill;
    prevEnd = end;
  }
  return out;
}

/** Pure: joins chosen moments that touch or nearly touch into continuous spans, so the clip is real footage played straight and not a jump cut every second. */
export function spansOf(moments: GameMoment[], gapMs = 500): Array<{ fromMs: number; toMs: number; moments: GameMoment[] }> {
  const sorted = [...moments].sort((a, b) => a.startMs - b.startMs);
  const spans: Array<{ fromMs: number; toMs: number; moments: GameMoment[] }> = [];
  for (const m of sorted) {
    const last = spans[spans.length - 1];
    if (last && m.startMs - last.toMs <= gapMs) {
      last.toMs = Math.max(last.toMs, m.endMs);
      last.moments.push(m);
    } else spans.push({ fromMs: m.startMs, toMs: m.endMs, moments: [m] });
  }
  return spans;
}

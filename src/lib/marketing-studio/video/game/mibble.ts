/**
 * Mibble Meadow gameplay sessions. The capture (scripts/ops/mibble-meadow-capture/mm_play.py) plays several real levels of the game's own project files in Godot movie mode: it READS each
 * board from the rendered frame, solves it with the game's published rules, and plays it with real taps, a swipe and double-taps, writing an event log tied to the rendered frame number.
 * This turns that log into the same moments the fun-first engine uses for every game (inputs, stage changes, wins, rewards, the final tense placement), and the frames into a session.
 * Every moment points at real captured time; nothing is fabricated.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { ffmpeg } from "../ffmpeg";
import type { GameMoment, GameMomentKind } from "./engine";
import type { SessionFrame } from "./moments";

export type MibbleEvent = { frame: number; kind: string; level?: number | string; size?: number; row?: number; col?: number; regions?: number; solutions?: number };

export const MIBBLE_FPS = 30;

/** Pure: the moments of a Mibble Meadow run, in session milliseconds. */
export function detectMibbleMoments(events: MibbleEvent[], totalFrames: number): GameMoment[] {
  const ms = (f: number) => Math.round((Math.max(0, f) / MIBBLE_FPS) * 1000);
  const out: GameMoment[] = [];
  let level = "L1";
  let size = 4;
  const push = (kind: GameMomentKind, a: number, b: number, mechanic: string | undefined, intensity: number) => {
    const from = Math.max(0, a);
    const to = Math.min(totalFrames, b);
    if (to - from < 4) return;
    out.push({ startMs: ms(from), endMs: ms(to), kind, level, mechanic, intensity, source: "real_capture" });
  };
  for (const e of events) {
    const f = e.frame;
    if (e.kind === "level_loaded") {
      level = `L${e.level}`;
      size = e.size ?? size;
      push("stage_transition", f - 25, f + 10, "stage", 0.8);
    } else if (e.kind === "daily_loaded") {
      level = "Ldaily";
      size = e.size ?? size;
      push("stage_transition", f - 25, f + 10, "daily", 0.85);
    } else if (e.kind === "marked_by_tap") push("input", f - 12, f, "mark", 0.55);
    else if (e.kind === "marked_by_swipe") push("input", f - 10, f, "mark", 0.65);
    else if (e.kind === "placed") {
      push("input", f - 2, f + 14, "place", 0.7);
      push("animation", f, f + 14, "place", 0.75);
      // every animal placed visibly moves the board toward solved: that progress is the score
      push("score", f, f + 14, "place", 0.6);
      // the last animal of a board is the tense one: the whole level hangs on it
      if (e.row === size - 1) push("close_call", f - 2, f + 14, "place", 1);
    } else if (e.kind === "level_complete") {
      push("win", f - 10, f + 40, "stage", 0.9);
      push("reward", f, f + 50, "reward", 0.95);
      push("unlock", f, f + 50, "unlock", 0.95);
    } else if (e.kind === "next_level_click") push("input", f - 2, f + 10, "stage", 0.6);
    else if (["home", "back_home", "animals_tab", "levels_tab", "home_tab"].includes(e.kind)) push("menu", f, f + 45, undefined, 0.3);
    else if (e.kind === "tip_dismissed") push("instructions", f - 20, f, undefined, 0.3);
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/**
 * Turns a finished capture run (30 fps PNG frames and events.json) into a gameplay session: JPEG frames with their real times, the real moments, and an empty HUD log.
 * The PNGs are deleted once converted (a run is several gigabytes of PNG).
 */
export async function convertMibbleRun(runDir: string, outDir: string, log: (m: string) => void = () => {}): Promise<{ frames: number; moments: number; levels: number }> {
  const events = JSON.parse(await fs.readFile(path.join(runDir, "events.json"), "utf8")) as MibbleEvent[];
  await fs.mkdir(outDir, { recursive: true });
  const r = await ffmpeg(["-framerate", String(MIBBLE_FPS), "-pattern_type", "glob", "-i", path.join(runDir, "mv", "f*.png"), "-q:v", "3", path.join(outDir, "f%05d.jpg")], 25 * 60_000);
  if (r.code !== 0) throw new Error(`could not convert the Mibble Meadow frames (exit ${r.code ?? "none"}): ${(r.stderr ?? "").slice(-300)}`);
  const names = (await fs.readdir(outDir)).filter((n) => /^f\d{5}\.jpg$/.test(n)).sort();
  const frames: SessionFrame[] = names.map((n, i) => ({ t: i / MIBBLE_FPS, f: path.join(outDir, n) }));
  const moments = detectMibbleMoments(events, frames.length);
  await fs.writeFile(path.join(outDir, "frames.json"), JSON.stringify(frames));
  await fs.writeFile(path.join(outDir, "log.json"), JSON.stringify([]));
  await fs.writeFile(path.join(outDir, "moments.json"), JSON.stringify(moments));
  await fs.rm(path.join(runDir, "mv"), { recursive: true, force: true });
  const levels = new Set(events.filter((e) => e.kind === "level_complete").map((e) => e.level)).size;
  log(`Mibble Meadow: ${frames.length} real frames, ${levels} levels cleared, ${moments.length} moments`);
  return { frames: frames.length, moments: moments.length, levels };
}

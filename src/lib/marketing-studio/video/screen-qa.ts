/**
 * HARD visual QA on the FINISHED video file (the one that is uploaded), for every product video: the product window must never be black, nearly black or blank for more than a very short
 * transition. It looks at what the viewer sees, not at the plan: a dark page, an empty browser area or a flat colour fails, however the timeline was built.
 */
import { spawn } from "node:child_process";
import { registerKiller } from "../active-work";
import { WIN } from "./demo/types";

export type ScreenFrame = { luma: number; stdev: number; darkShare: number };
export type ScreenVerdict = { ok: boolean; reasons: string[]; blackSec: number; mostlyDarkSec: number; blankSec: number; meanLuma: number };

const W = 48;
const H = 59;

/** Pure: the longest runs, in seconds, of black, mostly dark and blank frames. A run only counts after the short transition allowance. */
export function judgeScreen(frames: ScreenFrame[], fps: number, opts: { transitionSec?: number } = {}): ScreenVerdict {
  const run = (pred: (f: ScreenFrame) => boolean) => {
    let best = 0;
    let cur = 0;
    for (const f of frames) {
      cur = pred(f) ? cur + 1 : 0;
      best = Math.max(best, cur);
    }
    return best / fps;
  };
  const allow = opts.transitionSec ?? 0.45;
  const black = run((f) => f.luma < 22);
  const dark = run((f) => f.darkShare > 0.86 && f.luma < 60);
  const blank = run((f) => f.stdev < 6);
  const reasons: string[] = [];
  if (black > allow) reasons.push(`the product window is black for ${black.toFixed(1)}s (a short transition is fine, over ${allow}s is not)`);
  if (dark > allow + 0.2) reasons.push(`the product window is mostly empty dark space for ${dark.toFixed(1)}s`);
  if (blank > allow + 0.4) reasons.push(`the product window is blank or one flat colour for ${blank.toFixed(1)}s`);
  const mean = frames.length ? frames.reduce((a, f) => a + f.luma, 0) / frames.length : 0;
  return { ok: reasons.length === 0, reasons, blackSec: +black.toFixed(2), mostlyDarkSec: +dark.toFixed(2), blankSec: +blank.toFixed(2), meanLuma: +mean.toFixed(1) };
}

/** Reads the product window of the file at `fps` frames a second, up to `untilSec`. */
export function windowFrames(file: string, fps: number, untilSec: number, win: { x: number; y: number; w: number; h: number } = WIN): Promise<ScreenFrame[]> {
  return new Promise((resolve, reject) => {
    const args = ["-hide_banner", "-nostdin", "-loglevel", "error", "-i", file, "-t", String(untilSec), "-vf", `fps=${fps},crop=${win.w}:${win.h}:${win.x}:${win.y},scale=${W}:${H},format=gray`, "-f", "rawvideo", "-"];
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const un = registerKiller(() => child.kill("SIGKILL"));
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.on("close", (code) => {
      un();
      if (code !== 0) return reject(new Error("could not read the product window of the video"));
      const data = Buffer.concat(chunks);
      const n = W * H;
      const out: ScreenFrame[] = [];
      for (let f = 0; f + n <= data.length; f += n) {
        let sum = 0;
        let sq = 0;
        let dark = 0;
        for (let i = 0; i < n; i++) {
          const v = data[f + i];
          sum += v;
          sq += v * v;
          if (v < 40) dark++;
        }
        const mean = sum / n;
        out.push({ luma: mean, stdev: Math.sqrt(Math.max(0, sq / n - mean * mean)), darkShare: dark / n });
      }
      resolve(out);
    });
  });
}

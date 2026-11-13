/**
 * The game clip renderer. A game clip is FULL-BLEED real gameplay: the recorded screencast frames fill a vertical 1080x1920 canvas over a blurred copy of themselves, with a big short
 * caption and original music, then a short end card. It does not use the product-demo stage, the phone window, the cursor or the narrator, and it never draws or fakes a frame of
 * gameplay. The logo is overlaid as the untouched canonical file, scaled uniformly and nothing else (no crop, no rounding, no shadow, no recolor).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { StudioDb } from "../../db";
import { ffmpeg } from "../ffmpeg";
import { synthMusic, writeWav } from "../demo/audio";
import { comparePixels } from "../../brand/logo-integrity";
import type { SessionFrame } from "./moments";

const FONT = process.env.STUDIO_FONT_BOLD ?? "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const W = 1080;
const H = 1920;
const LOGO_W = 640;
const hex = (c: string) => c.replace("#", "0x");
const NL = String.fromCharCode(10);
void ({} as StudioDb);

export type GameRenderInput = {
  sessionDir: string;
  frames: SessionFrame[];
  /** session seconds */
  spans: Array<{ from: number; to: number; caption?: string }>;
  outFile: string;
  workDir: string;
  /** the exact canonical logo bytes, already written to this path */
  logoFile: string;
  logoSize: { w: number; h: number };
  brand: { dark: string; accent: string };
  endHeadline: string;
  attribution?: string | null;
  music?: { bpm: number; chords: Array<{ root: number; notes: number[] }> };
};

const run = async (args: string[], ms = 240_000) => {
  const r = await ffmpeg(args, ms);
  if (r.code !== 0) throw new Error(`ffmpeg failed (exit ${r.code ?? "none"}${r.code === null ? ", probably timed out" : ""}): ${(r.stderr ?? "").slice(-400)}`);
};

export async function renderGameClip(i: GameRenderInput): Promise<{ file: string; durationMs: number; endCard: { fromSec: number }; logoBox: { x: number; y: number; w: number; h: number } }> {
  await fs.mkdir(i.workDir, { recursive: true });
  // the frames are played with their real timing: a frame stays until the next one arrived, so a pause in the game is a pause in the clip
  const list = i.frames.map((f, k) => `file '${path.join(i.sessionDir, path.basename(f.f))}'\nduration ${(k + 1 < i.frames.length ? Math.max(0.001, i.frames[k + 1].t - f.t) : 0.03).toFixed(4)}`).join("\n");
  const listFile = path.join(i.workDir, "frames.txt");
  await fs.writeFile(listFile, list);
  const t0 = i.frames[0].t;
  void t0;
  const segs: string[] = [];
  for (let k = 0; k < i.spans.length; k++) {
    const s = i.spans[k];
    const seg = path.join(i.workDir, `seg${k}.mp4`);
    const cap = s.caption ? path.join(i.workDir, `cap${k}.txt`) : null;
    if (cap) await fs.writeFile(cap, s.caption as string);
    const draw = cap ? `,drawtext=fontfile=${FONT}:textfile=${cap}:fontsize=76:fontcolor=white:borderw=6:bordercolor=black@0.85:x=(w-text_w)/2:y=190` : "";
    // only this span's own frames go to ffmpeg (a long session has tens of thousands; walking all of them to seek made the render time out)
    const rel = (f: SessionFrame) => f.t - i.frames[0].t;
    const first = Math.max(0, i.frames.findIndex((f) => rel(f) > s.from) - 1);
    const afterEnd = i.frames.findIndex((f) => rel(f) >= s.to);
    const last = Math.min(i.frames.length - 1, (afterEnd < 0 ? i.frames.length - 1 : afterEnd) + 1);
    const sub = i.frames.slice(first, last + 1);
    const subList = sub.map((f, n) => `file '${path.join(i.sessionDir, path.basename(f.f))}'${NL}duration ${(n + 1 < sub.length ? Math.max(0.001, sub[n + 1].t - f.t) : 0.03).toFixed(4)}`).join(NL);
    const segList = path.join(i.workDir, `frames${k}.txt`);
    await fs.writeFile(segList, subList);
    await run(["-f", "concat", "-safe", "0", "-i", segList, "-ss", String(Math.max(0, s.from - rel(sub[0]))), "-t", String(s.to - s.from), "-filter_complex", `[0:v]fps=30,split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=40:6,eq=brightness=-0.12[bg];[b]scale=-2:1760[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2${draw}[v]`, "-map", "[v]", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20", "-r", "30", seg]);
    segs.push(seg);
  }
  // end card: brand colour, the untouched logo scaled uniformly, the call to action
  const endSec = 1.8;
  const lh = Math.round((LOGO_W * i.logoSize.h) / i.logoSize.w);
  const lx = Math.round((W - LOGO_W) / 2);
  const ly = Math.round((H - lh) / 2) - 90;
  const headFile = path.join(i.workDir, "end.txt");
  await fs.writeFile(headFile, i.endHeadline);
  const attrFile = path.join(i.workDir, "attr.txt");
  if (i.attribution) await fs.writeFile(attrFile, i.attribution);
  const end = path.join(i.workDir, "end.mp4");
  await run(["-f", "lavfi", "-i", `color=c=${hex(i.brand.dark)}:s=${W}x${H}:d=${endSec}:r=30`, "-i", i.logoFile, "-filter_complex", `[1:v]format=rgba,scale=${LOGO_W}:${lh}[l];[0:v][l]overlay=${lx}:${ly},drawtext=fontfile=${FONT}:textfile=${headFile}:fontsize=64:fontcolor=white:x=(w-text_w)/2:y=${ly + lh + 120}${i.attribution ? `,drawtext=fontfile=${FONT}:textfile=${attrFile}:fontsize=30:fontcolor=white@0.75:x=(w-text_w)/2:y=${H - 150}` : ""}[v]`, "-map", "[v]", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "18", "-r", "30", end]);
  const concat = path.join(i.workDir, "concat.txt");
  await fs.writeFile(concat, [...segs, end].map((f) => `file '${f}'`).join("\n"));
  const silent = path.join(i.workDir, "silent.mp4");
  await run(["-f", "concat", "-safe", "0", "-i", concat, "-c", "copy", silent]);
  const totalSec = i.spans.reduce((n, s) => n + (s.to - s.from), 0) + endSec;
  const [ml, mr] = synthMusic(totalSec + 0.3, 44100, i.music ?? {});
  const music = path.join(i.workDir, "music.wav");
  await writeWav(music, [ml, mr], 44100);
  await run(["-i", silent, "-i", music, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-af", `afade=t=in:d=0.4,afade=t=out:st=${Math.max(0, totalSec - 0.8)}:d=0.8,volume=0.8`, "-shortest", i.outFile]);
  return { file: i.outFile, durationMs: Math.round(totalSec * 1000), endCard: { fromSec: totalSec - endSec }, logoBox: { x: lx, y: ly, w: LOGO_W, h: lh } };
}

/** The logo-integrity check for a finished game clip: the end-card logo, cut out of the real final frame, is compared with the canonical source. Same limits as the demo renderer. */
export async function gameLogoCheck(videoFile: string, atSec: number, box: { x: number; y: number; w: number; h: number }, source: Buffer, natural: { w: number; h: number }, workDir: string) {
  const png = path.join(workDir, "endframe.png");
  await run(["-ss", String(atSec + 0.9), "-i", videoFile, "-frames:v", "1", png]);
  const sharp = (await import("sharp")).default;
  const crop = await sharp(png).extract({ left: box.x, top: box.y, width: box.w, height: box.h }).png().toBuffer();
  const r = await comparePixels(source, crop, { w: box.w, h: box.h }, natural);
  return { ok: r.mean <= 14 && r.strongShare <= 0.04, mean: +r.mean.toFixed(2), strongShare: +r.strongShare.toFixed(4) };
}

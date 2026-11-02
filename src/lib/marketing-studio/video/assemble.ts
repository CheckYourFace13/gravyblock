/**
 * Storyboard to MP4 with FFmpeg, deterministically. Real screenshots and captures only: an image scene is the approved asset on
 * a blurred, darkened copy of itself (sharp), moved by a simple zoom or pan. Cards come from the same template engine as static
 * creatives. Captions are burned in from fact-derived text with libass, inside the safe area. Nothing is generated or invented.
 */
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { VIDEO } from "../config";
import { ffmpeg } from "./ffmpeg";
import { wrapCaption } from "./captions";
import type { Motion, Scene, Storyboard } from "./types";

export { wrapCaption };

const W = VIDEO.width;
const H = VIDEO.height;
const T = VIDEO.transitionSeconds;
const FONT_DIR = "/usr/share/fonts/truetype/liberation";

export type CaptionEvent = { start: number; end: number; lines: string[]; sceneIndex: number };

const assTime = (s: number) => {
  const cs = Math.round(s * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};
const assEscape = (s: string) => s.replace(/\\/g, "").replace(/[{}]/g, "");

/** ASS subtitles. Margin 360 from the bottom keeps captions clear of the interface that overlays the lower part of vertical video. */
export function buildAss(events: CaptionEvent[]): string {
  const head = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Cap,Liberation Sans,58,&H00FFFFFF,&H000000FF,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,3,12,0,2,90,90,360,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  return head + events.map((e) => `Dialogue: 0,${assTime(e.start)},${assTime(e.end)},Cap,,0,0,0,,{\\fad(250,250)}${e.lines.map(assEscape).join("\\N")}`).join("\n") + "\n";
}

/** Start time of each scene on the final timeline (transitions overlap neighbouring scenes). */
export function sceneStarts(sb: Storyboard): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const [i, s] of sb.scenes.entries()) {
    starts.push(i === 0 ? 0 : acc - T);
    acc = (i === 0 ? 0 : acc - T) + s.seconds;
  }
  return starts;
}

function motionExpr(m: Motion, frames: number): string {
  const F = Math.max(1, frames - 1);
  const center = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";
  switch (m) {
    case "zoom_in":
      return `z='min(1+0.14*on/${F},1.14)':${center}`;
    case "zoom_out":
      return `z='max(1.14-0.14*on/${F},1)':${center}`;
    case "pan_left":
      return `z=1.14:x='(iw-iw/zoom)*(1-on/${F})':y='ih/2-(ih/zoom/2)'`;
    case "pan_right":
      return `z=1.14:x='(iw-iw/zoom)*(on/${F})':y='ih/2-(ih/zoom/2)'`;
    case "pan_down":
      return `z=1.14:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(on/${F})'`;
    default:
      return `z=1:${center}`;
  }
}

/** A 9:16 plate: the real image fitted inside, over a blurred and darkened cover copy of itself. */
export async function buildPlate(imageBytes: Buffer, outFile: string): Promise<void> {
  const PW = Math.round(W * 1.15);
  const PH = Math.round(H * 1.15);
  const bg = await sharp(imageBytes).rotate().resize(PW, PH, { fit: "cover" }).blur(40).modulate({ brightness: 0.55 }).png().toBuffer();
  const pad = Math.round(PW * 0.06);
  const fg = await sharp(imageBytes).rotate().resize({ width: PW - pad * 2, height: Math.round(PH * 0.62), fit: "inside" }).png().toBuffer();
  await sharp(bg).composite([{ input: fg, gravity: "centre" }]).png().toFile(outFile);
}

export type AssembleInput = {
  dir: string;
  storyboard: Storyboard;
  /** PNG bytes for each card scene, by scene index. */
  cards: Map<number, Buffer>;
  /** Image bytes for each image scene, by scene index. */
  images: Map<number, Buffer>;
  captions: CaptionEvent[];
  audioFile: string | null;
  outFile: string;
  timeoutMs: number;
};

export async function assemble(i: AssembleInput): Promise<{ clipFiles: string[]; seconds: number }> {
  const { storyboard: sb } = i;
  const clips: string[] = [];
  const x264 = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-r", String(VIDEO.fps)];
  // A keyframe every 0.5 s, no B-frames and no scene-cut keyframes: every cut and join below lands exactly on a keyframe.
  const GOP = ["-g", String(VIDEO.fps / 2), "-keyint_min", String(VIDEO.fps / 2), "-sc_threshold", "0", "-bf", "0", "-force_key_frames", "expr:gte(t,n_forced*0.5)"];
  for (const [idx, scene] of sb.scenes.entries()) {
    const clip = path.join(i.dir, `clip-${idx}.mp4`);
    const frames = Math.round(scene.seconds * VIDEO.fps);
    if (scene.type === "card") {
      const png = path.join(i.dir, `card-${idx}.png`);
      await fs.writeFile(png, i.cards.get(idx)!);
      const r = await ffmpeg(["-loop", "1", "-framerate", String(VIDEO.fps), "-i", png, "-frames:v", String(frames), "-vf", `scale=${W}:${H},format=yuv420p`, ...x264, ...GOP, clip], i.timeoutMs);
      if (r.code !== 0) throw new Error(`card clip ${idx} failed: ${r.stderr.slice(0, 300)}`);
    } else {
      const plate = path.join(i.dir, `plate-${idx}.png`);
      await buildPlate(i.images.get(idx)!, plate);
      const vf = `zoompan=${motionExpr((scene as Extract<Scene, { type: "image" }>).motion, frames)}:d=${frames}:s=${W}x${H}:fps=${VIDEO.fps},format=yuv420p`;
      const r = await ffmpeg(["-loop", "1", "-framerate", String(VIDEO.fps), "-i", plate, "-frames:v", String(frames), "-vf", vf, ...x264, ...GOP, clip], i.timeoutMs);
      if (r.code !== 0) throw new Error(`image clip ${idx} failed: ${r.stderr.slice(0, 300)}`);
    }
    clips.push(clip);
    await fs.rm(path.join(i.dir, `card-${idx}.png`), { force: true });
    await fs.rm(path.join(i.dir, `plate-${idx}.png`), { force: true });
  }

  // Memory-bounded assembly. One big xfade chain makes FFmpeg queue frames of every later input for the whole timeline, so memory grows
  // with video length. Instead: every clip has a keyframe each 0.5 s, so it can be cut on exact boundaries and joined by stream copy.
  // Only each 0.5 s transition is decoded and re-encoded, and the single full re-encode happens once, at the end, for captions and audio.
  const n = clips.length;
  const pieces: string[] = [];
  for (let idx = 0; idx < n; idx++) {
    const d = sb.scenes[idx].seconds;
    const start = idx === 0 ? 0 : T;
    const end = idx === n - 1 ? d : d - T;
    const piece = path.join(i.dir, `piece-${idx}.mp4`);
    const r = await ffmpeg(["-ss", String(start), "-i", clips[idx], "-t", String(+(end - start).toFixed(3)), "-c", "copy", piece], i.timeoutMs);
    if (r.code !== 0) throw new Error(`piece ${idx} failed: ${r.stderr.slice(0, 300)}`);
    pieces.push(piece);
    if (idx < n - 1) {
      const trans = path.join(i.dir, `trans-${idx}.mp4`);
      const tr = await ffmpeg(
        ["-ss", String(+(d - T).toFixed(3)), "-t", String(T), "-i", clips[idx], "-t", String(T), "-i", clips[idx + 1], "-filter_complex", `[0:v][1:v]xfade=transition=${sb.transition}:duration=${T}:offset=0,format=yuv420p[v]`, "-map", "[v]", ...x264, ...GOP, trans],
        i.timeoutMs,
      );
      if (tr.code !== 0) throw new Error(`transition ${idx} failed: ${tr.stderr.slice(0, 300)}`);
      pieces.push(trans);
    }
  }
  const list = path.join(i.dir, "pieces.txt");
  await fs.writeFile(list, pieces.map((p) => `file '${path.basename(p)}'`).join("\n") + "\n");
  const joined = path.join(i.dir, "joined.mp4");
  const cj = await ffmpeg(["-f", "concat", "-safe", "0", "-i", "pieces.txt", "-c", "copy", joined], i.timeoutMs, i.dir);
  if (cj.code !== 0) throw new Error(`join failed: ${cj.stderr.slice(0, 300)}`);
  for (const p of pieces) await fs.rm(p, { force: true });

  const total = +(sb.scenes.reduce((acc, s) => acc + s.seconds, 0) - (n - 1) * T).toFixed(2);
  const hasCaptions = i.captions.length > 0;
  if (hasCaptions) await fs.writeFile(path.join(i.dir, "captions.ass"), buildAss(i.captions));
  let r;
  if (!hasCaptions && !i.audioFile) {
    await fs.rename(joined, i.outFile);
    r = { code: 0, stderr: "", stdout: "", timedOut: false };
  } else {
    // The subtitle file is referenced by a relative name with the job directory as the working directory, so no path needs escaping.
    const vf = hasCaptions ? `subtitles=captions.ass${existsSync(FONT_DIR) ? `:fontsdir=${FONT_DIR}` : ""}` : "null";
    const audio = i.audioFile
      ? ["-i", i.audioFile, "-filter_complex", `[0:v]${vf}[vout];[1:a]atrim=0:${total},afade=t=out:st=${Math.max(0, total - 1.5)}:d=1.5,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`, "-map", "[vout]", "-map", "[aout]", "-c:a", "aac", "-b:a", "128k"]
      : ["-vf", vf, "-an"];
    r = await ffmpeg(["-i", joined, ...audio, "-t", String(total), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", String(VIDEO.fps), "-movflags", "+faststart", i.outFile], i.timeoutMs, i.dir);
    await fs.rm(joined, { force: true });
  }
  if (r.code !== 0) throw new Error(`final assembly failed${r.timedOut ? " (timed out)" : ""}: ${r.stderr.slice(0, 400)}`);
  return { clipFiles: clips, seconds: total };
}

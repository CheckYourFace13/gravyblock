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
  for (const [idx, scene] of sb.scenes.entries()) {
    const clip = path.join(i.dir, `clip-${idx}.mp4`);
    const frames = Math.round(scene.seconds * VIDEO.fps);
    if (scene.type === "card") {
      const png = path.join(i.dir, `card-${idx}.png`);
      await fs.writeFile(png, i.cards.get(idx)!);
      const r = await ffmpeg(["-loop", "1", "-framerate", String(VIDEO.fps), "-i", png, "-frames:v", String(frames), "-vf", `scale=${W}:${H},format=yuv420p`, ...x264, clip], i.timeoutMs);
      if (r.code !== 0) throw new Error(`card clip ${idx} failed: ${r.stderr.slice(0, 300)}`);
    } else {
      const plate = path.join(i.dir, `plate-${idx}.png`);
      await buildPlate(i.images.get(idx)!, plate);
      const vf = `zoompan=${motionExpr((scene as Extract<Scene, { type: "image" }>).motion, frames)}:d=${frames}:s=${W}x${H}:fps=${VIDEO.fps},format=yuv420p`;
      const r = await ffmpeg(["-loop", "1", "-framerate", String(VIDEO.fps), "-i", plate, "-frames:v", String(frames), "-vf", vf, ...x264, clip], i.timeoutMs);
      if (r.code !== 0) throw new Error(`image clip ${idx} failed: ${r.stderr.slice(0, 300)}`);
    }
    clips.push(clip);
    await fs.rm(path.join(i.dir, `card-${idx}.png`), { force: true });
    await fs.rm(path.join(i.dir, `plate-${idx}.png`), { force: true });
  }

  // Cross-transitions between clips in one pass, with captions burned in afterwards.
  const durs = sb.scenes.map((s) => s.seconds);
  const inputs = clips.flatMap((c) => ["-i", c]);
  let graph = "";
  let last = "[0:v]";
  let acc = durs[0];
  for (let k = 1; k < clips.length; k++) {
    const offset = +(acc - T).toFixed(3);
    const out = k === clips.length - 1 ? "[vx]" : `[v${k}]`;
    graph += `${last}[${k}:v]xfade=transition=${sb.transition}:duration=${T}:offset=${offset}${out};`;
    last = out;
    acc = offset + durs[k];
  }
  const total = +acc.toFixed(2);
  const assFile = path.join(i.dir, "captions.ass");
  const hasCaptions = i.captions.length > 0;
  if (hasCaptions) await fs.writeFile(assFile, buildAss(i.captions));
  // The subtitle file is referenced by a relative name with the job directory as the working directory, so no path needs escaping.
  graph += hasCaptions ? `[vx]subtitles=captions.ass${existsSync(FONT_DIR) ? `:fontsdir=${FONT_DIR}` : ""}[vout]` : `[vx]null[vout]`;
  const audioArgs = i.audioFile
    ? ["-i", i.audioFile, "-filter_complex", `${graph};[${clips.length}:a]atrim=0:${total},afade=t=out:st=${Math.max(0, total - 1.5)}:d=1.5,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`, "-map", "[vout]", "-map", "[aout]", "-c:a", "aac", "-b:a", "128k"]
    : ["-filter_complex", graph, "-map", "[vout]", "-an"];
  const r = await ffmpeg([...inputs, ...audioArgs, "-t", String(total), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", String(VIDEO.fps), "-movflags", "+faststart", i.outFile], i.timeoutMs, i.dir);
  if (r.code !== 0) throw new Error(`final assembly failed${r.timedOut ? " (timed out)" : ""}: ${r.stderr.slice(0, 400)}`);
  return { clipFiles: clips, seconds: total };
}

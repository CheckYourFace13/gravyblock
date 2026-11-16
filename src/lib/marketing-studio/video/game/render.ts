/**
 * The game clip renderer. A game clip is REAL gameplay played straight through, fitted whole inside the canvas (never cropped) over a blurred copy of itself, with a short caption and original
 * music (and the game's own sound when the capture has it), then a short end card. It does not use the product-demo stage, the phone window, the cursor or the narrator, and it never draws
 * or fakes a frame of gameplay. The voiceover is placed where what it describes is on screen, the music ducks a lot under it and the game's own sound only slightly. The logo is overlaid as
 * the untouched canonical file, scaled uniformly and nothing else (no crop, no rounding, no shadow, no recolor).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { ffmpeg } from "../ffmpeg";
import { STUDIO_TTS_DIR } from "../../config";
import { placeLines, synthesizeLines, synthMusic, writeWav } from "../demo/audio";
import { comparePixels } from "../../brand/logo-integrity";
import { decodeMono } from "../voice-audible";
import { measureVoice, pitchSpread } from "../voice-analysis";
import type { SessionFrame } from "./moments";

const FONT = process.env.STUDIO_FONT_BOLD ?? "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const LOGO_W = 640;
const hex = (c: string) => c.replace("#", "0x");
const NL = String.fromCharCode(10);

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
  /** vertical 1080x1920 or landscape 1920x1080: follows the footage and the game's own orientation */
  vertical?: boolean;
  /** the size of the captured frames: the footage is fitted inside the canvas whole, never cropped */
  source: { w: number; h: number };
  music?: { bpm: number; chords: Array<{ root: number; notes: number[] }> };
  /** the game's own sound, aligned with the session (audio.wav): cut with the spans, kept under the voice, never replaced by it */
  gameAudio?: string | null;
  /** spoken lines (the voiceover), each wanted at a time in the clip; the last is spoken over the end card */
  narration?: { lines: Array<{ text: string; atMs: number }>; voice: string; speed: number; ttsDir?: string };
};

export type GameRenderOut = {
  voiceLines: Array<{ text: string; startMs: number; endMs: number }>;
  file: string;
  durationMs: number;
  gameplayEndMs: number;
  endCard: { fromSec: number };
  logoBox: { x: number; y: number; w: number; h: number };
  canvas: { w: number; h: number };
  drawn: { w: number; h: number };
  /** where the footage sits in the frame, for the black and blank check */
  window: { x: number; y: number; w: number; h: number };
  captions: string[];
  voice: { wordsPerSec: number; pitchSpread: number | null; pitchHz: number | null } | null;
  /** how far the voice sits above the game audio and music under it while it speaks (dB) */
  voiceOverBedDb: number | null;
  usedGameAudio: boolean;
};

const run = async (args: string[], ms = 240_000) => {
  const r = await ffmpeg(args, ms);
  if (r.code !== 0) throw new Error(`ffmpeg failed (exit ${r.code ?? "none"}${r.code === null ? ", probably timed out" : ""}): ${(r.stderr ?? "").slice(-400)}`);
};

/** Pure: the whole footage fitted inside the canvas (never cropped), as large as the frame allows. */
export function fitFootage(src: { w: number; h: number }, canvas: { w: number; h: number }, vertical: boolean): { w: number; h: number } {
  const s = Math.min(canvas.w / src.w, (canvas.h * (vertical ? 0.916 : 0.907)) / src.h);
  return { w: Math.round((src.w * s) / 2) * 2, h: Math.round((src.h * s) / 2) * 2 };
}

const rmsDb = (s: Float32Array, a: number, b: number) => {
  let sum = 0;
  let n = 0;
  for (let i = Math.max(0, a); i < Math.min(s.length, b); i++) {
    sum += s[i] * s[i];
    n++;
  }
  return n ? 10 * Math.log10(sum / n + 1e-12) : -120;
};

export async function renderGameClip(i: GameRenderInput): Promise<GameRenderOut> {
  await fs.mkdir(i.workDir, { recursive: true });
  const vertical = i.vertical !== false;
  const W = vertical ? 1080 : 1920;
  const H = vertical ? 1920 : 1080;
  const drawn = fitFootage(i.source, { w: W, h: H }, vertical);
  const window = { x: Math.round((W - drawn.w) / 2), y: Math.round((H - drawn.h) / 2), w: drawn.w, h: drawn.h };
  const segs: string[] = [];
  const captions: string[] = [];
  for (let k = 0; k < i.spans.length; k++) {
    const s = i.spans[k];
    const seg = path.join(i.workDir, `seg${k}.mp4`);
    const cap = s.caption ? path.join(i.workDir, `cap${k}.txt`) : null;
    if (cap) {
      await fs.writeFile(cap, s.caption as string);
      captions.push(s.caption as string);
    }
    const draw = cap ? `,drawtext=fontfile=${FONT}:textfile=${cap}:fontsize=${vertical ? 76 : 64}:fontcolor=white:borderw=6:bordercolor=black@0.85:x=(w-text_w)/2:y=${vertical ? 120 : 40}` : "";
    // only this span's own frames go to ffmpeg (a long session has tens of thousands; walking all of them to seek made the render time out)
    const rel = (f: SessionFrame) => f.t - i.frames[0].t;
    const first = Math.max(0, i.frames.findIndex((f) => rel(f) > s.from) - 1);
    const afterEnd = i.frames.findIndex((f) => rel(f) >= s.to);
    const last = Math.min(i.frames.length - 1, (afterEnd < 0 ? i.frames.length - 1 : afterEnd) + 1);
    const sub = i.frames.slice(first, last + 1);
    const subList = sub.map((f, n) => `file '${path.join(i.sessionDir, path.basename(f.f))}'${NL}duration ${(n + 1 < sub.length ? Math.max(0.001, sub[n + 1].t - f.t) : 0.03).toFixed(4)}`).join(NL);
    const segList = path.join(i.workDir, `frames${k}.txt`);
    await fs.writeFile(segList, subList);
    await run(["-f", "concat", "-safe", "0", "-i", segList, "-ss", String(Math.max(0, s.from - rel(sub[0]))), "-t", String(s.to - s.from), "-filter_complex", `[0:v]fps=30,split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=40:6,eq=brightness=-0.12[bg];[b]scale=${drawn.w}:${drawn.h}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2${draw}[v]`, "-map", "[v]", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20", "-r", "30", seg]);
    segs.push(seg);
  }
  // end card: brand colour, the untouched logo scaled uniformly, the call to action
  const endSec = i.narration?.lines.length ? 2.8 : 1.8;
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
  await fs.writeFile(concat, [...segs, end].map((f) => `file '${f}'`).join(NL));
  const silent = path.join(i.workDir, "silent.mp4");
  await run(["-f", "concat", "-safe", "0", "-i", concat, "-c", "copy", silent]);
  const gameSec = i.spans.reduce((n, s) => n + (s.to - s.from), 0);
  const totalSec = gameSec + endSec;
  const [ml, mr] = synthMusic(totalSec + 0.3, 44100, i.music ?? {});
  const music = path.join(i.workDir, "music.wav");
  await writeWav(music, [ml, mr], 44100);

  // the game's own sound: each span's audio, played straight, then silence under the end card
  let game: string | null = null;
  if (i.gameAudio) {
    game = path.join(i.workDir, "game.wav");
    const cut = i.spans.map((s, k) => `[0:a]atrim=start=${s.from.toFixed(3)}:end=${s.to.toFixed(3)},asetpts=PTS-STARTPTS[g${k}]`);
    const join = `${i.spans.map((_, k) => `[g${k}]`).join("")}concat=n=${i.spans.length}:v=0:a=1,apad=whole_dur=${totalSec.toFixed(3)}[out]`;
    await run(["-i", i.gameAudio, "-filter_complex", [...cut, join].join(";"), "-map", "[out]", "-ar", "44100", "-ac", "2", game]);
  }

  const voiceLines: Array<{ text: string; startMs: number; endMs: number }> = [];
  let voice: GameRenderOut["voice"] = null;
  let voiceOverBedDb: number | null = null;
  const bedLevel = game ? 0.22 : 0.5;
  if (i.narration?.lines.length) {
    const synth = await synthesizeLines(i.narration.lines.map((l, k) => ({ id: "G" + k, text: l.text })), { ttsDir: i.narration.ttsDir ?? STUDIO_TTS_DIR, voice: i.narration.voice, speed: i.narration.speed, tmpDir: path.join(i.workDir, "tts") });
    const rate = synth[0].rate;
    const endStartMs = gameSec * 1000;
    let cursor = 250;
    synth.forEach((s, k) => {
      const dur = Math.round((s.samples.length / s.rate) * 1000);
      const want = i.narration!.lines[k].atMs;
      const start = want >= endStartMs ? Math.max(cursor, endStartMs + 150) : Math.max(cursor, want);
      voiceLines.push({ text: i.narration!.lines[k].text, startMs: start, endMs: start + dur });
      cursor = start + dur + 250;
    });
    const last = voiceLines[voiceLines.length - 1];
    if (last.endMs > totalSec * 1000 - 150) throw new Error("the narration does not fit this clip (" + Math.round(last.endMs) + " ms of voice in " + Math.round(totalSec * 1000) + " ms)");
    const joined = new Float32Array(synth.reduce((n, s) => n + s.samples.length, 0));
    let off = 0;
    for (const s of synth) {
      joined.set(s.samples, off);
      off += s.samples.length;
    }
    const m = measureVoice(joined, rate, voiceLines.reduce((n, l) => n + l.text.split(/\s+/).length, 0));
    voice = { wordsPerSec: m.wordsPerSec, pitchSpread: pitchSpread(joined, rate), pitchHz: m.pitchHz };
    const vo = placeLines(synth.map((s, k) => ({ samples: s.samples, rate: s.rate, startMs: voiceLines[k].startMs })), totalSec * 1000 + 300, rate);
    const voWav = path.join(i.workDir, "vo.wav");
    await writeWav(voWav, [vo], rate);
    // the bed (music, and the game's own sound) ducks under the voice: the music a lot, the game's sound only slightly so impact and reward sounds stay audible
    const fade = Math.max(0, totalSec - 1.8).toFixed(2);
    const bed = path.join(i.workDir, "bed.wav");
    const duck = [
      game ? "[0:a]pan=stereo|c0=c0|c1=c0,asplit=2[k1][k2]" : "[0:a]pan=stereo|c0=c0|c1=c0[k1]",
      `[1:a]volume=${bedLevel},afade=t=in:d=0.6,afade=t=out:st=${fade}:d=1.8[m]`,
      "[m][k1]sidechaincompress=threshold=0.02:ratio=10:attack=8:release=420:makeup=1[md]",
      ...(game ? ["[2:a]volume=0.95[ga]", "[ga][k2]sidechaincompress=threshold=0.03:ratio=3:attack=10:release=350:makeup=1[gd]", "[md][gd]amix=inputs=2:normalize=0:duration=longest[bed]"] : ["[md]anull[bed]"]),
    ].join(";");
    await run(["-i", voWav, "-i", music, ...(game ? ["-i", game] : []), "-filter_complex", duck, "-map", "[bed]", "-ar", "48000", "-ac", "2", bed]);
    await run(["-i", voWav, "-i", bed, "-filter_complex", "[0:a]pan=stereo|c0=c0|c1=c0[vo];[vo][1:a]amix=inputs=2:normalize=0:duration=longest[mix];[mix]loudnorm=I=-15:TP=-1.5:LRA=9,alimiter=limit=0.84:level=disabled[out]", "-map", "[out]", "-ar", "48000", "-ac", "2", path.join(i.workDir, "mix.wav")]);
    // the balance, measured on the two parts while the voice speaks
    const [voS, bedS] = await Promise.all([decodeMono(voWav), decodeMono(bed)]);
    if (voS && bedS) {
      const R = 8000;
      const at = (ms: number) => Math.round((ms / 1000) * R);
      const diffs = voiceLines.map((l) => rmsDb(voS, at(l.startMs), at(l.endMs)) - rmsDb(bedS, at(l.startMs), at(l.endMs)));
      voiceOverBedDb = +(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1);
    }
    await run(["-i", silent, "-i", path.join(i.workDir, "mix.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", i.outFile]);
  } else {
    const af = `afade=t=in:d=0.4,afade=t=out:st=${Math.max(0, totalSec - 0.8)}:d=0.8,volume=0.8`;
    if (game) await run(["-i", silent, "-i", music, "-i", game, "-filter_complex", `[1:a]volume=0.3[m];[2:a]volume=0.95[g];[m][g]amix=inputs=2:normalize=0:duration=longest,${af}[a]`, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", i.outFile]);
    else await run(["-i", silent, "-i", music, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-af", af, "-shortest", i.outFile]);
  }
  return { voiceLines, file: i.outFile, durationMs: Math.round(totalSec * 1000), gameplayEndMs: Math.round(gameSec * 1000), endCard: { fromSec: totalSec - endSec }, logoBox: { x: lx, y: ly, w: LOGO_W, h: lh }, canvas: { w: W, h: H }, drawn, window, captions, voice, voiceOverBedDb, usedGameAudio: Boolean(game) };
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

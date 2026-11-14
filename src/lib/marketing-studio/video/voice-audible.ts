/**
 * Proof that a narrated video really has a voice in it. A video that is supposed to be narrated is checked on the FINAL FILE (the one that is uploaded), not on the synthesis step:
 * the file must carry an audio stream, the audio must not be silent, and the loudness over time must follow the voice track that was recorded for it (the voice is what the music ducks under),
 * so a mix that dropped the voice, a muted stream or a silent track all fail. Pure measuring helpers are exported for tests.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { ffmpeg, ffprobe } from "./ffmpeg";

const RATE = 8000;
const WIN = RATE / 10; // 100 ms

/** Decodes the first audio stream of a file (or a wav) to 8 kHz mono float samples. */
export async function decodeMono(file: string): Promise<Float32Array | null> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "va-"));
  const out = path.join(dir, "a.raw");
  try {
    const r = await ffmpeg(["-i", file, "-vn", "-map", "0:a:0", "-ac", "1", "-ar", String(RATE), "-f", "f32le", out], 120_000);
    if (r.code !== 0) return null;
    const buf = await fs.readFile(out);
    return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** Pure: RMS per 100 ms window. */
export function envelope(s: Float32Array): number[] {
  const out: number[] = [];
  for (let i = 0; i + WIN <= s.length; i += WIN) {
    let a = 0;
    for (let k = 0; k < WIN; k++) a += s[i + k] * s[i + k];
    out.push(Math.sqrt(a / WIN));
  }
  return out;
}

/** Pure: Pearson correlation of two envelopes over their common length. */
export function correlate(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  const ma = a.slice(0, n).reduce((x, y) => x + y, 0) / n;
  const mb = b.slice(0, n).reduce((x, y) => x + y, 0) / n;
  let c = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    c += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return va && vb ? c / Math.sqrt(va * vb) : 0;
}

export type VoiceAudibleResult = {
  audioStream: boolean;
  meanDb: number | null;
  /** share of 100 ms windows that are not silent */
  activeShare: number;
  /** envelope correlation with the recorded voice track (null when no voice track was given) */
  voiceMatch: number | null;
  /** seconds of the recorded voice track that is audible in the file's own mix (null when no voice track was given) */
  audible: boolean;
  reason: string;
};

const db = (x: number) => (x > 0 ? +(20 * Math.log10(x)).toFixed(1) : -120);

/** Pure decision from decoded audio. `voice` is the recorded voice track at the same time base (optional). */
export function judgeVoice(mix: Float32Array | null, voice: Float32Array | null): VoiceAudibleResult {
  if (!mix) return { audioStream: false, meanDb: null, activeShare: 0, voiceMatch: null, audible: false, reason: "the file has no audio stream" };
  const env = envelope(mix);
  const mean = Math.sqrt(env.reduce((a, b) => a + b * b, 0) / Math.max(1, env.length));
  const active = env.filter((e) => e > 0.004).length / Math.max(1, env.length);
  const meanDb = db(mean);
  if (meanDb < -45 || active < 0.5) return { audioStream: true, meanDb, activeShare: +active.toFixed(2), voiceMatch: null, audible: false, reason: `the audio is silent (${meanDb} dB, ${Math.round(active * 100)}% active)` };
  if (!voice) return { audioStream: true, meanDb, activeShare: +active.toFixed(2), voiceMatch: null, audible: true, reason: "audio present (no voice track to compare with)" };
  const venv = envelope(voice);
  const voiceLevel = Math.sqrt(venv.reduce((a, b) => a + b * b, 0) / Math.max(1, venv.length));
  if (db(voiceLevel) < -45) return { audioStream: true, meanDb, activeShare: +active.toFixed(2), voiceMatch: 0, audible: false, reason: "the recorded voice track is silent" };
  const match = +correlate(env, venv).toFixed(2);
  // the music is ducked under the voice, so a mix that really contains the voice rises and falls with it
  const audible = match >= 0.35;
  return { audioStream: true, meanDb, activeShare: +active.toFixed(2), voiceMatch: match, audible, reason: audible ? `voice follows the recorded track (match ${match})` : `the file's audio does not follow the recorded voice (match ${match})` };
}

/** Measures a rendered file; give `voiceWav` (the recorded voice track) to prove that voice, and not just sound, is in the file. */
export async function voiceAudible(file: string, voiceWav?: string): Promise<VoiceAudibleResult> {
  const probe = await ffprobe(file);
  if (!probe.audio) return judgeVoice(null, null);
  const mix = await decodeMono(file);
  const voice = voiceWav ? await decodeMono(voiceWav) : null;
  return judgeVoice(mix, voice);
}

export type LinesAudible = { audioStream: boolean; lineDb: number | null; gapDb: number | null; liftDb: number | null; linesHeard: number; lines: number; audible: boolean; reason: string };

const dbOf = (s: Float32Array, a: number, b: number) => {
  let sum = 0;
  let n = 0;
  for (let i = Math.max(0, a); i < Math.min(s.length, b); i++) {
    sum += s[i] * s[i];
    n++;
  }
  return n ? 10 * Math.log10(sum / n + 1e-12) : -120;
};

/**
 * Pure: is the narration really in the FINAL audio. Each spoken line's window must be louder than the music bed in the pauses around it (the music ducks under the voice, so a mix that lost
 * the voice has no lift), the voiced windows must be clearly audible in absolute terms, and most lines must individually be heard. `mix` is 8 kHz mono; times are file milliseconds.
 */
export function judgeLines(mix: Float32Array | null, lines: Array<{ startMs: number; endMs: number }>): LinesAudible {
  if (!mix) return { audioStream: false, lineDb: null, gapDb: null, liftDb: null, linesHeard: 0, lines: lines.length, audible: false, reason: "the file has no audio stream" };
  const at = (ms: number) => Math.round((ms / 1000) * RATE);
  const ordered = [...lines].sort((a, b) => a.startMs - b.startMs);
  if (!ordered.length) return { audioStream: true, lineDb: null, gapDb: null, liftDb: null, linesHeard: 0, lines: 0, audible: false, reason: "narration is expected but the video has no spoken lines" };
  const gaps: Array<[number, number]> = [];
  for (let k = 1; k < ordered.length; k++) if (ordered[k].startMs - ordered[k - 1].endMs >= 250) gaps.push([ordered[k - 1].endMs + 60, ordered[k].startMs - 60]);
  const totalMs = mix.length / RATE * 1000;
  if (totalMs - ordered[ordered.length - 1].endMs >= 600) gaps.push([ordered[ordered.length - 1].endMs + 200, totalMs - 150]);
  if (ordered[0].startMs >= 600) gaps.push([100, ordered[0].startMs - 100]);
  const lineDbs = ordered.map((l) => dbOf(mix, at(l.startMs), at(l.endMs)));
  const gapDbs = gaps.map(([a, b]) => dbOf(mix, at(a), at(b)));
  const lineDb = lineDbs.reduce((a, b) => a + b, 0) / lineDbs.length;
  const gapDb = gapDbs.length ? gapDbs.reduce((a, b) => a + b, 0) / gapDbs.length : null;
  // with no pause to compare against, the voiced windows must simply be loud enough to be speech over music
  const lift = gapDb === null ? null : lineDb - gapDb;
  const heard = lineDbs.filter((d) => d > -38 && (gapDb === null || d - gapDb >= 1.5)).length;
  const loud = lineDb > -30;
  const liftOk = lift === null ? lineDb > -22 : lift >= 3;
  const most = heard >= Math.ceil(ordered.length * 0.8);
  const audible = loud && liftOk && most;
  return {
    audioStream: true,
    lineDb: +lineDb.toFixed(1),
    gapDb: gapDb === null ? null : +gapDb.toFixed(1),
    liftDb: lift === null ? null : +lift.toFixed(1),
    linesHeard: heard,
    lines: ordered.length,
    audible,
    reason: audible ? `voice is audible in the final file: ${heard}/${ordered.length} lines heard, ${lift === null ? "no pauses to compare" : `${lift.toFixed(1)} dB above the music bed`}` : `the narration is NOT audible in the final file: ${heard}/${ordered.length} lines heard, voiced windows ${lineDb.toFixed(1)} dB${lift === null ? "" : `, ${lift.toFixed(1)} dB above the music bed (needs 3)`}`,
  };
}

/** Measures a finished file against the lines that should be spoken in it. */
export async function narrationAudible(file: string, lines: Array<{ startMs: number; endMs: number }>): Promise<LinesAudible> {
  const probe = await ffprobe(file);
  if (!probe.audio) return judgeLines(null, lines);
  return judgeLines(await decodeMono(file), lines);
}

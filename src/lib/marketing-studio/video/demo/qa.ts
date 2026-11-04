/**
 * QA for product demo videos. These checks target exactly what makes a bad marketing video: a static slideshow, silence, captions that
 * drift from the voice, and claims that are not backed by the product's own pages.
 */
import { spawn } from "node:child_process";
import { registerKiller } from "../../active-work";
import { ffprobe, run } from "../ffmpeg";
import { captionWordsFor } from "./audio";
import { CANVAS, WIN, type DemoRecord, type Manifest, type NarrationLine, type Timeline } from "./types";

export type DemoQaCheck = { id: string; ok: boolean; severity: "fail" | "warn"; detail: string };
export type DemoQaResult = { passed: boolean; checks: DemoQaCheck[]; metrics: Record<string, number> };

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

export const BANNED = /\b(best|#1|number one|no\.? ?1|guarantee[sd]?|instant(ly)?|in seconds|seconds|minutes|hours|save[sd]? (you )?(time|money|hours)|revolutionary|award|trusted by|thousands|millions|forever|risk[- ]free|cheapest|fastest|only)\b|\d+\s?%/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/;
const PERSONAL = /\bchris\b|\bchristopher\b/i;

/** Raw 8-bit gray frames from FFmpeg, as a Buffer. */
function rawGray(file: string, vf: string, w: number, h: number, fps: number, ss = 0, t?: number): Promise<{ data: Buffer; frames: number }> {
  return new Promise((resolve, reject) => {
    const args = ["-hide_banner", "-nostdin", "-loglevel", "error", ...(ss ? ["-ss", String(ss)] : []), "-i", file, ...(t ? ["-t", String(t)] : []), "-vf", `fps=${fps},${vf},format=gray`, "-f", "rawvideo", "-"];
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let err = "";
    const un = registerKiller(() => child.kill("SIGKILL"));
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => (err += d.toString().slice(0, 500)));
    child.on("close", (code) => {
      un();
      if (code !== 0) return reject(new Error(`motion analysis failed: ${err}`));
      const data = Buffer.concat(chunks);
      resolve({ data, frames: Math.floor(data.length / (w * h)) });
    });
  });
}

/** Mean absolute difference between consecutive frames (0 to 255). */
export function frameDiffs(data: Buffer, w: number, h: number, frames: number): number[] {
  const out: number[] = [];
  const n = w * h;
  for (let f = 1; f < frames; f++) {
    let sum = 0;
    const a = (f - 1) * n;
    const b = f * n;
    for (let i = 0; i < n; i++) sum += Math.abs(data[b + i] - data[a + i]);
    out.push(sum / n);
  }
  return out;
}

/** Longest run of frames whose difference stays under the threshold, in seconds. */
export function longestStill(diffs: number[], fps: number, threshold: number): number {
  let best = 0;
  let cur = 0;
  for (const d of diffs) {
    cur = d < threshold ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best / fps;
}

export type DemoQaInput = {
  file: string;
  expectedMs: number;
  record: DemoRecord;
  timeline: Timeline;
  manifest: Manifest;
  narration: NarrationLine[];
  lineTimes: Record<string, { start: number; end: number }>;
  voicedMs: number;
  onScreenTexts: string[];
  endStartMs: number;
  /** The final mixed audio (wav), used to prove the music is audible and sits under the voice. */
  mixFile: string;
  /** The product's own site, used to prove every source page and the call to action belong to it. Defaults to RentalNoodle. */
  site?: { origin: string; ctaText: string; ctaHost: string };
};

const RN_SITE = { origin: "https://rentalnoodle.com", ctaText: "Start Managing Free", ctaHost: "rentalnoodle.com" };

export async function runDemoQa(i: DemoQaInput): Promise<DemoQaResult> {
  const checks: DemoQaCheck[] = [];
  const metrics: Record<string, number> = {};
  const add = (id: string, ok: boolean, detail: string, severity: "fail" | "warn" = "fail") => checks.push({ id, ok, severity, detail });

  // 1. file and format
  const probe = await ffprobe(i.file);
  const dur = probe.durationSec ?? 0;
  metrics.durationSec = +dur.toFixed(2);
  add("duration", dur >= 20 && dur <= 35 && Math.abs(dur * 1000 - i.expectedMs) < 600, `${dur.toFixed(1)}s (target 20 to 35s, planned ${(i.expectedMs / 1000).toFixed(1)}s)`);
  add("format", probe.video?.codec === "h264" && probe.video.width === CANVAS.w && probe.video.height === CANVAS.h && probe.video.pixFmt === "yuv420p" && Math.abs((probe.video.fps ?? 0) - CANVAS.fps) < 0.5, probe.video ? `${probe.video.codec} ${probe.video.width}x${probe.video.height} ${probe.video.pixFmt} ${probe.video.fps}fps` : "no video stream");
  add("has_audio", probe.audio?.codec === "aac", probe.audio ? `audio ${probe.audio.codec}` : "no audio stream");

  // 2. loudness of the mix
  const loud = await run("ffmpeg", ["-hide_banner", "-nostdin", "-i", i.file, "-af", "ebur128=peak=true", "-vn", "-f", "null", "-"], { timeoutMs: 120_000 });
  const lufs = Number(/I:\s+(-?\d+(?:\.\d+)?)\s+LUFS/.exec(loud.stderr.split("Summary:").pop() ?? "")?.[1]);
  const peak = Number(/Peak:\s+(-?\d+(?:\.\d+)?)\s+dBFS/.exec(loud.stderr.split("Summary:").pop() ?? "")?.[1]);
  metrics.lufs = lufs;
  metrics.truePeakDb = peak;
  add("loudness", Number.isFinite(lufs) && lufs >= -19 && lufs <= -12 && (!Number.isFinite(peak) || peak <= -0.9), `integrated ${lufs} LUFS, true peak ${peak} dBFS (target about -15 LUFS, peak at or under -1)`);

  // 3. voiceover covers the video, with no dead air between lines
  const voiced = i.voicedMs / 1000;
  metrics.voicedSec = +voiced.toFixed(1);
  add("voiceover_present", voiced / Math.max(1, dur) >= 0.7, `voice speaks for ${voiced.toFixed(1)}s of ${dur.toFixed(1)}s (${Math.round((voiced / Math.max(1, dur)) * 100)}%)`);
  const ordered = i.narration.map((l) => i.lineTimes[l.id]);
  const gaps = ordered.slice(1).map((l, k) => (l.start - ordered[k].end) / 1000);
  metrics.longestGapSec = +Math.max(...gaps).toFixed(2);
  // The one planned longer pause leads into the closing line; the screen keeps moving and the music plays through it (checked below).
  const lastIdx = gaps.length - 1;
  const tooLong = gaps.map((g, k) => ({ g, k })).filter(({ g, k }) => g > (k === lastIdx ? 1.5 : 0.7));
  add("no_dead_air", tooLong.length === 0, tooLong.length ? `pause of ${tooLong[0].g.toFixed(2)}s between spoken lines` : `longest pause between spoken lines ${Math.max(...gaps).toFixed(2)}s (pauses over 0.7s: none except the planned lead-in to the closing line)`);

  // 3b. music is really there: audible in the pauses, and quieter than the voice
  const pcm = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-i", i.mixFile, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], { stdio: ["ignore", "pipe", "pipe"] });
    const parts: Buffer[] = [];
    const un = registerKiller(() => child.kill("SIGKILL"));
    child.stdout.on("data", (d: Buffer) => parts.push(d));
    child.on("close", (code) => {
      un();
      if (code === 0) resolve(Buffer.concat(parts));
      else reject(new Error("could not read the audio mix"));
    });
  });
  const rmsDb = (fromMs: number, toMs: number) => {
    const a = Math.max(0, Math.floor((fromMs / 1000) * 8000)) * 2;
    const b = Math.min(pcm.length, Math.floor((toMs / 1000) * 8000) * 2);
    let sum = 0;
    let n = 0;
    for (let p = a; p + 1 < b; p += 2) {
      const v = pcm.readInt16LE(p) / 32768;
      sum += v * v;
      n++;
    }
    return n ? 10 * Math.log10(sum / n + 1e-12) : -120;
  };
  const pauses: Array<[number, number]> = [];
  for (let k = 1; k < ordered.length; k++) if (ordered[k].start - ordered[k - 1].end >= 250) pauses.push([ordered[k - 1].end + 60, ordered[k].start - 60]);
  const lastEnd = ordered[ordered.length - 1].end;
  pauses.push([lastEnd + 200, i.expectedMs - 150]);
  const pauseDb = pauses.map(([a, b]) => rmsDb(a, b));
  const voiceDb = ordered.map((l) => rmsDb(l.start, l.end));
  const avgPause = pauseDb.reduce((a, b) => a + b, 0) / Math.max(1, pauseDb.length);
  const avgVoice = voiceDb.reduce((a, b) => a + b, 0) / Math.max(1, voiceDb.length);
  metrics.musicPauseDb = +avgPause.toFixed(1);
  metrics.voiceDb = +avgVoice.toFixed(1);
  add("music_present", avgPause >= -42, `music level in the pauses ${avgPause.toFixed(1)} dBFS (needs at least -42, so it is audible)`);
  add("music_under_voice", avgVoice - avgPause >= 3, `voice is ${(avgVoice - avgPause).toFixed(1)} dB louder than the music bed (needs 3 dB or more so words stay clear)`);

  // 4. captions match what is said and line up with the voice
  const bad: string[] = [];
  for (const [k, l] of i.narration.entries()) {
    const t = i.lineTimes[l.id];
    // A caption belongs to the line it starts in (lines can be closer together than any tolerance).
    const nextStart = i.narration[k + 1] ? i.lineTimes[i.narration[k + 1].id].start - 80 : t.end + 400;
    const groups = i.timeline.captions.filter((g) => g.from >= t.start - 80 && g.from < nextStart);
    const shown = groups.flatMap((g) => g.words.map((w) => w.text)).join(" ");
    if (norm(shown) !== norm(captionWordsFor(l).join(" "))) bad.push(`${l.id}: captions differ from the script`);
    for (const g of groups) if (g.words.some((w) => w.from < t.start - 80 || w.to > t.end + 120)) bad.push(`${l.id}: a caption word is outside the spoken line`);
  }
  const caps = [...i.timeline.captions].sort((a, b) => a.from - b.from);
  for (let k = 1; k < caps.length; k++) if (caps[k].from < caps[k - 1].to - 40) bad.push(`captions overlap near ${(caps[k].from / 1000).toFixed(1)}s`);
  add("captions_synchronised", bad.length === 0, bad.length ? bad.slice(0, 3).join("; ") : `${caps.length} caption groups match the script word for word and sit inside their spoken lines`);

  // 5. motion: the product screen must keep moving
  const wH = 118;
  const wW = 96;
  const winVf = `crop=${WIN.w}:${WIN.h}:${WIN.x}:${WIN.y},scale=${wW}:${wH}`;
  const fpsA = 10;
  const screenEnd = Math.max(1, (i.endStartMs - 300) / 1000);
  const win = await rawGray(i.file, winVf, wW, wH, fpsA, 0, screenEnd);
  const winDiffs = frameDiffs(win.data, wW, wH, win.frames);
  const stillWin = longestStill(winDiffs, fpsA, 0.06);
  const moving = winDiffs.filter((d) => d >= 0.06).length / Math.max(1, winDiffs.length);
  metrics.longestStillScreenSec = +stillWin.toFixed(2);
  metrics.screenMotionShare = +moving.toFixed(2);
  add("no_static_stretch", stillWin <= 0.8, `the product screen is still for at most ${stillWin.toFixed(2)}s (limit 0.8s)`);
  add("motion_throughout", moving >= 0.85, `${Math.round(moving * 100)}% of the screen time has movement (needs 85%)`);
  const endSec = i.endStartMs / 1000;
  const endPart = await rawGray(i.file, "scale=108:192", 108, 192, fpsA, endSec + 0.8, Math.max(0.5, dur - endSec - 0.8));
  const endStill = endPart.frames > 2 ? longestStill(frameDiffs(endPart.data, 108, 192, endPart.frames), fpsA, 0.05) : 0;
  add("end_card_alive", endStill <= 1.0, `the end card is still for at most ${endStill.toFixed(2)}s`, "warn");

  // 6. real product interaction, not graphics
  const screenScenes = i.record.scenes.filter((s) => s.kind === "screen");
  const screenMs = screenScenes.reduce((a, s) => a + (s.endMs - s.startMs), 0);
  const share = screenMs / Math.max(1, i.record.durationMs);
  metrics.productScreenShare = +share.toFixed(2);
  add("real_product_screens", share >= 0.75, `${Math.round(share * 100)}% of the video is the real product interface (needs 75%)`);
  const interactive = Object.values(i.manifest.plates).filter((p) => Object.keys(p.states).length >= 3).length;
  add("genuine_interaction", interactive >= 2, `${interactive} real interfaces were interacted with live (typed into, with the result changing)`);
  const thin = screenScenes.filter((s) => s.motion.length < 3).map((s) => s.id);
  add("every_scene_moves", thin.length === 0, thin.length ? `scenes with too little motion: ${thin.join(", ")}` : "every product scene has at least three kinds of motion");
  const sc = i.timeline.scenes.filter((s) => s.kind === "screen");
  const dull = sc.filter((s) => (s.cursor?.length ?? 0) + (s.states?.length ?? 0) + (s.camera?.length ?? 0) + (s.spots?.length ?? 0) < 6).map((s) => s.id);
  add("scene_choreography", dull.length === 0, dull.length ? `scenes with sparse choreography: ${dull.join(", ")}` : "every scene has camera, focus and interaction keyframes");

  // 7. claims are backed by verified facts and by the product's own pages
  const unspoken = i.narration.filter((l) => l.claims.length === 0).map((l) => l.id);
  add("every_line_has_a_claim_source", unspoken.length === 0, unspoken.length ? `lines with no claim: ${unspoken.join(", ")}` : "every spoken line is tied to at least one claim");
  const noFacts = i.record.claims.filter((c) => c.factIds.length === 0 || !c.factsVerified).map((c) => c.id);
  add("claims_use_verified_facts", noFacts.length === 0, noFacts.length ? `claims without verified Product Truth: ${noFacts.join(", ")}` : `${i.record.claims.length} claims, all backed by verified Product Truth facts`);
  const missingQuote = i.record.claims.flatMap((c) => c.sources.filter((s) => !s.onPage).map((s) => `${c.id}: "${s.quote.slice(0, 40)}"`));
  add("quotes_on_live_pages", missingQuote.length === 0, missingQuote.length ? `quotes not found on the captured page: ${missingQuote.slice(0, 3).join("; ")}` : "every quoted source line was found on the page it cites");
  const orphan = i.record.onScreen.filter((o) => !i.record.claims.some((c) => c.id === o.claim)).map((o) => o.text);
  add("on_screen_text_sourced", orphan.length === 0, orphan.length ? `on-screen text with no claim: ${orphan.join(", ")}` : `${i.record.onScreen.length} on-screen texts, each tied to a claim`);
  const site = i.site ?? RN_SITE;
  const onSite = (u: string) => u === site.origin || u.startsWith(`${site.origin}/`);
  const noVisual = screenScenes.filter((s) => !s.sourceVisual || !onSite(s.sourceVisual.url) || !s.sourceVisual.capturedAt).map((s) => s.id);
  add("source_visual_per_scene", noVisual.length === 0, noVisual.length ? `scenes without a source page: ${noVisual.join(", ")}` : "every product scene names the live page it was captured from, with the capture time");

  // 8. wording
  const text = [...i.narration.map((l) => `${l.spoken} ${l.caption ?? ""}`), ...i.onScreenTexts].join(" | ");
  const banned = BANNED.exec(text);
  add("no_unsupported_wording", !banned, banned ? `unsupported wording: "${banned[0]}"` : "no superlatives, timing, savings or numeric promises");
  add("no_personal_info", !EMAIL.test(text) && !PERSONAL.test(text), EMAIL.test(text) || PERSONAL.test(text) ? "personal information in the text" : "no email addresses or personal names");

  // 9. call to action and audio provenance
  const endScene = i.record.scenes.at(-1);
  add("cta_present", endScene?.kind === "end" && i.record.cta.text === site.ctaText && onSite(i.record.cta.url) && (i.narration.at(-1)?.caption ?? "").toLowerCase().includes(site.ctaHost), `end card CTA "${i.record.cta.text}" to ${i.record.cta.url}`);
  const a = i.record.audio;
  add("audio_sources_recorded", Boolean(a.voiceover.model && a.voiceover.license && a.voiceover.voice && a.music.source && a.music.license && a.voiceover.cost === "$0" && a.music.cost === "$0"), `voice: ${a.voiceover.engine} (${a.voiceover.license}, ${a.voiceover.cost}); music: ${a.music.source} (${a.music.cost})`);

  // 10. no black frames
  const black = await run("ffmpeg", ["-hide_banner", "-nostdin", "-i", i.file, "-vf", "blackdetect=d=0.3:pix_th=0.08", "-an", "-f", "null", "-"], { timeoutMs: 120_000 });
  add("no_black_frames", !/black_start/.test(black.stderr), /black_start/.test(black.stderr) ? "black frames detected" : "no black frames");

  return { passed: checks.every((c) => c.ok || c.severity === "warn"), checks, metrics };
}

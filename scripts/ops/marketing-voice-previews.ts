// Makes the short preview of every offered voice, once: the audio the settings page plays, plus a plain description of each voice taken from MEASURING that audio (pitch and pace).
// $0: the same offline Kokoro engine the videos use. Previews are generic so they never need regenerating per customer; they live in <media>/previews and are served only to signed-in users.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-voice-previews.ts
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { STUDIO_DIRS, STUDIO_TTS_DIR } from "../../src/lib/marketing-studio/config";
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { setSetting } from "../../src/lib/marketing-studio/runtime";
import { synthesizeLines, writeWav } from "../../src/lib/marketing-studio/video/demo/audio";
import { describeVoice, measureVoice } from "../../src/lib/marketing-studio/video/voice-analysis";
import { OFFERED_VOICES, PREVIEW_CATALOG_KEY, TONES } from "../../src/lib/marketing-studio/video/voices";

const TEXT = "Hi, this is how your videos will sound. Short, clear and easy to follow, from the first second to the last.";

async function main() {
  const db = requireStudioDb();
  const out = path.join(STUDIO_DIRS.media, "previews");
  const work = path.join(STUDIO_DIRS.tmp, `voice-previews-${Date.now()}`);
  await fs.mkdir(out, { recursive: true });
  await fs.mkdir(work, { recursive: true });
  const styles: Record<string, string> = {};
  for (const v of OFFERED_VOICES) {
    const [line] = await synthesizeLines([{ id: v.id, text: TEXT }], { ttsDir: STUDIO_TTS_DIR, voice: v.id, speed: TONES.conversational.speed, tmpDir: path.join(work, v.id) });
    const wav = path.join(work, `${v.id}.wav`);
    await writeWav(wav, [line.samples], line.rate);
    const mp3 = path.join(out, `${v.id}.mp3`);
    const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "96k", mp3], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`could not encode ${v.id}: ${r.stderr}`);
    const m = measureVoice(line.samples, line.rate, TEXT.split(/\s+/).length);
    styles[v.id] = describeVoice(m);
    console.log(`${v.id}: pitch ${m.pitchHz ?? "n/a"} Hz, ${m.wordsPerSec} words/s, ${m.speechSec}s -> ${styles[v.id]}`);
  }
  await setSetting(PREVIEW_CATALOG_KEY, styles, "voice-previews", db, { audited: false });
  await fs.rm(work, { recursive: true, force: true });
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());

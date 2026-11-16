// Makes the preview of every GAME voice at every energy level, once: the audio the game setup page plays (a voice reading a game line at that energy), and prints what each one MEASURES
// (words per second, pitch movement) so the energy thresholds of the game QA rest on real numbers. $0: the offline Kokoro engine the videos use.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-game-voice-previews.ts
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { STUDIO_DIRS, STUDIO_TTS_DIR } from "../../src/lib/marketing-studio/config";
import { synthesizeLines, writeWav } from "../../src/lib/marketing-studio/video/demo/audio";
import { measureVoice, pitchSpread } from "../../src/lib/marketing-studio/video/voice-analysis";
import { ENERGIES } from "../../src/lib/marketing-studio/video/game/profile";
import { ENERGY_SPEED, GAME_VOICE_IDS } from "../../src/lib/marketing-studio/video/game/script";

const LINES = ["Okay, watch this one.", "Look how fast it all comes together!", "Hold on, this is getting tight.", "Boom! Now that is satisfying."];

async function main() {
  const out = path.join(STUDIO_DIRS.media, "previews");
  const work = path.join(STUDIO_DIRS.tmp, `game-voice-previews-${Date.now()}`);
  await fs.mkdir(out, { recursive: true });
  await fs.mkdir(work, { recursive: true });
  const rows: string[] = [];
  for (const voice of GAME_VOICE_IDS) {
    for (const energy of ENERGIES) {
      const lines = await synthesizeLines(LINES.map((text, k) => ({ id: `${voice}${k}`, text })), { ttsDir: STUDIO_TTS_DIR, voice, speed: ENERGY_SPEED[energy], tmpDir: path.join(work, `${voice}-${energy}`) });
      const rate = lines[0].rate;
      const all = new Float32Array(lines.reduce((n, l) => n + l.samples.length + Math.round(rate * 0.3), 0));
      let off = 0;
      for (const l of lines) {
        all.set(l.samples, off);
        off += l.samples.length + Math.round(rate * 0.3);
      }
      const wav = path.join(work, `${voice}-${energy}.wav`);
      await writeWav(wav, [all], rate);
      const mp3 = path.join(out, `game-${voice}-${energy}.mp3`);
      const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "96k", mp3], { encoding: "utf8" });
      if (r.status !== 0) throw new Error(`could not encode ${voice} ${energy}: ${r.stderr}`);
      const speech = new Float32Array(lines.reduce((n, l) => n + l.samples.length, 0));
      let o2 = 0;
      for (const l of lines) {
        speech.set(l.samples, o2);
        o2 += l.samples.length;
      }
      const m = measureVoice(speech, rate, LINES.join(" ").split(/\s+/).length);
      rows.push(`${voice.padEnd(11)} ${energy.padEnd(15)} ${m.wordsPerSec.toFixed(2)} words/s  pitch ${m.pitchHz ?? "n/a"} Hz  spread ${pitchSpread(speech, rate) ?? "n/a"} semitones`);
    }
  }
  console.log(rows.join("\n"));
  await fs.rm(work, { recursive: true, force: true });
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });

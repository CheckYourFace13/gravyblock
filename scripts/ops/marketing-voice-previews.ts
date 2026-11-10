// Renders a short preview WAV of every offered free voice (and tone) so a customer can hear a voice before choosing it. $0: the same offline Kokoro engine the videos use.
// Writes to the Studio temp folder, never to the media root; previews are disposable and cleaned up with the other temporary files.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-voice-previews.ts "<Brand name>" [tone]
import { promises as fs } from "node:fs";
import path from "node:path";
import { STUDIO_DIRS, STUDIO_TTS_DIR } from "../../src/lib/marketing-studio/config";
import { synthesizeLines, writeWav } from "../../src/lib/marketing-studio/video/demo/audio";
import { OFFERED_VOICES, previewText, TONES, type ToneKey } from "../../src/lib/marketing-studio/video/voices";

async function main() {
  const brand = process.argv[2] ?? "your brand";
  const tone = (process.argv[3] ?? "conversational") as ToneKey;
  if (!(tone in TONES)) throw new Error(`tone must be one of ${Object.keys(TONES).join(", ")}`);
  const out = path.join(STUDIO_DIRS.tmp, `voice-previews-${Date.now()}`);
  await fs.mkdir(out, { recursive: true });
  for (const v of OFFERED_VOICES) {
    const [line] = await synthesizeLines([{ id: v.id, text: previewText(brand) }], { ttsDir: STUDIO_TTS_DIR, voice: v.id, speed: TONES[tone].speed, tmpDir: path.join(out, "work") });
    const file = path.join(out, `${v.id}.wav`);
    await writeWav(file, [line.samples], line.rate);
    console.log(`${v.label} (${v.accent}, ${v.gender}): ${file}`);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });

// Runs the Kokoro voice in its OWN short-lived process. The model needs about 450 MB while it works, and the Studio worker runs under a 768 MB
// memory cap, so the voice must finish and exit (releasing that memory) before the video is rendered. Input arrives as JSON on stdin; each line is
// written as raw 32-bit float samples to a file, and the result list is printed as JSON. It never sees database credentials or any other secret.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const raw = await new Promise((resolve) => {
  let s = "";
  process.stdin.on("data", (d) => (s += d));
  process.stdin.on("end", () => resolve(s));
});
const req = JSON.parse(raw);
const mod = await import(pathToFileURL(path.join(req.ttsDir, "node_modules", "kokoro-js", "dist", "kokoro.js")).href);
const tts = await mod.KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
const out = [];
for (const line of req.lines) {
  const a = await tts.generate(line.text, { voice: req.voice, speed: req.speed });
  const file = path.join(req.outDir, `${line.id}.f32`);
  fs.writeFileSync(file, Buffer.from(a.audio.buffer, a.audio.byteOffset, a.audio.byteLength));
  out.push({ id: line.id, rate: a.sampling_rate, file, samples: a.audio.length });
}
process.stdout.write(JSON.stringify(out));

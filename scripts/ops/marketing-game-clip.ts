// Cuts ONE game video through the permanent Game pipeline (library sequences, the game's own narration, the full game QA, the logo check) and writes the mp4. It renders only: it uploads nothing,
// emails nothing, publishes nothing. For looking at what the pipeline makes without touching the queue.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-game-clip.ts <slug> <format> [--variant n]
import { closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { GAME_FORMATS, type GameFormat } from "../../src/lib/marketing-studio/video/game/engine";
import { makeGameClip } from "../../src/lib/marketing-studio/video/game/clip";
import { sessionDirFor } from "../../src/lib/marketing-studio/video/game/capture-sources";

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--") && !/^\d+$/.test(a));
  const [slug, format] = args as [string, GameFormat];
  if (!slug || !(format in GAME_FORMATS)) throw new Error(`usage: <slug> <${Object.keys(GAME_FORMATS).join("|")}> [--variant n]`);
  const variant = process.argv.includes("--variant") ? Number(process.argv[process.argv.indexOf("--variant") + 1]) : 0;
  const db = requireStudioDb();
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === slug);
  if (!product) throw new Error(`${slug} is not a Studio product`);
  const made = await makeGameClip(db, product, format, { sessionDir: sessionDirFor(slug), variant, log: (m) => console.log(m) });
  if (!made.ok) {
    console.log(`GAME QA: FAIL (${made.failure}): ${made.reason}`);
    process.exitCode = 2;
    return;
  }
  console.log(JSON.stringify({ file: made.file, seconds: +(made.durationMs / 1000).toFixed(1), bytes: made.bytes, format, spans: made.spans, gameQa: "PASS", logo: made.logo.ok ? "PASS" : "FAIL", lines: made.clip.script?.map((l) => l.text) }));
  if (!made.logo.ok) process.exitCode = 3;
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => closeStudioDb());

// Read-only audit of the audio in recent review videos: is narration expected, is there an audio stream, and is the voice really audible in the final file.
//   runuser -u gbstudio -- npx tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-voice-audit.ts [days]
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { desc, eq, gte } from "drizzle-orm";
import { readAssetBytes } from "../../src/lib/marketing-studio/creative/context";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { narrationExpected } from "../../src/lib/marketing-studio/video/game/engine";
import { narrationAudible } from "../../src/lib/marketing-studio/video/voice-audible";

type SB = { kind?: string; specId?: string; transcript?: Array<{ startMs: number; endMs: number }>; gameClip?: { audio?: string; format?: string; voiceLines?: Array<{ startMs: number; endMs: number }> } };

async function main() {
  const days = Number(process.argv[2] ?? 14);
  const db = requireStudioDb();
  const products = new Map((await db.select().from(ms.msProducts)).map((p) => [p.id, p.slug]));
  const rows = await db.select().from(ms.msVideos).where(gte(ms.msVideos.createdAt, new Date(Date.now() - days * 86_400_000))).orderBy(desc(ms.msVideos.createdAt));
  const dir = await mkdtemp(path.join(os.tmpdir(), "voice-audit-"));
  try {
    for (const v of rows) {
      if (!v.assetId || !["approved", "ready_for_review"].includes(v.status)) continue;
      const sb = v.storyboard as SB;
      const [asset] = await db.select().from(ms.msAssets).where(eq(ms.msAssets.id, v.assetId));
      if (!asset) continue;
      const isGame = sb.kind === "game";
      const expected = isGame ? narrationExpected((sb.gameClip?.audio ?? "gameplay_audio_music_captions") as never) : true;
      const lines = isGame ? (sb.gameClip?.voiceLines ?? []) : (sb.transcript ?? []);
      const file = path.join(dir, `${v.id}.mp4`);
      try {
        await writeFile(file, await readAssetBytes(asset));
      } catch {
        continue;
      }
      const a = await narrationAudible(file, lines);
      console.log([v.id.slice(0, 8), products.get(v.productId), isGame ? `game:${sb.gameClip?.format}:${sb.gameClip?.audio}` : "demo", `expected=${expected ? "YES" : "NO"}`, `present=${a.audible ? "YES" : "NO"}`, `lines=${lines.length}`, a.reason].join(" | "));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
    await closeStudioDb();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});

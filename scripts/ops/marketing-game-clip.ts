// Cuts ONE fun-first game clip from a stored REAL gameplay session, runs the game QA and the logo check, and writes the mp4 for review. It renders only: it uploads nothing, emails nothing,
// publishes nothing (games stay held until a verified store listing exists).
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-game-clip.ts <slug> <format> [--dir <session dir>]
import { promises as fs } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getBrandKit } from "../../src/lib/marketing-studio/brand/brand-kit";
import { STUDIO_DIRS } from "../../src/lib/marketing-studio/config";
import { readAssetBytes } from "../../src/lib/marketing-studio/creative/context";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { GAME_AUDIO_MODES, GAME_FORMATS, gameFunChecks, pickHighlights, type GameClip, type GameFormat, type GameMoment } from "../../src/lib/marketing-studio/video/game/engine";
import { detectMoments, spansOf, type SessionFrame, type SessionLog } from "../../src/lib/marketing-studio/video/game/moments";
import { gameLogoCheck, renderGameClip } from "../../src/lib/marketing-studio/video/game/render";

const CAPTIONS: Record<GameFormat, string | null> = { gameplay_hook: null, challenge: "CAN YOU BEAT THIS?", progression: "EASY. THEN HARDER.", reward_unlock: "WHAT DO YOU UNLOCK?", mechanic_spotlight: "CUT IT. FILL IT.", variety_montage: "EVERY LEVEL IS DIFFERENT", short_form: "ONE MORE TRY" };

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [slug, format] = args as [string, GameFormat];
  if (!slug || !(format in GAME_FORMATS)) throw new Error(`usage: <slug> <${Object.keys(GAME_FORMATS).join("|")}> [--dir <session dir>]`);
  const dirArg = process.argv.includes("--dir") ? process.argv[process.argv.indexOf("--dir") + 1] : null;
  const sessionDir = dirArg ?? path.join(STUDIO_DIRS.root, "captures", slug);
  const db = requireStudioDb();
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === slug);
  if (!product) throw new Error(`${slug} is not a Studio product`);
  const frames = JSON.parse(await fs.readFile(path.join(sessionDir, "frames.json"), "utf8")) as SessionFrame[];
  const log = JSON.parse(await fs.readFile(path.join(sessionDir, "log.json"), "utf8")) as SessionLog[];
  const moments = detectMoments(frames, log);
  const kinds = moments.reduce<Record<string, number>>((m, x) => ((m[x.kind] = (m[x.kind] ?? 0) + 1), m), {});
  console.log(`session: ${frames.length} real frames, ${log.length} HUD samples, moments ${JSON.stringify(kinds)}`);

  const spec = GAME_FORMATS[format];
  const maxMs = (spec.maxSeconds - 2) * 1000;
  // the best real moments for the format, grouped into continuous footage; the format's own required moments are always kept
  const chosen = pickHighlights(moments, format);
  const need = spec.needs.filter((k) => !chosen.some((m) => m.kind === k));
  for (const k of need) {
    const best = [...moments].filter((m) => m.kind === k && m.source === "real_capture").sort((a, b) => b.intensity - a.intensity)[0];
    if (best) chosen.push(best);
  }
  let spans = spansOf(chosen, 600).filter((s) => s.toMs - s.fromMs >= 900);
  // keep to the format's length: trim the weakest span's tail until it fits
  const total = () => spans.reduce((n, s) => n + (s.toMs - s.fromMs), 0);
  while (total() > maxMs && spans.length) {
    const longest = spans.reduce((a, b) => (b.toMs - b.fromMs > a.toMs - a.fromMs ? b : a));
    longest.toMs = Math.max(longest.fromMs + 900, longest.toMs - (total() - maxMs));
    if (total() > maxMs && spans.length > 1) spans = spans.filter((s) => s !== spans.reduce((a, b) => (b.moments.reduce((n, m) => n + m.intensity, 0) < a.moments.reduce((n, m) => n + m.intensity, 0) ? b : a)));
    else break;
  }
  if (!spans.length) throw new Error("no real moments are strong enough for this format");

  // the clip as the QA sees it: moments re-timed to the clip, inside their spans
  let offset = 0;
  const clipMoments: GameMoment[] = [];
  for (const s of spans) {
    // every real moment inside the footage counts, not just the ones that picked it
    for (const m of moments.filter((x) => x.endMs > s.fromMs && x.startMs < s.toMs)) {
      const a = Math.max(m.startMs, s.fromMs);
      const b = Math.min(m.endMs, s.toMs);
      if (b > a) clipMoments.push({ ...m, startMs: offset + (a - s.fromMs), endMs: offset + (b - s.fromMs) });
    }
    offset += s.toMs - s.fromMs;
  }
  const audio = GAME_AUDIO_MODES[format][0];
  const clip: GameClip = { game: slug, format, moments: clipMoments, durationMs: offset, audio, narrationWords: 0, vertical: true };
  const checks = gameFunChecks(clip);
  for (const c of checks) console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.id}: ${c.detail}`);
  if (checks.some((c) => !c.ok)) {
    console.log("GAME QA: FAIL, not rendered");
    process.exitCode = 2;
    return;
  }

  const kit = await getBrandKit(db, product.id);
  const logo = kit?.logos[0];
  if (!logo) throw new Error("NEEDS BRAND ASSET: no approved logo on file");
  const [asset] = await db.select().from(ms.msAssets).where(eq(ms.msAssets.id, logo.assetId));
  const bytes = await readAssetBytes(asset);
  const work = path.join(STUDIO_DIRS.tmp, `game-clip-${slug}-${format}-${Date.now()}`);
  await fs.mkdir(work, { recursive: true });
  const logoFile = path.join(work, `logo${path.extname(asset.storagePath) || ".png"}`);
  await fs.writeFile(logoFile, bytes);
  const outDir = path.join(STUDIO_DIRS.media, "game-proofs");
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `${slug}-${format}-${Date.now()}.mp4`);
  const cap = CAPTIONS[format];
  const rendered = await renderGameClip({
    sessionDir,
    frames,
    spans: spans.map((s, k) => ({ from: s.fromMs / 1000, to: s.toMs / 1000, ...(k === 0 && cap ? { caption: cap } : {}) })),
    outFile,
    workDir: work,
    logoFile,
    logoSize: { w: asset.width ?? logo.width, h: asset.height ?? logo.height },
    brand: { dark: "#101018", accent: "#f5b301" },
    endHeadline: kit?.approvedName ?? product.name,
    music: { bpm: 128, chords: [{ root: 48, notes: [60, 64, 67] }, { root: 43, notes: [55, 59, 62] }, { root: 45, notes: [57, 60, 64] }, { root: 41, notes: [53, 57, 60] }] },
  });
  const lc = await gameLogoCheck(rendered.file, rendered.endCard.fromSec, rendered.logoBox, bytes, { w: asset.width ?? logo.width, h: asset.height ?? logo.height }, work);
  console.log(`logo integrity: ${lc.ok ? "PASS" : "FAIL"} (mean ${lc.mean}/255, strong ${lc.strongShare})`);
  const st = await fs.stat(rendered.file);
  console.log(JSON.stringify({ file: rendered.file, seconds: +(rendered.durationMs / 1000).toFixed(1), bytes: st.size, format, spans: spans.length, gameQa: "PASS", logo: lc.ok ? "PASS" : "FAIL" }));
  await fs.rm(work, { recursive: true, force: true });
  if (!lc.ok) process.exitCode = 3;
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => closeStudioDb());

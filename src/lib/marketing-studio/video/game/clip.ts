/**
 * Cuts one fun-first game clip from a stored REAL gameplay session. Shared by the automatic game production job and the operator CLI. It chooses the strongest real moments for the format,
 * avoids levels that earlier clips of the same game already used (so videos are genuinely different), runs the game QA (real gameplay only, action at once, no dead time, payoff) and,
 * only if that passes, renders and checks the logo. It never fabricates a frame and never uploads anything.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getBrandKit } from "../../brand/brand-kit";
import { STUDIO_DIRS } from "../../config";
import { readAssetBytes } from "../../creative/context";
import { ms, type StudioDb } from "../../db";
import { GAME_AUDIO_MODES, GAME_FORMATS, gameFunChecks, pickHighlights, type GameCheck, type GameClip, type GameFormat, type GameMoment } from "./engine";
import { detectMoments, spansOf, type SessionFrame, type SessionLog } from "./moments";
import { gameLogoCheck, renderGameClip } from "./render";

export const CAPTIONS: Record<GameFormat, string | null> = { gameplay_hook: null, challenge: "CAN YOU BEAT THIS?", progression: "EASY. THEN HARDER.", reward_unlock: "WHAT DO YOU UNLOCK?", mechanic_spotlight: "ONE SATISFYING MOVE.", variety_montage: "SO MANY STAGES.", short_form: "ONE MORE TRY?" };

export type GameClipResult =
  | { ok: false; reason: string; checks: GameCheck[] }
  | { ok: true; file: string; durationMs: number; bytes: number; clip: GameClip; checks: GameCheck[]; logo: { ok: boolean; mean: number; strongShare: number }; spans: number; workDir: string };

/** Pure: the moments to choose from. Levels earlier clips used are set aside when what is left can still make the format; otherwise everything is allowed and the distinctness gate decides. */
export function momentsFor(moments: GameMoment[], format: GameFormat, usedLevels: ReadonlySet<string>): GameMoment[] {
  const spec = GAME_FORMATS[format];
  const fresh = moments.filter((m) => !usedLevels.has(m.level));
  const levels = new Set(fresh.filter((m) => m.source === "real_capture").map((m) => m.level));
  const hasNeeds = spec.needs.every((k) => fresh.some((m) => m.kind === k));
  return hasNeeds && levels.size >= spec.minLevels ? fresh : moments;
}

export async function makeGameClip(db: StudioDb, product: { id: string; slug: string; name: string }, format: GameFormat, o: { sessionDir: string; usedLevels?: ReadonlySet<string>; log?: (m: string) => void }): Promise<GameClipResult> {
  const log = o.log ?? (() => {});
  const frames = JSON.parse(await fs.readFile(path.join(o.sessionDir, "frames.json"), "utf8")) as SessionFrame[];
  const sessionLog = (await fs.readFile(path.join(o.sessionDir, "log.json"), "utf8").then((t) => JSON.parse(t) as SessionLog[]).catch(() => [])) as SessionLog[];
  // a session may carry its own moments (a game whose capture reports events rather than a HUD log); otherwise they are read from the HUD log
  const stored = await fs.readFile(path.join(o.sessionDir, "moments.json"), "utf8").then((t) => JSON.parse(t) as GameMoment[]).catch(() => null);
  const all = stored ?? detectMoments(frames, sessionLog);
  const kinds = all.reduce<Record<string, number>>((m, x) => ((m[x.kind] = (m[x.kind] ?? 0) + 1), m), {});
  log(`session: ${frames.length} real frames, ${sessionLog.length} HUD samples, moments ${JSON.stringify(kinds)}`);
  const moments = momentsFor(all, format, o.usedLevels ?? new Set());

  const spec = GAME_FORMATS[format];
  const maxMs = (spec.maxSeconds - 2) * 1000;
  const chosen = pickHighlights(moments, format);
  for (const k of spec.needs.filter((k) => !chosen.some((m) => m.kind === k))) {
    const best = [...moments].filter((m) => m.kind === k && m.source === "real_capture").sort((a, b) => b.intensity - a.intensity)[0];
    if (best) chosen.push(best);
  }
  let spans = spansOf(chosen, 600).filter((s) => s.toMs - s.fromMs >= 900);
  const total = () => spans.reduce((n, s) => n + (s.toMs - s.fromMs), 0);
  while (total() > maxMs && spans.length) {
    const longest = spans.reduce((a, b) => (b.toMs - b.fromMs > a.toMs - a.fromMs ? b : a));
    longest.toMs = Math.max(longest.fromMs + 900, longest.toMs - (total() - maxMs));
    if (total() > maxMs && spans.length > 1) spans = spans.filter((s) => s !== spans.reduce((a, b) => (b.moments.reduce((n, m) => n + m.intensity, 0) < a.moments.reduce((n, m) => n + m.intensity, 0) ? b : a)));
    else break;
  }
  if (!spans.length) return { ok: false, reason: "no real moments are strong enough for this format", checks: [] };

  let offset = 0;
  const clipMoments: GameMoment[] = [];
  for (const s of spans) {
    for (const m of all.filter((x) => x.endMs > s.fromMs && x.startMs < s.toMs)) {
      const a = Math.max(m.startMs, s.fromMs);
      const b = Math.min(m.endMs, s.toMs);
      if (b > a) clipMoments.push({ ...m, startMs: offset + (a - s.fromMs), endMs: offset + (b - s.fromMs) });
    }
    offset += s.toMs - s.fromMs;
  }
  const clip: GameClip = { game: product.slug, format, moments: clipMoments, durationMs: offset, audio: GAME_AUDIO_MODES[format][0], narrationWords: 0, vertical: true };
  const checks = gameFunChecks(clip);
  checks.forEach((c) => log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.id}: ${c.detail}`));
  if (checks.some((c) => !c.ok)) return { ok: false, reason: `game QA: ${checks.filter((c) => !c.ok).map((c) => `${c.id} (${c.detail})`).join("; ")}`, checks };

  const kit = await getBrandKit(db, product.id);
  const logo = kit?.logos[0];
  if (!logo) throw new Error("NEEDS BRAND ASSET: no approved logo on file");
  const [asset] = await db.select().from(ms.msAssets).where(eq(ms.msAssets.id, logo.assetId));
  const bytes = await readAssetBytes(asset);
  const work = path.join(STUDIO_DIRS.tmp, `game-clip-${product.slug}-${format}-${Date.now()}`);
  await fs.mkdir(work, { recursive: true });
  const logoFile = path.join(work, `logo${path.extname(asset.storagePath) || ".png"}`);
  await fs.writeFile(logoFile, bytes);
  const outDir = path.join(STUDIO_DIRS.media, "game-proofs");
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `${product.slug}-${format}-${Date.now()}.mp4`);
  const cap = CAPTIONS[format];
  const size = { w: asset.width ?? logo.width, h: asset.height ?? logo.height };
  const rendered = await renderGameClip({
    sessionDir: o.sessionDir,
    frames,
    spans: spans.map((s, k) => ({ from: s.fromMs / 1000, to: s.toMs / 1000, ...(k === 0 && cap ? { caption: cap } : {}) })),
    outFile,
    workDir: work,
    logoFile,
    logoSize: size,
    brand: { dark: "#101018", accent: "#f5b301" },
    endHeadline: kit?.approvedName ?? product.name,
    music: { bpm: 128, chords: [{ root: 48, notes: [60, 64, 67] }, { root: 43, notes: [55, 59, 62] }, { root: 45, notes: [57, 60, 64] }, { root: 41, notes: [53, 57, 60] }] },
  });
  const lc = await gameLogoCheck(rendered.file, rendered.endCard.fromSec, rendered.logoBox, bytes, size, work);
  log(`logo integrity: ${lc.ok ? "PASS" : "FAIL"} (mean ${lc.mean}/255, strong ${lc.strongShare})`);
  const st = await fs.stat(rendered.file);
  await fs.rm(work, { recursive: true, force: true });
  return { ok: true, file: rendered.file, durationMs: rendered.durationMs, bytes: st.size, clip, checks, logo: lc, spans: spans.length, workDir: work };
}

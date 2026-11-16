/**
 * Cuts one game video from the game's REAL gameplay library, through the permanent Game pipeline: pick continuous sequences (never a shuffle of best moments) that no earlier video used, write
 * the game's own energetic narration for what is on screen, check the plan against the game QA BEFORE spending a render, render with the voice placed where it matters and the game's sound
 * kept, then check the finished file (frames, voice, balance, logo). It never fabricates a frame and never uploads anything. A failure says what to redo: footage, words or render.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getBrandKit, saveCanonicalLogo } from "../../brand/brand-kit";
import { canonicalizeLogo } from "../../brand/logo-integrity";
import { STUDIO_DIRS } from "../../config";
import { readAssetBytes } from "../../creative/context";
import { ms, type StudioDb } from "../../db";
import { judgeScreen, windowFrames } from "../screen-qa";
import { narrationAudible } from "../voice-audible";
import { GAME_FORMATS, type GameCheck, type GameClip, type GameFormat, type GameMoment } from "./engine";
import { loadSession, usageOf } from "./library";
import { getGameProfile, profileGaps, type GameProfile } from "./profile";
import { failureKind, gameVideoChecks, type FinalLine, type QaInput } from "./qa";
import { gameLogoCheck, renderGameClip, fitFootage } from "./render";
import { desiredStarts, gameVoiceFor, writeScript, type History } from "./script";
import { clipMomentsOf, pickSequences, DEAD_KINDS, SHAPES } from "./sequence";

/** Kept for the older tests and tools: short on-screen lines for a video with no voiceover. */
export const CAPTIONS: Record<GameFormat, string | null> = { gameplay_hook: null, how_you_play: null, challenge: "CAN YOU BEAT THIS?", progression: "EASY. THEN HARDER.", reward_unlock: "WHAT DO YOU UNLOCK?", mechanic_spotlight: "ONE SATISFYING MOVE.", character_collection: null, variety_montage: "SO MANY STAGES.", one_more_try: "ONE MORE TRY?", short_form: "ONE MORE TRY?" };

export type GameClipResult =
  | { ok: false; reason: string; checks: GameCheck[]; failure: "footage" | "script" | "render" | "setup" | null; levels?: string[]; needsMore?: boolean }
  | { ok: true; vertical: boolean; file: string; durationMs: number; bytes: number; clip: GameClip; checks: GameCheck[]; logo: { ok: boolean; mean: number; strongShare: number }; spans: number; workDir: string };

const levelOrder = (l: string) => (l === "Ldaily" ? 1000 : Number(l.replace(/\D/g, "")) || 0);

/**
 * Pure: the footage of the older level-window rule (kept for its tests and the operator tools): the moments of the first run of levels no earlier clip used that holds what the format needs.
 */
export function momentsFor(moments: GameMoment[], format: GameFormat, usedLevels: ReadonlySet<string>): GameMoment[] {
  const spec = GAME_FORMATS[format];
  const real = moments.filter((m) => m.source === "real_capture");
  const levels = [...new Set(real.filter((m) => !DEAD_KINDS.includes(m.kind)).map((m) => m.level))].sort((a, b) => levelOrder(a) - levelOrder(b));
  const need = Math.max(1, spec.minLevels);
  const windows = (pool: string[]) => (pool.length < need ? [] : Array.from({ length: pool.length - need + 1 }, (_, i) => pool.slice(i, i + need)));
  const holdsNeeds = (ls: string[]) => spec.needs.every((k) => real.some((m) => ls.includes(m.level) && m.kind === k));
  const pick = windows(levels.filter((l) => !usedLevels.has(l))).find(holdsNeeds) ?? windows(levels).find(holdsNeeds);
  return pick ? moments.filter((m) => pick.includes(m.level)) : moments;
}

/** Pure: what the game's earlier videos said and which profile values they used (the last two videos' values only, so a value comes back after a while). */
export function historyOf(prior: GameClip[]): History {
  const lines = prior.flatMap((c) => (c.script ?? []).map((l) => l.text));
  const uses = prior.slice(-2).flatMap((c) => (c.script ?? []).flatMap((l) => l.uses));
  return { lines, uses };
}

export type MakeOptions = {
  sessionDir: string;
  /** the clips of this game that were delivered (for history and footage) */
  prior?: GameClip[];
  /** older option: levels to avoid (used when no prior clips are given) */
  usedLevels?: ReadonlySet<string>;
  profile?: GameProfile;
  storeLive?: boolean;
  variant?: number;
  /** levels that already failed on an earlier attempt */
  skip?: ReadonlySet<string>;
  /** a voice and energy bump when the last attempt's voice was too flat */
  energyBoost?: number;
  log?: (m: string) => void;
};

export async function makeGameClip(db: StudioDb, product: { id: string; slug: string; name: string }, format: GameFormat, o: MakeOptions): Promise<GameClipResult> {
  const log = o.log ?? (() => {});
  const session = await loadSession(o.sessionDir);
  if (!session) return { ok: false, reason: "there is no captured gameplay to cut from", checks: [], failure: "footage", needsMore: true };
  const profile = o.profile ?? (await getGameProfile(db, product.id));
  const gaps = profileGaps(profile);
  if (gaps.length) return { ok: false, reason: `NEEDS GAME SETUP: the game profile still needs ${gaps.join(", ")}`, checks: [], failure: "setup" };
  const kinds = session.moments.reduce<Record<string, number>>((m, x) => ((m[x.kind] = (m[x.kind] ?? 0) + 1), m), {});
  log(`session ${session.meta.id}: ${session.frames.length} real frames, moments ${JSON.stringify(kinds)}`);

  const prior = o.prior ?? [];
  const usage = usageOf(prior);
  for (const l of o.usedLevels ?? []) usage.usedLevels.add(l);
  const spec = GAME_FORMATS[format];
  const shape = SHAPES[format];
  const budgetMs = profile.preferredSeconds ? Math.max(8000, (profile.preferredSeconds - 3) * 1000) : (spec.maxSeconds - 3) * 1000;
  const pick = pickSequences(session.moments, format, { sessionId: session.meta.id, usedLevels: usage.usedLevels, usedFootage: usage.usedFootage, skip: o.skip, variant: o.variant ?? 0, budgetMs, maxMsOverride: shape.spans === 1 ? budgetMs : undefined, hasCharacters: profile.characters.length > 0 });
  if (!pick.ok) return { ok: false, reason: pick.reason, checks: [], failure: "footage", needsMore: pick.needsMore };
  log(`${spec.label}: ${pick.spans.map((s) => `${s.level} ${(s.fromMs / 1000).toFixed(1)}-${(s.toMs / 1000).toFixed(1)}s`).join(", ")}${pick.reused.length ? ` (reuses ${pick.reused.join(", ")})` : ""}`);
  const cut = clipMomentsOf(session.moments, pick.spans);

  const source = { w: session.meta.width || 780, h: session.meta.height || 1688 };
  const portraitSource = source.h >= source.w;
  const vertical = profile.orientation === "portrait" ? true : profile.orientation === "landscape" ? false : portraitSource;
  const canvas = vertical ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };
  const narrated = profile.narrationDefault;
  const voice = gameVoiceFor({ voice: profile.voice, energy: profile.energy }, product.slug);
  const store = Boolean(o.storeLive);
  const lines = narrated ? writeScript({ format, profile, name: product.name, moments: cut.moments, durationMs: cut.durationMs, storeLive: store, history: historyOf(prior), variant: o.variant ?? 0 }) : [];
  const starts = desiredStarts(lines, cut.moments, cut.durationMs);
  // the words of a video without a voice: what the player is doing, on screen
  const captions = narrated ? [] : [profile.objective.toUpperCase()];
  const clip: GameClip = {
    game: product.slug,
    format,
    moments: cut.moments,
    durationMs: cut.durationMs,
    audio: narrated ? "short_energetic_narration" : "gameplay_audio_music_captions",
    narrationWords: lines.join(" ").split(/\s+/).filter(Boolean).length,
    vertical,
    footage: pick.spans.map((s) => ({ sessionId: session.meta.id, level: s.level, fromMs: s.fromMs, toMs: s.toMs })),
    script: lines.map((l) => ({ text: l.text, slot: l.slot, uses: l.uses })),
  };
  const drawn = fitFootage(source, canvas, vertical);
  const common: Omit<QaInput, "lines" | "voice" | "voiceOverBedDb" | "planOnly"> = { format, clip, spans: pick.spans, profile, narrated, captions, gameplayEndMs: cut.durationMs, canvas, source, drawn, prior, unusedLevels: [...new Set(session.moments.filter((m) => !DEAD_KINDS.includes(m.kind)).map((m) => m.level))].filter((l) => !usage.usedLevels.has(l)).length, levelUses: usage.levelUses };
  // the plan is checked before a render is spent: footage, words, framing
  const planned: FinalLine[] = lines.map((l, k) => ({ ...l, startMs: starts[k], endMs: starts[k] + Math.max(1200, l.text.split(/\s+/).length * 300) }));
  const planChecks = gameVideoChecks({ ...common, lines: planned, voice: null, voiceOverBedDb: null, planOnly: true });
  planChecks.forEach((c) => !c.ok && log(`  PLAN FAIL  ${c.id}: ${c.detail}`));
  if (planChecks.some((c) => !c.ok)) return { ok: false, reason: `game QA: ${planChecks.filter((c) => !c.ok).map((c) => `${c.id} (${c.detail})`).join("; ")}`, checks: planChecks, failure: failureKind(planChecks), levels: pick.levels };

  let kit = await getBrandKit(db, product.id);
  let logo = kit?.logos[0];
  if (!logo) {
    // the kit records a canonical logo the first time a video uses the approved logo asset (a game that never had a demo render has none yet): record it now, exactly as the demo path does
    const approved = (await db.select().from(ms.msAssets).where(eq(ms.msAssets.productId, product.id))).find((a) => a.kind === "logo" && a.approved === "true");
    if (!approved) throw new Error("NEEDS BRAND ASSET: no approved logo on file");
    kit = await saveCanonicalLogo(db, "game-video-engine", product.id, await canonicalizeLogo(approved, await readAssetBytes(approved)));
    logo = kit.logos[0];
  }
  const [asset] = await db.select().from(ms.msAssets).where(eq(ms.msAssets.id, logo.assetId));
  const bytes = await readAssetBytes(asset);
  const work = path.join(STUDIO_DIRS.tmp, `game-clip-${product.slug}-${format}-${Date.now()}`);
  await fs.mkdir(work, { recursive: true });
  const logoFile = path.join(work, `logo${path.extname(asset.storagePath) || ".png"}`);
  await fs.writeFile(logoFile, bytes);
  const outDir = path.join(STUDIO_DIRS.media, "game-proofs");
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `${product.slug}-${format}-${Date.now()}.mp4`);
  const size = { w: asset.width ?? logo.width, h: asset.height ?? logo.height };
  const audioFile = profile.keepGameAudio && session.meta.hasAudio ? path.join(session.dir, "audio.wav") : null;
  const speed = Math.min(1.3, voice.speed + (o.energyBoost ?? 0));
  const rendered = await renderGameClip({
    sessionDir: session.dir,
    frames: session.frames,
    spans: pick.spans.map((s, k) => ({ from: s.fromMs / 1000, to: s.toMs / 1000, ...(k === 0 && captions[0] ? { caption: captions[0] } : {}) })),
    outFile,
    workDir: work,
    logoFile,
    logoSize: size,
    brand: { dark: "#101018", accent: "#f5b301" },
    endHeadline: kit?.approvedName ?? product.name,
    vertical,
    source,
    gameAudio: audioFile,
    narration: lines.length ? { lines: lines.map((l, k) => ({ text: l.text, atMs: starts[k] })), voice: voice.voice, speed } : undefined,
    music: { bpm: 128, chords: [{ root: 48, notes: [60, 64, 67] }, { root: 43, notes: [55, 59, 62] }, { root: 45, notes: [57, 60, 64] }, { root: 41, notes: [53, 57, 60] }] },
  });
  const fail = async (checks: GameCheck[], why: string) => {
    await fs.rm(rendered.file, { force: true }).catch(() => undefined);
    await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
    return { ok: false as const, reason: `game QA: ${why}`, checks, failure: failureKind(checks) ?? ("render" as const), levels: pick.levels };
  };
  // the finished file: spoken lines where they really are, the voice measured, the balance measured
  const finalLines: FinalLine[] = lines.map((l, k) => ({ ...l, startMs: rendered.voiceLines[k]?.startMs ?? starts[k], endMs: rendered.voiceLines[k]?.endMs ?? starts[k] }));
  const checks = gameVideoChecks({ ...common, gameplayEndMs: rendered.gameplayEndMs, lines: finalLines, voice: rendered.voice, voiceOverBedDb: rendered.voiceOverBedDb });
  // black or blank frames anywhere in the gameplay of the finished file
  const frames = await windowFrames(rendered.file, 10, rendered.gameplayEndMs / 1000, rendered.window);
  const sv = judgeScreen(frames, 10, { transitionSec: 0.5 });
  checks.push({ id: "no_black_screen", ok: sv.blackSec <= 0.5 && sv.mostlyDarkSec <= 0.7, detail: `longest black ${sv.blackSec}s, mostly dark ${sv.mostlyDarkSec}s` }, { id: "no_blank_screen", ok: sv.blankSec <= 0.9, detail: `longest blank ${sv.blankSec}s` });
  if (lines.length) {
    const heard = await narrationAudible(rendered.file, rendered.voiceLines);
    checks.push({ id: "narration_audible", ok: heard.audible, detail: heard.reason });
    clip.voiceLines = rendered.voiceLines;
  }
  clip.durationMs = rendered.durationMs;
  checks.forEach((c) => log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.id}: ${c.detail}`));
  if (checks.some((c) => !c.ok)) return fail(checks, checks.filter((c) => !c.ok).map((c) => `${c.id} (${c.detail})`).join("; "));
  const lc = await gameLogoCheck(rendered.file, rendered.endCard.fromSec, rendered.logoBox, bytes, size, work);
  log(`logo integrity: ${lc.ok ? "PASS" : "FAIL"} (mean ${lc.mean}/255, strong ${lc.strongShare})`);
  const st = await fs.stat(rendered.file);
  await fs.rm(work, { recursive: true, force: true });
  return { ok: true, vertical, file: rendered.file, durationMs: rendered.durationMs, bytes: st.size, clip, checks, logo: lc, spans: pick.spans.length, workDir: work };
}

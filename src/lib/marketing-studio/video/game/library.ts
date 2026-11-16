/**
 * The GAMEPLAY CAPTURE LIBRARY of one game. Every captured session is kept (the newest, plus one older), and every level in it is described: where it starts and ends, what the player does,
 * the mechanic, whether it was won or lost, whether it pays off with a reward, which character appears, its most interesting event, how intense it is and the orientation of the footage.
 * Marketing Studio chooses sequences FROM this library, so five videos are not five cuts of the same footage, and asks for a fresh capture when the library has no distinct material left.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { captureRoot, libraryDirFor, sessionDirFor } from "./capture-sources";
import type { GameClip, GameFormat, GameMoment } from "./engine";
import { detectMoments, type SessionFrame, type SessionLog } from "./moments";
import { formatUnsupported, levelSegments, type Footage } from "./sequence";

export type SessionMeta = { id: string; capturedAt: string; frames: number; durationMs: number; width: number; height: number; hasAudio: boolean };
export type LibraryEntry = {
  id: string;
  sessionId: string;
  game: string;
  level: string;
  startMs: number;
  endMs: number;
  /** what the player does here, in order of how often */
  actions: string[];
  mechanic: string | null;
  outcome: "cleared" | "failed" | "unfinished";
  reward: boolean;
  character: string | null;
  /** the most striking thing that happens */
  event: string;
  intensity: number;
  orientation: "portrait" | "landscape";
};

export type LoadedSession = { dir: string; meta: SessionMeta; frames: SessionFrame[]; moments: GameMoment[] };

const readJson = async <T>(f: string): Promise<T | null> => fs.readFile(f, "utf8").then((t) => JSON.parse(t) as T).catch(() => null);

/** The momentsof a stored session: its own moments file, or read from its HUD log. */
export async function momentsOfSession(dir: string, frames: SessionFrame[]): Promise<GameMoment[]> {
  const log = (await readJson<SessionLog[]>(path.join(dir, "log.json"))) ?? [];
  const stored = await readJson<GameMoment[] | { moments: GameMoment[] }>(path.join(dir, "moments.json"));
  return stored ? (Array.isArray(stored) ? stored : stored.moments) : detectMoments(frames, log);
}

/** The session's identity card (written once, at capture time or the first time an older session is looked at). */
export async function ensureMeta(dir: string, frames: SessionFrame[]): Promise<SessionMeta> {
  const have = await readJson<SessionMeta>(path.join(dir, "meta.json"));
  if (have?.id) return { ...have, hasAudio: await fs.stat(path.join(dir, "audio.wav")).then(() => true).catch(() => false) };
  const st = await fs.stat(path.join(dir, "frames.json"));
  let width = 0;
  let height = 0;
  if (frames[0]) {
    const sharp = (await import("sharp")).default;
    const md = await sharp(path.join(dir, path.basename(frames[0].f))).metadata().catch(() => null);
    width = md?.width ?? 0;
    height = md?.height ?? 0;
  }
  const meta: SessionMeta = { id: `s${Math.round(st.mtimeMs)}`, capturedAt: new Date(st.mtimeMs).toISOString(), frames: frames.length, durationMs: frames.length ? Math.round((frames[frames.length - 1].t - frames[0].t) * 1000) : 0, width, height, hasAudio: await fs.stat(path.join(dir, "audio.wav")).then(() => true).catch(() => false) };
  await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(meta)).catch(() => undefined);
  return meta;
}

export async function loadSession(dir: string): Promise<LoadedSession | null> {
  const frames = await readJson<SessionFrame[]>(path.join(dir, "frames.json"));
  if (!frames?.length) return null;
  return { dir, meta: await ensureMeta(dir, frames), frames, moments: await momentsOfSession(dir, frames) };
}

/** Newest first: the current session, then the archived ones. */
export async function sessionDirs(slug: string): Promise<string[]> {
  const out = [sessionDirFor(slug)];
  const arch = await fs.readdir(libraryDirFor(slug)).catch(() => [] as string[]);
  const withTime = await Promise.all(arch.map(async (n) => ({ d: path.join(libraryDirFor(slug), n), t: (await fs.stat(path.join(libraryDirFor(slug), n, "frames.json")).catch(() => null))?.mtimeMs ?? 0 })));
  return [...out, ...withTime.filter((x) => x.t > 0).sort((a, b) => b.t - a.t).map((x) => x.d)];
}

export async function loadSessions(slug: string): Promise<LoadedSession[]> {
  const out: LoadedSession[] = [];
  for (const d of await sessionDirs(slug)) {
    const s = await loadSession(d).catch(() => null);
    if (s) out.push(s);
  }
  return out;
}

/** Pure: one described entry per level of a session. */
export function buildEntries(sessionId: string, game: string, moments: GameMoment[], dims: { width: number; height: number }): LibraryEntry[] {
  const orientation = dims.width > dims.height ? "landscape" : "portrait";
  return levelSegments(moments).map((s) => {
    const mine = moments.filter((m) => m.level === s.level && m.source === "real_capture");
    const counts = new Map<string, number>();
    for (const m of mine) counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
    const top = mine.filter((m) => !["menu", "settings", "instructions", "static", "idle"].includes(m.kind)).sort((a, b) => b.intensity - a.intensity)[0];
    return {
      id: `${sessionId}:${s.level}`,
      sessionId,
      game,
      level: s.level,
      startMs: s.fromMs,
      endMs: s.toMs,
      actions: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).filter((k) => !["menu", "settings", "instructions", "static", "idle"].includes(k)).slice(0, 4),
      mechanic: s.topMechanic?.name ?? s.mechanics[0] ?? null,
      outcome: s.hasWin ? "cleared" : s.hasLoss ? "failed" : "unfinished",
      reward: s.hasReward,
      character: mine.find((m) => m.character)?.character ?? null,
      event: top ? `${top.kind}${top.mechanic ? ` (${top.mechanic})` : ""}` : "none",
      intensity: +s.intensity.toFixed(2),
      orientation,
    };
  });
}

export type LibraryView = { sessions: LoadedSession[]; entries: LibraryEntry[] };
export async function readLibrary(slug: string): Promise<LibraryView> {
  const sessions = await loadSessions(slug);
  return { sessions, entries: sessions.flatMap((s) => buildEntries(s.meta.id, slug, s.moments, s.meta)) };
}

/** Moves the newest session into the library (keeping one older session) before a fresh one takes its place. */
export async function archiveCurrent(slug: string): Promise<void> {
  const cur = sessionDirFor(slug);
  const frames = await readJson<SessionFrame[]>(path.join(cur, "frames.json"));
  if (!frames) return;
  const meta = await ensureMeta(cur, frames);
  await fs.mkdir(libraryDirFor(slug), { recursive: true });
  await fs.rename(cur, path.join(libraryDirFor(slug), meta.id)).catch(async () => fs.rm(cur, { recursive: true, force: true }));
  const arch = (await fs.readdir(libraryDirFor(slug)).catch(() => [] as string[])).sort();
  for (const old of arch.slice(0, Math.max(0, arch.length - 1))) await fs.rm(path.join(libraryDirFor(slug), old), { recursive: true, force: true });
}

/** Pure: the levels and footage earlier delivered clips used (older clips without footage notes count by the levels they showed). */
export function usageOf(prior: GameClip[]): { usedLevels: Set<string>; usedFootage: Footage[]; levelUses: Map<string, number> } {
  const usedLevels = new Set<string>();
  const levelUses = new Map<string, number>();
  const usedFootage: Footage[] = [];
  for (const c of prior) {
    const levels = new Set(c.moments.filter((m) => m.source === "real_capture" && !["menu", "settings", "instructions", "static", "idle"].includes(m.kind)).map((m) => m.level));
    for (const l of levels) {
      usedLevels.add(l);
      levelUses.set(l, (levelUses.get(l) ?? 0) + 1);
    }
    usedFootage.push(...(c.footage ?? []));
  }
  return { usedLevels, usedFootage, levelUses };
}

/** Pure: which formats this game's footage supports, and why not for the rest. */
export function supportedFormats(sessions: Array<{ moments: GameMoment[] }>, hasCharacters: boolean, all: GameFormat[]): { supported: GameFormat[]; unsupported: Array<{ format: GameFormat; reason: string }> } {
  const supported: GameFormat[] = [];
  const unsupported: Array<{ format: GameFormat; reason: string }> = [];
  for (const f of all) {
    const reasons = sessions.map((s) => formatUnsupported(f, s.moments, { hasCharacters }));
    if (reasons.some((r) => r === null)) supported.push(f);
    else unsupported.push({ format: f, reason: reasons[0] ?? "there is no captured gameplay yet" });
  }
  return { supported, unsupported };
}

export type Readiness = { source: "script" | "runner" | "none"; ready: boolean; sessions: number; levels: number; mechanics: number; audio: boolean; orientation: string | null; newestAt: string | null };
/** The gameplay readiness shown to the owner. */
export async function readinessOf(slug: string, source: "script" | "runner" | "none"): Promise<Readiness> {
  const root = captureRoot(slug);
  void root;
  const lib = await readLibrary(slug).catch(() => ({ sessions: [], entries: [] }) as LibraryView);
  const levels = new Set(lib.entries.map((e) => e.level));
  const mechanics = new Set(lib.sessions.flatMap((s) => s.moments.filter((m) => m.source === "real_capture" && m.mechanic).map((m) => m.mechanic as string)));
  const o = lib.sessions[0]?.meta;
  return { source, ready: source !== "none" && lib.sessions.length > 0, sessions: lib.sessions.length, levels: levels.size, mechanics: mechanics.size, audio: lib.sessions.some((s) => s.meta.hasAudio), orientation: o ? (o.width > o.height ? "landscape" : "portrait") : null, newestAt: o?.capturedAt ?? null };
}

/**
 * ScribbleZap gameplay plates. The footage is a REAL screencast of the game's private web tester, recorded once by scripted touch input in a
 * disposable browser profile (GET only, nothing saved or changed, no code touched): see scripts/ops/marketing-sz-capture.mts. This module only
 * selects windows of that stored recording, resamples them to 30 fps frames (duplicating a frame when the game did not change, never inventing
 * one), and reads the public product page for the quotes the claims rest on.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { launchBrowser } from "../../creative/render";
import { MOBILE_UA, VIEW } from "./plates";
import type { GameplayMeta, Manifest, PlateManifest } from "./types";

const run = promisify(execFile);
export const SZ_ORIGIN = "https://iscreamstudio.com";
export const SZ_PUBLIC_PATH = "/games/scribblezap/";
export const SZ_TESTER_URL = `${SZ_ORIGIN}/test/scribblezap/play/`;
export const SZ_CAPTURE_DIR = process.env.STUDIO_GAME_CAPTURE_DIR ?? "/var/lib/gravyblock-marketing/captures/scribblezap";
/** Phone-screen crop of the 390x844 screencast frames (the game's board and HUD; the empty strip under the level picker is cut). */
export const SZ_PLATE = { w: 390, h: 780 };

/** Which stretch of the stored recording each scene plays, in seconds from the start of the recording. */
export const SZ_WINDOWS: Array<{ scene: string; fromSec: number; toSec: number; what: string }> = [
  { scene: "hook", fromSec: 32.4, toSec: 36.8, what: "level 2: a cut with the game's big-cut burst" },
  { scene: "pen", fromSec: 0.3, toSec: 4.5, what: "level 1: the PEN UNLOCKED tip card, then tap and hold draws the first cut" },
  { scene: "sunset", fromSec: 113.0, toSec: 117.0, what: "level 5: the sunset-themed Mastery stage (95 percent fill)" },
  { scene: "clear", fromSec: 129.8, toSec: 134.6, what: "after level 5: BASICS MASTERED, Neon board unlocked" },
  { scene: "unlock", fromSec: 137.0, toSec: 142.8, what: "TENNIS BALL UNLOCKED card, then the first Tennis Ball board (level 6)" },
  { scene: "tennis", fromSec: 166.2, toSec: 170.2, what: "level 7: Tennis Ball gameplay with a combo burst" },
  { scene: "home", fromSec: 235.6, toSec: 239.6, what: "the game's home screen with Daily Challenge and Endless Run" },
  { scene: "daily", fromSec: 252.4, toSec: 256.4, what: "Daily Challenge: the dark triangular board with the spinning gem and a CLUTCH reward" },
];

type Frame = { t: number; f: string };

/** Seconds whose frame count reaches this are "active" (the game is moving); idle seconds emit few screencast frames and are not a measure of smoothness. */
const ACTIVE_MIN = 20;

export function activeCaptureFps(frames: Frame[], fromSec: number, toSec: number): number {
  const t0 = frames[0].t;
  const bins = new Map<number, number>();
  for (const f of frames) {
    const s = f.t - t0;
    if (s >= fromSec && s < toSec) bins.set(Math.floor(s), (bins.get(Math.floor(s)) ?? 0) + 1);
  }
  const active = [...bins.values()].filter((n) => n >= ACTIVE_MIN).sort((a, b) => a - b);
  return active.length ? active[Math.floor(active.length / 2)] : 0;
}

export const HUD_EVENT_PATTERNS: Array<[string, RegExp]> = [
  ["pen tool unlocked", /PEN UNLOCKED/],
  ["nice cut", /NICE CUT/],
  ["combo multiplier", /x[2-9] (NICE|GOOD|BIG|AWESOME)/],
  ["big cut", /BIG CUT/],
  ["level clear", /LEVEL \d+ CLEAR/],
  ["three stars", /★ ★ ★/],
  ["zaps earned", /\+\d ZAPS/],
  ["unlock card", /UNLOCKED/],
  ["new ball", /TENNIS BALL UNLOCKED/],
  ["new obstacle", /NEW OBSTACLE|SPINNING GEM/],
  ["daily challenge", /DAILY CHALK|DAILY CHALLENGE/],
  ["fill meter", /\d+% \/ \d+%/],
];

export async function captureScribbleZapPlates(outDir: string, logoFile: string): Promise<Manifest> {
  await mkdir(outDir, { recursive: true });
  const dir = SZ_CAPTURE_DIR;
  const frames = JSON.parse(await readFile(path.join(dir, "frames.json"), "utf8")) as Frame[];
  const log = JSON.parse(await readFile(path.join(dir, "log.json"), "utf8")) as Array<{ t: number; txt: string }>;
  const meta = JSON.parse(await readFile(path.join(dir, "capture.json"), "utf8")) as { capturedAt: string; source: string; method: string };

  // concat list with relative names (the stored list may carry absolute paths of the machine that recorded it)
  const list = frames.map((f, k) => `file '${path.basename(f.f)}'\nduration ${(k + 1 < frames.length ? Math.max(0.001, frames[k + 1].t - f.t) : 0.03).toFixed(4)}`).join("\n");
  await writeFile(path.join(dir, "list.rel.txt"), list);

  const clips: NonNullable<Manifest["clips"]> = {};
  const windows: GameplayMeta["windows"] = [];
  for (const w of SZ_WINDOWS) {
    const sub = `clip-${w.scene}`;
    await mkdir(path.join(outDir, sub), { recursive: true });
    await run("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.rel.txt"), "-ss", String(w.fromSec), "-t", String(w.toSec - w.fromSec), "-vf", `fps=30,crop=${SZ_PLATE.w}:${SZ_PLATE.h}:0:0`, "-q:v", "3", path.join(outDir, sub, "f%04d.jpg")], { cwd: dir, timeout: 180_000 });
    const n = Math.round((w.toSec - w.fromSec) * 30);
    clips[w.scene] = { frames: Array.from({ length: n }, (_, k) => `${sub}/f${String(k + 1).padStart(4, "0")}.jpg`), fps: 30, fromSec: w.fromSec };
    windows.push({ scene: w.scene, fromSec: w.fromSec, toSec: w.toSec, capturedFps: activeCaptureFps(frames, w.fromSec, w.toSec) });
  }

  const hudText = log.map((l) => l.txt).join(" | ");
  const hudEvents = HUD_EVENT_PATTERNS.filter(([, re]) => re.test(hudText)).map(([name]) => name);
  const levelsCleared = new Set([...hudText.matchAll(/LEVEL (\d+) CLEAR/g)].map((m) => m[1])).size;

  // the public product page, for the quotes behind every claim
  const handle = await launchBrowser();
  const plates: Record<string, PlateManifest> = {};
  try {
    const ctx = await handle.browser.newContext({ viewport: { width: VIEW.w, height: VIEW.h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: MOBILE_UA, serviceWorkers: "block" });
    await ctx.route("**/*", (route) => {
      let host = "";
      try {
        host = new URL(route.request().url()).hostname;
      } catch {
        /* ignore */
      }
      return route.request().method() === "GET" && host === "iscreamstudio.com" ? route.continue() : route.abort();
    });
    const page = await ctx.newPage();
    await page.goto(SZ_ORIGIN + SZ_PUBLIC_PATH, { waitUntil: "networkidle", timeout: 45_000 });
    plates.public = { id: "public", url: SZ_ORIGIN + SZ_PUBLIC_PATH, title: await page.title(), capturedAt: new Date().toISOString(), text: await page.evaluate(() => document.body.innerText), w: VIEW.w, h: VIEW.h, states: {}, rects: {} };
    await ctx.close();
  } finally {
    await handle.close();
  }
  plates.play = {
    id: "play",
    url: SZ_TESTER_URL,
    title: "ScribbleZap (private web tester)",
    capturedAt: meta.capturedAt,
    text: hudText,
    w: SZ_PLATE.w,
    h: SZ_PLATE.h,
    states: {},
    rects: { fill: [10, 54, 370, 66], board: [16, 133, 358, 641] },
  };
  const manifest: Manifest = { capturedAt: meta.capturedAt, viewport: VIEW, plates, logo: path.basename(logoFile), clips, gameplay: { source: meta.source, capturedAt: meta.capturedAt, method: meta.method, windows, hudEvents, levelsCleared } };
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify({ ...manifest, clips: Object.fromEntries(Object.entries(clips).map(([k, v]) => [k, { ...v, frames: v.frames.length }])) }, null, 2));
  return manifest;
}

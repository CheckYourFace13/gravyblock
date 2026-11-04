/**
 * Mibble Meadow gameplay plates. The footage is the REAL game: the project files unzipped from the published 0.1.23 APK, run read-only in the
 * matching Godot 4.7.2 engine in a disposable container, rendered frame by frame (Movie Maker mode, exactly 30 fps) while a driver plays real
 * levels with real mouse input (see scripts/ops/mibble-meadow-capture/). This module only selects windows of that stored footage, copies them as
 * numbered frames, and builds the text the claims cite: the game's own tester page, and the observations the capture itself logged.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { launchBrowser } from "../../creative/render";
import { MOBILE_UA, VIEW } from "./plates";
import type { GameplayMeta, Manifest, PlateManifest } from "./types";

const run = promisify(execFile);
export const MB_ORIGIN = "https://iscreamstudio.com";
export const MB_PAGE_PATH = "/mibblemeadow/";
export const MB_CAPTURE_DIR = process.env.STUDIO_MIBBLE_CAPTURE_DIR ?? "/var/lib/gravyblock-marketing/captures/mibblemeadow/footage2";
/** The game's own base screen (frames are written at this size); shown unstretched in a phone-shaped window. */
export const MB_PLATE = { w: 390, h: 845 };

/** Which stretch of the stored footage each beat plays, in movie frames (30 per second). Event frames come from the capture's own log. */
export const MB_WINDOWS: Array<{ scene: string; from: number; to: number; what: string }> = [
  { scene: "hook", from: 1885, to: 1990, what: "level 4 (a 5 by 5 board): animals placed one by one until the board is solved" },
  { scene: "cute", from: 463, to: 565, what: "after level 1: the celebration screen with its bunny, title, stars and score" },
  { scene: "touch", from: 895, to: 990, what: "level 2: marks and placements on a 4 by 4 board with different meadows" },
  { scene: "cheer", from: 1039, to: 1135, what: "after level 2: the fox's celebration screen" },
  { scene: "grow", from: 2715, to: 2810, what: "level 6 (a 5 by 5 board): marks, then every animal placed" },
  { scene: "fresh", from: 2300, to: 2385, what: "level 5: a differently shaped board in new colours" },
  { scene: "stars", from: 2449, to: 2545, what: "after level 5: the panda's celebration screen with three stars" },
  { scene: "home", from: 150, to: 238, what: "the splash with its running animals, then the home screen with Play, Daily Meadow and Endless Meadow" },
];

type Ev = { frame: number; kind: string; level?: number | string; size?: number };

export async function captureMibblePlates(outDir: string, logoFile: string): Promise<Manifest> {
  await mkdir(outDir, { recursive: true });
  const dir = MB_CAPTURE_DIR;
  const events = JSON.parse(await readFile(path.join(dir, "events.json"), "utf8")) as Ev[];
  const meta = JSON.parse(await readFile(path.join(dir, "capture.json"), "utf8")) as { capturedAt: string; build: string; method: string; boards: number[] };

  const clips: NonNullable<Manifest["clips"]> = {};
  const windows: GameplayMeta["windows"] = [];
  for (const w of MB_WINDOWS) {
    const sub = `clip-${w.scene}`;
    await mkdir(path.join(outDir, sub), { recursive: true });
    const n = w.to - w.from;
    await run("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-framerate", "30", "-start_number", String(w.from), "-i", path.join(dir, "mv", "f%08d.png"), "-frames:v", String(n), "-q:v", "2", path.join(outDir, sub, "f%04d.jpg")], { timeout: 180_000 });
    clips[w.scene] = { frames: Array.from({ length: n }, (_, k) => `${sub}/f${String(k + 1).padStart(4, "0")}.jpg`), fps: 30, fromSec: w.from / 30 };
    // Movie Maker renders every frame on its own clock, so the footage is exactly 30 distinct frames per second
    windows.push({ scene: w.scene, fromSec: w.from / 30, toSec: w.to / 30, capturedFps: 30 });
  }

  const completed = events.filter((e) => e.kind === "level_complete" && typeof e.level === "number");
  const loaded = events.filter((e) => e.kind === "level_loaded");
  const sizes = loaded.map((e) => `${e.size} by ${e.size}`);
  const placed = events.filter((e) => e.kind === "placed" && typeof e.level === "number").length;
  const gameText = [
    `Observed in the captured gameplay footage of the real Mibble Meadow ${meta.build}, played by real taps, a swipe and double-taps.`,
    `Boards played: ${sizes.join(", then ")}.`,
    `Every solved level ended on a celebration screen with an animal, a title, stars and a score (${completed.length} of ${loaded.length} levels solved).`,
    `The home screen offers Play, Daily Meadow and Endless Meadow.`,
    `Animals are placed by double-tap; a single tap or a swipe marks cells.`,
    `${placed} animals were placed.`,
  ].join(" ");

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
    await page.goto(MB_ORIGIN + MB_PAGE_PATH, { waitUntil: "networkidle", timeout: 45_000 });
    plates.public = { id: "public", url: MB_ORIGIN + MB_PAGE_PATH, title: await page.title(), capturedAt: new Date().toISOString(), text: await page.evaluate(() => document.body.innerText), w: VIEW.w, h: VIEW.h, states: {}, rects: {} };
    await ctx.close();
  } finally {
    await handle.close();
  }
  plates.play = { id: "play", url: MB_ORIGIN + MB_PAGE_PATH, title: "Mibble Meadow 0.1.23 (the real APK's project files, run in Godot 4.7.2)", capturedAt: meta.capturedAt, text: gameText, w: MB_PLATE.w, h: MB_PLATE.h, states: {}, rects: {} };
  const hudEvents = ["tip card", ...new Set(events.map((e) => e.kind).filter((k) => ["marked_by_tap", "marked_by_swipe", "placed", "level_complete", "next_level_click"].includes(k)).map((k) => k.replaceAll("_", " ")))];
  const manifest: Manifest = { capturedAt: meta.capturedAt, viewport: VIEW, plates, logo: path.basename(logoFile), clips, gameplay: { source: "Mibble Meadow 0.1.23 project files from the published APK, run in Godot 4.7.2", capturedAt: meta.capturedAt, method: meta.method, windows, hudEvents, levelsCleared: completed.length } };
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify({ ...manifest, clips: Object.fromEntries(Object.entries(clips).map(([k, v]) => [k, { ...v, frames: v.frames.length }])) }, null, 2));
  return manifest;
}

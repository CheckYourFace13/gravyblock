/**
 * Which games have an automatic real-gameplay capture, and where their footage lives. A game without one makes nothing (gameplay is never faked).
 * "script": a scripted browser plays the game's web build. "runner": the game runs in a disposable container started by the root-owned capture runner (the worker only leaves a request).
 */
import path from "node:path";
import { STUDIO_DIRS } from "../../config";

export const GAME_CAPTURES: Record<string, { kind: "script"; script: string; env: string } | { kind: "runner"; levels: number }> = {
  scribblezap: { kind: "script", script: "scripts/ops/marketing-sz-capture.mts", env: "STUDIO_GAME_CAPTURE_OUT" },
  mibblemeadow: { kind: "runner", levels: 8 },
};
export const captureReady = (slug: string) => slug in GAME_CAPTURES;
export const captureRoot = (slug: string) => path.join(STUDIO_DIRS.root, "captures", slug);
/** The newest captured session; older ones are kept beside it in the library folder. */
export const sessionDirFor = (slug: string) => path.join(captureRoot(slug), "session");
export const libraryDirFor = (slug: string) => path.join(captureRoot(slug), "library");

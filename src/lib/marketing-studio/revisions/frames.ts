/** A small picture of each scene, saved when a video is rendered, so the scene editor can show the customer what each scene looks like without any rendering at review time. */
import path from "node:path";
import sharp from "sharp";
import type { StudioDb } from "../db";
import { setSetting } from "../runtime";
import type { Manifest } from "../video/demo/types";
import { framesKey } from "./scene-edits";

/** The state of a scene's page worth showing: the result after the taps, else after the first tap, else before. */
const PREFER = ["b", "a", "s0"];

export async function saveSceneFrames(db: StudioDb, videoRowId: string, manifest: Manifest, platesDir: string, scenes: Array<{ id: string; sourceVisual?: { plate?: string } }>): Promise<number> {
  const out: Record<string, string> = {};
  for (const sc of scenes) {
    const plate = sc.sourceVisual?.plate ? manifest.plates[sc.sourceVisual.plate] : undefined;
    const state = plate ? PREFER.map((k) => plate.states[k]).find(Boolean) : undefined;
    if (!state) continue;
    try {
      const jpg = await sharp(path.join(platesDir, state.file)).resize({ width: 240, height: 320, fit: "cover", position: "top" }).jpeg({ quality: 70 }).toBuffer();
      out[sc.id] = `data:image/jpeg;base64,${jpg.toString("base64")}`;
    } catch {
      /* a scene without a picture still works in the editor */
    }
  }
  if (Object.keys(out).length) await setSetting(framesKey(videoRowId), out, "studio-worker", db, { audited: false });
  return Object.keys(out).length;
}

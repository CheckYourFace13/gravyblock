/**
 * Video generation freeze. The slideshow videos were not good enough to post, so no new video is generated until the owner has watched the one
 * pilot demo and explicitly approved it. The demo path is the single exception, and it allows exactly one live demo at a time.
 */
import { audit } from "../audit";
import { requireStudioDb, type StudioDb } from "../db";
import { getSetting, setSetting } from "../runtime";

export const VIDEO_FREEZE_KEY = "video_generation_frozen";
export type VideoFreeze = { frozen: boolean; reason: string; since: string; by: string };

export async function videoFreeze(db: StudioDb = requireStudioDb()): Promise<VideoFreeze | null> {
  const v = await getSetting<VideoFreeze | null>(VIDEO_FREEZE_KEY, null, db);
  return v?.frozen ? v : null;
}

export async function freezeVideoGeneration(actor: string, reason: string, db: StudioDb = requireStudioDb()) {
  const v: VideoFreeze = { frozen: true, reason, since: new Date().toISOString(), by: actor };
  await setSetting(VIDEO_FREEZE_KEY, v, actor, db);
  await audit(db, { actor, action: "video.freeze", entity: "setting", entityId: VIDEO_FREEZE_KEY, detail: { reason } });
}

/** Only for use after the owner has approved the pilot demo. */
export async function unfreezeVideoGeneration(actor: string, db: StudioDb = requireStudioDb()) {
  await setSetting(VIDEO_FREEZE_KEY, { frozen: false, reason: "", since: new Date().toISOString(), by: actor }, actor, db);
  await audit(db, { actor, action: "video.unfreeze", entity: "setting", entityId: VIDEO_FREEZE_KEY });
}

export async function assertVideosNotFrozen(db: StudioDb = requireStudioDb()) {
  const f = await videoFreeze(db);
  if (f) throw new Error(`Video generation is frozen: ${f.reason}`);
}

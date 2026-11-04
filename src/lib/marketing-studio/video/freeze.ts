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

// ---- controlled expansion --------------------------------------------------------------------------------------------------------
// After the owner approved the RentalNoodle pilot demo as the production quality reference, video generation reopened under a durable gate:
// only product demos built from real captured interaction (see demo/specs.ts), at most one new video per product, owner review before anything
// is used, one heavy render at a time. The slideshow pipeline stays retired.

export const VIDEO_EXPANSION_KEY = "video_expansion_gate";
export type VideoExpansion = { status: "approved"; referenceSlug: string; approvedAt: string; by: string; note: string; maxNewVideosPerProduct: 1; ownerReviewRequired: true; slideshowRetired: true };

export async function videoExpansion(db: StudioDb = requireStudioDb()): Promise<VideoExpansion | null> {
  const v = await getSetting<VideoExpansion | null>(VIDEO_EXPANSION_KEY, null, db);
  return v?.status === "approved" ? v : null;
}

export async function approveVideoExpansion(actor: string, referenceSlug: string, note: string, db: StudioDb = requireStudioDb()) {
  const v: VideoExpansion = { status: "approved", referenceSlug, approvedAt: new Date().toISOString(), by: actor, note, maxNewVideosPerProduct: 1, ownerReviewRequired: true, slideshowRetired: true };
  await setSetting(VIDEO_EXPANSION_KEY, v, actor, db);
  await audit(db, { actor, action: "video.expansion_approved", entity: "setting", entityId: VIDEO_EXPANSION_KEY, detail: { referenceSlug, note } });
}

/** The old card-and-image slideshow pipeline is not allowed to make production video. Checked first for a frozen system, then retired. */
export async function assertSlideshowAllowed(db: StudioDb = requireStudioDb()) {
  await assertVideosNotFrozen(db);
  throw new Error("The slideshow video pipeline is retired from production. Videos are real product demos (demo/specs.ts); a product without real captured interaction stays TEASER_ONLY.");
}

/**
 * A video whose creative no longer matches its product's launch state (a pre-launch follow CTA after the game went live) is marked stale in its
 * storyboard. Nothing stale may be prepared, approved, scheduled or sent. Published posts are history and are never marked.
 */
import { eq } from "drizzle-orm";
import { ms, type StudioDb } from "../db";

export type StaleMark = { reason: string; at: string; livePhase: "store_live"; storeUrl: string };

export async function staleMarkFor(db: StudioDb, videoId: string | null | undefined): Promise<StaleMark | null> {
  if (!videoId) return null;
  const [v] = await db.select({ storyboard: ms.msVideos.storyboard }).from(ms.msVideos).where(eq(ms.msVideos.id, videoId)).limit(1);
  return (v?.storyboard as { stale?: StaleMark } | undefined)?.stale ?? null;
}

export async function assertCreativeFresh(db: StudioDb, videoId: string | null | undefined): Promise<void> {
  const m = await staleMarkFor(db, videoId);
  if (m) throw new Error(`This video is stale: ${m.reason}. It must be regenerated with the live install call to action before it can be used.`);
}

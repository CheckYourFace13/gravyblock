/** Queue side of the pilot demo video: creates the one allowed record and submits its render job. The worker does the heavy work. */
import { and, eq, inArray, sql } from "drizzle-orm";
import { audit } from "../../audit";
import { ms, requireStudioDb, type StudioDb } from "../../db";
import { requireProduct } from "../../repository";
import { enqueue } from "../../runtime";
import type { OwnerScope } from "../../scope";

/** Products allowed to have a demo video while the pilot is under review. */
export const DEMO_PILOT_SLUGS = ["rentalnoodle"] as const;
const LIVE = ["queued", "rendering", "ready_for_review", "approved"];

export async function createDemoVideo(scope: OwnerScope, actor: string, productId: string, db: StudioDb = requireStudioDb()) {
  const product = await requireProduct(scope, productId, db);
  if (!(DEMO_PILOT_SLUGS as readonly string[]).includes(product.slug)) throw new Error("Demo videos are limited to the RentalNoodle pilot until the owner approves it");
  const live = await db.select({ id: ms.msVideos.id, status: ms.msVideos.status }).from(ms.msVideos).where(and(eq(ms.msVideos.productId, productId), sql`${ms.msVideos.storyboard}->>'kind' = 'demo'`, inArray(ms.msVideos.status, LIVE)));
  if (live.length) throw new Error(`There is already a demo video (${live[0].status}). Review it first; no second demo is made until the owner decides.`);
  // The slideshow video is replaced by the demo, not shown next to it.
  await db.update(ms.msVideos).set({ status: "superseded" }).where(and(eq(ms.msVideos.productId, productId), sql`coalesce(${ms.msVideos.storyboard}->>'kind','') <> 'demo'`, sql`${ms.msVideos.status} <> 'superseded'`));
  const [row] = await db.insert(ms.msVideos).values({ productId, title: `${product.name} product demo`, storyboard: { version: 2, kind: "demo", pending: true }, targetSeconds: 30, status: "queued" }).returning();
  const { id } = await enqueue({ kind: "render_demo_video", weight: "heavy", priority: 3, productId, input: { videoId: row.id }, maxAttempts: 1 }, db);
  await audit(db, { actor, action: "video.demo_create", entity: "video", entityId: row.id, productId, detail: { jobId: id } });
  return row;
}

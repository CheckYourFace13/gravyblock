/** Queue side of the pilot demo video: creates the one allowed record and submits its render job. The worker does the heavy work. */
import { and, eq, inArray, sql } from "drizzle-orm";
import { audit } from "../../audit";
import { ms, requireStudioDb, type StudioDb } from "../../db";
import { requireProduct } from "../../repository";
import { enqueue } from "../../runtime";
import type { OwnerScope } from "../../scope";

import { assertVideosNotFrozen, videoExpansion } from "../freeze";
import { DEMO_SPECS } from "./specs";

/** The owner-approved reference product, which may always have its demo. */
export const DEMO_REFERENCE_SLUG = "rentalnoodle";
/** Products with a demo spec (real captured interaction). Anything else, such as a game with no gameplay capture, stays TEASER_ONLY. */
export const DEMO_PILOT_SLUGS = Object.keys(DEMO_SPECS);
const LIVE = ["queued", "rendering", "ready_for_review", "approved"];

/**
 * `queue: false` creates the record only. The pilot demo needs about 1.5 GB at its peak, more than the worker's memory cap, so it is rendered by
 * scripts/ops/marketing-demo-run.ts in its own bounded scope; a worker job would be killed for exceeding the cap.
 */
export async function createDemoVideo(scope: OwnerScope, actor: string, productId: string, db: StudioDb = requireStudioDb(), opts: { queue?: boolean } = {}) {
  const product = await requireProduct(scope, productId, db);
  if (!DEMO_PILOT_SLUGS.includes(product.slug)) throw new Error(`${product.name} has no demo video spec: without real captured product interaction or real gameplay it stays TEASER_ONLY`);
  // Anything beyond the approved reference needs the owner-approved expansion gate (and no freeze).
  if (product.slug !== DEMO_REFERENCE_SLUG) {
    await assertVideosNotFrozen(db);
    if (!(await videoExpansion(db))) throw new Error("Video expansion is not approved; only the RentalNoodle reference demo may be made");
  }
  const live = await db.select({ id: ms.msVideos.id, status: ms.msVideos.status }).from(ms.msVideos).where(and(eq(ms.msVideos.productId, productId), sql`${ms.msVideos.storyboard}->>'kind' = 'demo'`, inArray(ms.msVideos.status, LIVE)));
  if (live.length) throw new Error(`There is already a demo video (${live[0].status}). Review it first; no second demo is made until the owner decides.`);
  // The slideshow video is replaced by the demo, not shown next to it.
  await db.update(ms.msVideos).set({ status: "superseded" }).where(and(eq(ms.msVideos.productId, productId), sql`coalesce(${ms.msVideos.storyboard}->>'kind','') <> 'demo'`, sql`${ms.msVideos.status} <> 'superseded'`));
  const [row] = await db.insert(ms.msVideos).values({ productId, title: `${product.name} product demo`, storyboard: { version: 2, kind: "demo", pending: true }, targetSeconds: 30, status: "queued" }).returning();
  const id = opts.queue === false ? null : (await enqueue({ kind: "render_demo_video", weight: "heavy", priority: 3, productId, input: { videoId: row.id }, maxAttempts: 1 }, db)).id;
  await audit(db, { actor, action: "video.demo_create", entity: "video", entityId: row.id, productId, detail: { jobId: id, queued: opts.queue !== false } });
  return row;
}

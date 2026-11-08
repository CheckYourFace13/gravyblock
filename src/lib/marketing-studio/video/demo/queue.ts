/** Queue side of the pilot demo video: creates the one allowed record and submits its render job. The worker does the heavy work. */
import { and, eq, inArray, sql } from "drizzle-orm";
import { audit } from "../../audit";
import { ms, requireStudioDb, type StudioDb } from "../../db";
import { requireProduct } from "../../repository";
import { enqueue } from "../../runtime";
import type { OwnerScope } from "../../scope";

import { assertVideosNotFrozen, videoExpansion } from "../freeze";
import { GAME_PAUSE_MESSAGE, gameAcquisitionPaused } from "../../publishing/pause";
import { ensureSpec } from "../concepts/registry";
import { DEMO_SPECS } from "./specs";

/** The owner-approved reference product, which may always have its demo. */
export const DEMO_REFERENCE_SLUG = "rentalnoodle";
/** Products with a demo spec (real captured interaction). Anything else, such as a game with no gameplay capture, stays TEASER_ONLY. */
export const DEMO_PILOT_SLUGS = [...new Set(Object.values(DEMO_SPECS).map((s) => s.slug))];
/** A product has a demo script when a hand-written spec or a generated concept is registered for it. */
const hasDemoSpec = (slug: string) => Object.values(DEMO_SPECS).some((s) => s.slug === slug);
const LIVE = ["queued", "rendering", "ready_for_review", "approved"];

/**
 * `queue: false` creates the record only. The pilot demo needs about 1.5 GB at its peak, more than the worker's memory cap, so it is rendered by
 * scripts/ops/marketing-demo-run.ts in its own bounded scope; a worker job would be killed for exceeding the cap.
 */
export async function createDemoVideo(scope: OwnerScope, actor: string, productId: string, db: StudioDb = requireStudioDb(), opts: { queue?: boolean; /** a launch-transition replacement may sit beside an earlier video that is already public (history) */ replaceStale?: boolean; /** which script to render: "<slug>" (the default) or "<slug>:<angle>" */ specId?: string } = {}) {
  const product = await requireProduct(scope, productId, db);
  if (opts.specId) await ensureSpec(db, opts.specId);
  if (!hasDemoSpec(product.slug)) throw new Error(`${product.name} has no demo video spec: without real captured product interaction or real gameplay it stays TEASER_ONLY`);
  if (!opts.replaceStale && (await gameAcquisitionPaused(db, product))) throw new Error(GAME_PAUSE_MESSAGE);
  // Anything beyond the approved reference needs the owner-approved expansion gate (and no freeze).
  if (product.slug !== DEMO_REFERENCE_SLUG) {
    await assertVideosNotFrozen(db);
    if (!(await videoExpansion(db))) throw new Error("Video expansion is not approved; only the RentalNoodle reference demo may be made");
  }
  const specId = opts.specId ?? product.slug;
  if (DEMO_SPECS[specId]?.slug !== product.slug) throw new Error(`There is no demo script "${specId}" for ${product.name}`);
  // One live video per script: a product's other angles are separate videos and never block each other.
  let live = await db.select({ id: ms.msVideos.id, status: ms.msVideos.status }).from(ms.msVideos).where(and(eq(ms.msVideos.productId, productId), sql`${ms.msVideos.storyboard}->>'kind' = 'demo'`, sql`coalesce(${ms.msVideos.storyboard}->>'specId', ${product.slug}) = ${specId}`, inArray(ms.msVideos.status, LIVE)));
  if (opts.replaceStale && live.length) {
    const pub = await db.select({ videoId: ms.msPublications.videoId }).from(ms.msPublications).where(and(inArray(ms.msPublications.videoId, live.map((v) => v.id)), inArray(ms.msPublications.status, ["published", "publishing", "revoked", "deleted"])));
    const history = new Set(pub.map((r) => r.videoId));
    live = live.filter((v) => !history.has(v.id));
  }
  if (live.length) throw new Error(`There is already a demo video (${live[0].status}). Review it first; no second demo is made until the owner decides.`);
  // The slideshow video is replaced by the demo, not shown next to it.
  await db.update(ms.msVideos).set({ status: "superseded" }).where(and(eq(ms.msVideos.productId, productId), sql`coalesce(${ms.msVideos.storyboard}->>'kind','') <> 'demo'`, sql`${ms.msVideos.status} <> 'superseded'`));
  const [row] = await db.insert(ms.msVideos).values({ productId, title: `${product.name} ${specId === product.slug ? "product demo" : `video: ${DEMO_SPECS[specId].angle ?? specId}`}`, storyboard: { version: 2, kind: "demo", pending: true, specId }, targetSeconds: 30, status: "queued" }).returning();
  const id = opts.queue === false ? null : (await enqueue({ kind: "render_demo_video", weight: "heavy", priority: 3, productId, input: { videoId: row.id }, maxAttempts: 1 }, db)).id;
  await audit(db, { actor, action: "video.demo_create", entity: "video", entityId: row.id, productId, detail: { jobId: id, queued: opts.queue !== false } });
  return row;
}

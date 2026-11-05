/**
 * Launch-transition automation. When Product Truth gains a verified live store destination for a game, every unpublished pre-launch video of
 * that game is flagged stale, its unsent publications are cancelled, and (when the owner-approved gate allows) a replacement record is queued
 * so the next governed render uses the install CTA. Posts that are already public, and the videos behind them, are never touched.
 * Runs on every Studio worker loop; it is a few small queries when nothing has changed.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { audit } from "../../audit";
import { ms, type StudioDb } from "../../db";
import { listFacts, listProducts } from "../../repository";
import { INTERNAL_SCOPE, type OwnerScope } from "../../scope";
import { assertVideosNotFrozen, videoExpansion } from "../freeze";
import type { StaleMark } from "../stale";
import { storeDestination } from "./language-qa";
import { createDemoVideo } from "./queue";
import { DEMO_SPECS } from "./specs";

const ACTOR = "launch-state";
/** Videos already seen by the public, or in flight to it, are history and stay exactly as they were. */
const HISTORICAL = ["published", "publishing", "revoked", "deleted"];
const UNSENT = ["draft", "approval_required", "approved", "scheduled"];

export type LaunchStateReport = { slug: string; phase: "pre_launch" | "store_live"; stale: string[]; cancelled: number; replacement: string | null; skipped: string[] };

export async function reconcileGameLaunchState(db: StudioDb, scope: OwnerScope = INTERNAL_SCOPE, opts: { regenerate?: boolean; now?: Date } = {}): Promise<LaunchStateReport[]> {
  const reports: LaunchStateReport[] = [];
  const products = await listProducts(scope, db);
  for (const spec of Object.values(DEMO_SPECS)) {
    if (spec.kind !== "game") continue;
    const product = products.find((p) => p.slug === spec.slug);
    if (!product) continue;
    const facts = (await listFacts(scope, product.id, db)).filter((f) => f.status === "current").map((f) => ({ value: f.factValue, verified: Boolean(f.verifiedAt) }));
    const dest = storeDestination(facts);
    const report: LaunchStateReport = { slug: spec.slug, phase: dest ? "store_live" : "pre_launch", stale: [], cancelled: 0, replacement: null, skipped: [] };
    reports.push(report);
    if (!dest) continue;

    const videos = await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.productId, product.id), sql`${ms.msVideos.storyboard}->>'kind' = 'demo'`, inArray(ms.msVideos.status, ["qa_failed", "ready_for_review", "approved"])));
    let superseded = false;
    for (const v of videos) {
      const sb = v.storyboard as { ctaPhase?: string; stale?: StaleMark };
      if (sb.ctaPhase === "store_live" || sb.stale) continue;
      const hasHistory = async () => (await db.select({ id: ms.msPublications.id }).from(ms.msPublications).where(and(eq(ms.msPublications.videoId, v.id), inArray(ms.msPublications.status, HISTORICAL))).limit(1)).length > 0;
      if (await hasHistory()) {
        report.skipped.push(`${v.id} (already public, left untouched)`);
        continue;
      }
      const mark: StaleMark = { reason: "made before the game was live, so it carries the pre-launch follow call to action", at: (opts.now ?? new Date()).toISOString(), livePhase: "store_live", storeUrl: dest.url };
      await db.update(ms.msVideos).set({ storyboard: { ...sb, stale: mark } }).where(eq(ms.msVideos.id, v.id));
      // Race with a sending worker: it may have claimed a post between the history check above and the mark becoming visible. Ordering makes
      // both outcomes safe: a worker that claims after the mark is committed sees it and blocks; a worker that claimed before it is seen here,
      // and that post is history, so the mark comes off again and the video is left exactly as it was.
      if (await hasHistory()) {
        await db.update(ms.msVideos).set({ storyboard: sb }).where(eq(ms.msVideos.id, v.id));
        report.skipped.push(`${v.id} (went public while being checked, left untouched)`);
        continue;
      }
      const cancelled = await db
        .update(ms.msPublications)
        .set({ status: "cancelled", failureReason: "Cancelled: the video is stale (the game went live; its pre-launch call to action is out of date)", updatedAt: new Date() })
        .where(and(eq(ms.msPublications.videoId, v.id), inArray(ms.msPublications.status, UNSENT)))
        .returning({ id: ms.msPublications.id });
      report.stale.push(v.id);
      report.cancelled += cancelled.length;
      await audit(db, { actor: ACTOR, action: "video.stale", entity: "video", entityId: v.id, productId: product.id, detail: { storeUrl: dest.url, cancelledPublications: cancelled.length } });

      // Regenerate where safe: only under the owner-approved gate and no freeze. The render itself stays a governed, separate, one-at-a-time job.
      if (opts.regenerate !== false && !superseded) {
        try {
          await assertVideosNotFrozen(db);
          if (!(await videoExpansion(db))) throw new Error("video expansion is not approved");
          await db.update(ms.msVideos).set({ status: "superseded" }).where(eq(ms.msVideos.id, v.id));
          superseded = true;
          const row = await createDemoVideo(scope, ACTOR, product.id, db, { queue: false, replaceStale: true });
          report.replacement = row.id;
        } catch (e) {
          report.skipped.push(`not regenerated: ${e instanceof Error ? e.message : String(e)}`);
          if (superseded) await db.update(ms.msVideos).set({ status: v.status }).where(eq(ms.msVideos.id, v.id));
          superseded = false;
        }
      }
    }
  }
  return reports;
}

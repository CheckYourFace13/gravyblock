// Sends unpublished videos drawn before the logo-integrity gate back for a fresh render (owner directive 2026-11-08: fix logo violations before review).
// Only rows that were never uploaded are touched: status ready_for_review or approved, no review record, no passing logo_* QA check. Public and unlisted videos are left alone.
//   - a video whose script is a library angle is left for the loop: its next library_video job retires the old render and draws a fresh one under the logo gate
//   - any other video is retired (superseded) and, for a script that has no library angle, a fresh render is queued on the worker (--queue)
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-rerender-unpublished.ts [--dry] [--queue] [--skip slug,slug]
import { and, eq, inArray } from "drizzle-orm";
import { ms, closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { getAngles } from "../../src/lib/marketing-studio/library-store";
import { hasPassingLogoChecks } from "../../src/lib/marketing-studio/library-production";
import { listReviews } from "../../src/lib/marketing-studio/publishing/video-review";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { createDemoVideo } from "../../src/lib/marketing-studio/video/demo/queue";

const DRY = process.argv.includes("--dry");
const QUEUE = process.argv.includes("--queue");
const skip = new Set((process.argv.includes("--skip") ? process.argv[process.argv.indexOf("--skip") + 1] : "").split(",").filter(Boolean));
async function main() {
  const db = requireStudioDb();
  const products = await db.select().from(ms.msProducts);
  const reviews = await listReviews(db);
  const pubs = await db.select({ videoId: ms.msPublications.videoId }).from(ms.msPublications).where(inArray(ms.msPublications.status, ["published", "publishing", "revoked", "deleted"]));
  const rows = await db.select().from(ms.msVideos).where(inArray(ms.msVideos.status, ["ready_for_review", "approved"]));
  for (const v of rows) {
    const p = products.find((x) => x.id === v.productId);
    const sb = v.storyboard as { kind?: string; specId?: string } | null;
    if (!p || skip.has(p.slug) || sb?.kind !== "demo") continue;
    if (hasPassingLogoChecks(v.qa)) continue;
    if (reviews.some((r) => r.videoRowId === v.id) || pubs.some((x) => x.videoId === v.id)) continue;
    const specId = sb.specId ?? p.slug;
    const angle = (await getAngles(db, p.slug)).find((a) => a.specId === specId && a.yt);
    if (angle) {
      console.log(`${p.slug} ${v.id.slice(0, 8)} ${v.status}: library script ${specId}, the loop re-renders it${DRY ? " (dry)" : ""}`);
      continue;
    }
    console.log(`${p.slug} ${v.id.slice(0, 8)} ${v.status}: retired${QUEUE ? ", fresh render queued" : ""}${DRY ? " (dry)" : ""}`);
    if (DRY) continue;
    await db.update(ms.msVideos).set({ status: "superseded" }).where(and(eq(ms.msVideos.id, v.id), inArray(ms.msVideos.status, ["ready_for_review", "approved"])));
    if (QUEUE) await createDemoVideo(INTERNAL_SCOPE, "logo-rerender", p.id, db, { queue: true, specId: specId === p.slug ? undefined : specId, replaceStale: true }).catch((e) => console.log(`  no fresh render queued: ${e instanceof Error ? e.message.split("
")[0] : e}`));
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => closeStudioDb());

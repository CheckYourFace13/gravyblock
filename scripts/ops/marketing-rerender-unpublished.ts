// Sends unpublished videos drawn before the logo-integrity gate back for a fresh render (owner directive 2026-11-08: fix logo violations before review).
// Only rows that were never uploaded are touched: status ready_for_review or approved, no review record, no passing logo_* QA check. Public and unlisted videos are left alone.
// The row becomes superseded, its library angle goes back to planned (script kept), and the old finished job's dedupe key is retired so the loop queues a new render.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-rerender-unpublished.ts [--dry] [--skip slug,slug]
import { and, eq, inArray, sql } from "drizzle-orm";
import { ms, closeStudioDb, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { getAngles, updateAngle } from "../../src/lib/marketing-studio/library-store";
import { listReviews } from "../../src/lib/marketing-studio/publishing/video-review";

const DRY = process.argv.includes("--dry");
const skip = new Set((process.argv.includes("--skip") ? process.argv[process.argv.indexOf("--skip") + 1] : "").split(",").filter(Boolean));
async function main() {
  const db = requireStudioDb();
  const products = await db.select().from(ms.msProducts);
  const reviews = await listReviews(db);
  const rows = await db.select().from(ms.msVideos).where(inArray(ms.msVideos.status, ["ready_for_review", "approved"]));
  for (const v of rows) {
    const p = products.find((x) => x.id === v.productId);
    if (!p || skip.has(p.slug) || (v.storyboard as { kind?: string } | null)?.kind !== "demo") continue;
    const checks = (v.qa as { checks?: Array<{ id: string; ok: boolean }> } | null)?.checks ?? [];
    if (checks.some((c) => c.id.startsWith("logo_") && c.ok)) continue;
    if (reviews.some((r) => r.videoRowId === v.id)) continue;
    const angle = (await getAngles(db, p.slug)).find((a) => a.videoRowId === v.id);
    console.log(`${p.slug} ${v.id.slice(0, 8)} ${v.status}: ${angle ? `angle ${angle.specId} back to planned` : "no angle, superseded only"}${DRY ? " (dry)" : ""}`);
    if (DRY) continue;
    await db.update(ms.msVideos).set({ status: "superseded" }).where(and(eq(ms.msVideos.id, v.id), inArray(ms.msVideos.status, ["ready_for_review", "approved"])));
    if (angle?.specId) {
      await db.execute(sql`update ms_media_jobs set dedupe_key = dedupe_key || ':old-' || id::text where dedupe_key = ${`library_video:${angle.specId}`} and status in ('done','dead','cancelled')`);
      await updateAngle(db, "logo-rerender", p.slug, (a) => a.videoRowId === v.id, { status: "planned", videoRowId: undefined });
    }
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.stack : e); process.exitCode = 1; }).finally(() => closeStudioDb());

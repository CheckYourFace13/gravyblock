/**
 * The body of the `library_video` job the Marketing Studio worker runs: one planned video of the product's library, end to end.
 *   duplicate gate -> render (the worker's governor and one-heavy-job rule already decided it may start) -> full QA -> upload UNLISTED -> verify ->
 *   review email ("Video N of 3: role") -> the angle moves to unlisted_review. It never publishes: the owner's approval does that, on the same video.
 * Safe to run again after a crash: an existing render is reused and a half-finished upload resumes.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { ms, type StudioDb } from "./db";
import { checkDistinct, consumes, ROLE_LABEL } from "./library";
import { getAngles, updateAngle } from "./library-store";
import { prepareUnlistedReview } from "./publishing/review-upload";
import { listProducts } from "./repository";
import { INTERNAL_SCOPE } from "./scope";
import { createDemoVideo } from "./video/demo/queue";
import { renderDemoVideoJob } from "./video/demo/run";
import { demoSpecFor } from "./video/demo/specs";

const ACTOR = "library-worker";

export async function runLibraryVideo(db: StudioDb, input: { specId: string; attempt: number; maxAttempts: number }, log: (m: string) => void = () => {}): Promise<{ status: string; detail?: string }> {
  const spec = demoSpecFor(input.specId);
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === spec.slug);
  if (!product) throw new Error(`${spec.slug} is not a Studio product`);
  const angles = await getAngles(db, product.slug);
  const entry = angles.find((e) => e.specId === input.specId);
  if (!entry) throw new Error(`No library angle is registered for ${input.specId}`);
  if (["unlisted_review", "approved", "public"].includes(entry.status)) return { status: entry.status, detail: "already made" };

  // 1. the duplicate gate: a video that repeats an angle already consumed is never made
  const gate = checkDistinct(entry, angles.filter((e) => e.id !== entry.id && e.status !== "planned" && consumes(e)));
  if (!gate.ok) {
    await updateAngle(db, ACTOR, product.slug, (e) => e.id === entry.id, { status: "blocked" });
    return { status: "blocked", detail: `repeats an existing angle: ${gate.conflicts.map((c) => `${c.title} (${c.reasons.join(", ")})`).join("; ")}` };
  }
  if (!entry.yt) throw new Error(`The angle ${entry.id} has no YouTube title and description yet`);
  await updateAngle(db, ACTOR, product.slug, (e) => e.id === entry.id, { status: "in_production" });

  const fail = async (message: string) => {
    if (input.attempt >= input.maxAttempts) await updateAngle(db, ACTOR, product.slug, (e) => e.id === entry.id, { status: "blocked" });
    throw new Error(message);
  };
  try {
    // 2. the video: reuse an earlier attempt's render, else make one
    const rows = await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.productId, product.id), sql`${ms.msVideos.storyboard}->>'kind' = 'demo'`, sql`coalesce(${ms.msVideos.storyboard}->>'specId', ${product.slug}) = ${input.specId}`, gte(ms.msVideos.createdAt, new Date(Date.now() - 6 * 3_600_000)))).orderBy(sql`${ms.msVideos.createdAt} desc`);
    let video = rows.find((v) => (v.status === "ready_for_review" || v.status === "approved") && Boolean((v.qa as { passed?: boolean } | null)?.passed));
    if (!video) {
      let q = rows.find((v) => v.status === "queued");
      if (!q) {
        const stuck = rows.find((v) => v.status === "rendering" && Date.now() - v.createdAt.getTime() > 5 * 60_000);
        if (stuck) {
          await db.update(ms.msVideos).set({ status: "queued", error: null }).where(eq(ms.msVideos.id, stuck.id));
          q = { ...stuck, status: "queued" };
        }
      }
      if (!q) q = await createDemoVideo(INTERNAL_SCOPE, ACTOR, product.id, db, { queue: false, specId: input.specId });
      log(`rendering ${input.specId}: video ${q.id}`);
      const r = await renderDemoVideoJob({ videoId: q.id }, INTERNAL_SCOPE, db);
      if (r.status !== "ready_for_review") return await fail(`QA did not pass: ${r.failed.join("; ") || r.status}`);
      [video] = await db.select().from(ms.msVideos).where(eq(ms.msVideos.id, q.id));
    }
    // 3. upload unlisted, verify, email the owner with the library label
    const out = await prepareUnlistedReview(db, {
      slug: product.slug,
      specId: input.specId,
      videoRowId: video.id,
      title: entry.yt.title,
      description: entry.yt.description,
      intended: `${ROLE_LABEL[entry.role]} video for ${entry.funnel.replace("_", " ")} viewers: YouTube organic, the iScream Studio portfolio, the product site, and a candidate paid asset.`,
      placement: undefined,
      library: { position: entry.position, of: 3, roleLabel: ROLE_LABEL[entry.role] },
      upload: true,
      log,
    });
    if (!out.ok || !out.publicationId || !out.videoId) return await fail(out.blocked ?? "the upload did not complete");
    await updateAngle(db, ACTOR, product.slug, (e) => e.id === entry.id, { status: "unlisted_review", approval: "pending", videoRowId: video.id, youtubeId: out.videoId, publicationId: out.publicationId, publicationUrl: `https://www.youtube.com/watch?v=${out.videoId}` });
    return { status: "unlisted_review", detail: out.emailed ? "review email sent" : "uploaded; the review email could not be sent" };
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e));
  }
}

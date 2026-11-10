// Replaces a DEFECTIVE unlisted review copy of a video with a clean one, automatically: the same rendered file, a fresh video record, the exact title of the video that is public now,
// and a description with a single tracked link. The defective copy is superseded by the new review (same script), never published. The public video is never touched.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-clean-replacement.ts <slug> <defectiveReviewPublicationId> [--dry]
import { and, desc, eq, sql } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { prepareUnlistedReview } from "../../src/lib/marketing-studio/publishing/review-upload";
import { getReview } from "../../src/lib/marketing-studio/publishing/video-review";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";

/** Keeps the closing call to action but with a bare link: the upload step adds the one tracked link itself, so an already-tracked link would be doubled. */
export function bareLinks(caption: string): string {
  return caption.replace(/(https?:\/\/[^\s?]+)\?[^\s]*/g, "$1").trim();
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [slug, defectivePub] = args;
  const dry = process.argv.includes("--dry");
  if (!slug || !defectivePub) throw new Error("usage: <slug> <defectiveReviewPublicationId> [--dry]");
  const db = requireStudioDb();
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === slug);
  if (!product) throw new Error(`${slug} is not a Studio product`);
  const bad = await getReview(db, defectivePub);
  if (!bad) throw new Error("no review found for that publication");
  if (bad.status === "superseded") throw new Error("that review is already superseded");
  const [orig] = (await db.select().from(ms.msPublications).where(and(eq(ms.msPublications.productId, product.id), eq(ms.msPublications.platform, "youtube"), eq(ms.msPublications.status, "published"))).orderBy(desc(ms.msPublications.publishedAt))).filter((p) => p.id !== defectivePub && !/^\[TEST\]/i.test(p.title ?? "") && !/corrected logo/i.test(p.title ?? ""));
  if (!orig?.externalPostId) throw new Error(`no public source video found for ${slug}`);
  const [src] = await db.select().from(ms.msVideos).where(eq(ms.msVideos.id, bad.videoRowId));
  if (!src) throw new Error("the defective copy's video record is missing");
  // one clean replacement per defective copy: reuse it if an earlier run already made the record
  const existing = (await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.productId, product.id), eq(ms.msVideos.title, `${src.title} (clean)`)))).find((v) => v.assetId === src.assetId && (v.status === "ready_for_review" || v.status === "approved"));
  let videoRowId = existing?.id;
  if (!videoRowId && !dry) {
    const { id: _id, createdAt: _c, ...rest } = src;
    void _id;
    void _c;
    const [row] = await db.insert(ms.msVideos).values({ ...rest, title: `${src.title} (clean)`, status: "ready_for_review" }).returning();
    videoRowId = row.id;
  }
  const title = (orig.title ?? product.name).replace(/^\[TEST\]\s*/i, "").slice(0, 100);
  const description = bareLinks(orig.caption ?? "");
  console.log(`source public video ${orig.externalPostId}\nTITLE: ${title}\nDESCRIPTION:\n${description}\n`);
  if (dry || !videoRowId) return;
  // one publication exists per rendered file; the defective one keeps its YouTube video (it is only ever superseded in review) but gives up its claim on the file
  await db.execute(sql`update ms_publications set dedupe_key = dedupe_key || '|archived|' || id::text where id = ${defectivePub} and dedupe_key not like '%|archived|%'`);
  const out = await prepareUnlistedReview(db, {
    slug,
    videoRowId,
    title,
    description,
    intended: `CORRECTED LOGO VERSION of the public video https://www.youtube.com/watch?v=${orig.externalPostId}. It uses the untouched logo and passed the logo-integrity checks. This replaces an earlier review copy that had a wrong title and tracking link. Review only: the current public video has NOT been changed, unpublished or replaced.`,
    upload: true,
    log: (m) => console.log(m),
  });
  console.log(JSON.stringify({ slug, ok: out.ok, blocked: out.blocked, videoId: out.videoId, publicationId: out.publicationId, emailed: out.emailed }));
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());

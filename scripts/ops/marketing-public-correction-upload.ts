// Uploads a corrected-logo copy of a public video UNLISTED and emails the owner. The current public video is never touched. usage: <slug> <videoRowId>
import { and, desc, eq } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { prepareUnlistedReview } from "../../src/lib/marketing-studio/publishing/review-upload";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";

async function main() {
  const [slug, videoRowId] = process.argv.slice(2);
  const db = requireStudioDb();
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === slug);
  if (!product) throw new Error(`${slug} is not a Studio product`);
  const [orig] = await db.select().from(ms.msPublications).where(and(eq(ms.msPublications.productId, product.id), eq(ms.msPublications.platform, "youtube"), eq(ms.msPublications.status, "published"))).orderBy(desc(ms.msPublications.publishedAt)).limit(1);
  if (!orig?.externalPostId) throw new Error(`no published YouTube video found for ${slug}`);
  const title = `${(orig.title ?? product.name).slice(0, 80)} (corrected logo)`;
  const out = await prepareUnlistedReview(db, {
    slug,
    specId: undefined,
    videoRowId,
    title,
    description: orig.caption ?? "",
    intended: `CORRECTED LOGO VERSION of the public video https://www.youtube.com/watch?v=${orig.externalPostId}. The old public video was drawn with an altered logo. This copy uses the untouched logo and passed the logo-integrity checks. Review only: the current public video has NOT been changed, unpublished or replaced.`,
    upload: true,
    log: (m) => console.log(m),
  });
  console.log(JSON.stringify({ slug, ok: out.ok, blocked: out.blocked, videoId: out.videoId, publicationId: out.publicationId, emailed: out.emailed }));
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());

/**
 * GBP Photo Auto-Uploader
 *
 * For each paid business (growth+) with Google connected:
 *   1. Find recently published articles that have a cover image (from Unsplash)
 *      and haven't had a GBP photo uploaded yet
 *   2. Upload the cover image to their Google Business Profile via the Media API
 *   3. Record the upload in the jobs table to avoid re-uploading
 *
 * One photo per article, max batchSize photos per worker tick.
 * Uses coverImageUrl already stored on publishedContent — zero extra API cost.
 *
 * GBP best practice: fresh photos improve local pack ranking.
 */

import { and, desc, eq, gte, inArray, notInArray } from "drizzle-orm";
import { getDb, businesses, publishedContent, jobs } from "@/lib/db";
import { uploadGbpPhoto, isGbpConnected } from "@/lib/integrations/gbp-write";
import { normalizePlanTierFromDb } from "@/lib/plans";

const ELIGIBLE_TIERS = ["growth", "pro", "agency"];
// Only upload photos from articles published in the last 90 days
const LOOKBACK_DAYS = 90;

function buildJobType(publishedContentId: string): string {
  return `gbp_photo_${publishedContentId}`;
}

async function alreadyUploaded(publishedContentId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.type, buildJobType(publishedContentId)))
    .limit(1);
  return Boolean(row);
}

export async function runGbpPhotoUploadBatch(
  batchSize = 3,
): Promise<{ processed: number; uploaded: number; errors: number }> {
  const db = getDb();
  if (!db) return { processed: 0, uploaded: 0, errors: 0 };

  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);

  // Find eligible businesses
  const eligibleBizRows = await db
    .select({ id: businesses.id, planTier: businesses.planTier })
    .from(businesses)
    .where(inArray(businesses.planTier, ELIGIBLE_TIERS))
    .limit(50);

  if (eligibleBizRows.length === 0) return { processed: 0, uploaded: 0, errors: 0 };

  const eligibleIds = eligibleBizRows
    .filter((b) => ELIGIBLE_TIERS.includes(normalizePlanTierFromDb(b.planTier)))
    .map((b) => b.id);

  if (eligibleIds.length === 0) return { processed: 0, uploaded: 0, errors: 0 };

  // Find articles with cover images from the last 90 days
  const candidates = await db
    .select({
      id: publishedContent.id,
      businessId: publishedContent.businessId,
      title: publishedContent.title,
      coverImageUrl: publishedContent.coverImageUrl,
      coverImageCredit: publishedContent.coverImageCredit,
    })
    .from(publishedContent)
    .where(
      and(
        inArray(publishedContent.businessId, eligibleIds),
        eq(publishedContent.status, "published"),
        eq(publishedContent.channel, "internal_site"),
        gte(publishedContent.createdAt, since),
      ),
    )
    .orderBy(desc(publishedContent.createdAt))
    .limit(batchSize * 5);

  // Filter to ones that actually have a cover image and haven't been uploaded
  const withPhoto = candidates.filter((c) => c.coverImageUrl && c.businessId);

  let processed = 0;
  let uploaded = 0;
  let errors = 0;

  for (const article of withPhoto) {
    if (processed >= batchSize) break;
    if (!article.coverImageUrl || !article.businessId) continue;

    // Skip if already uploaded for this article
    if (await alreadyUploaded(article.id)) continue;

    // Skip if business doesn't have Google connected
    const connected = await isGbpConnected(article.businessId);
    if (!connected) continue;

    processed++;

    try {
      // Build description: article title + Unsplash credit (required by Unsplash ToS)
      const description = article.coverImageCredit
        ? `${article.title} | ${article.coverImageCredit}`
        : article.title;

      const result = await uploadGbpPhoto(article.businessId, {
        sourceUrl: article.coverImageUrl,
        description,
        category: "ADDITIONAL",
      });

      if (result.ok) {
        uploaded++;
        await db.insert(jobs).values({
          type: buildJobType(article.id),
          status: "completed",
          payload: {
            businessId: article.businessId,
            publishedContentId: article.id,
            mediaName: result.mediaName,
            articleTitle: article.title,
          },
        });
        console.info("[gbp-photo-uploader] uploaded photo", {
          businessId: article.businessId,
          articleId: article.id,
          mediaName: result.mediaName,
        });
      } else {
        errors++;
        console.error("[gbp-photo-uploader] upload failed", {
          businessId: article.businessId,
          error: result.error,
        });
      }
    } catch (err) {
      errors++;
      console.error("[gbp-photo-uploader] error", {
        businessId: article.businessId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { processed, uploaded, errors };
}

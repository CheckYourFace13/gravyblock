/**
 * GBP Photo Auto-Uploader
 *
 * For each paid business (growth+) with Google connected, uploads at most one
 * of the COMPANY'S OWN images per week to its Google Business Profile.
 *
 * Images come only from the Business Truth layer (og:image on the company's
 * own website pages). It used to upload stock photos (Unsplash article covers)
 * to customers' profiles, which misrepresents the business — that is gone.
 * Each upload is recorded as a jobs row (type gbp_photo_<hash>) with the
 * source page and Google's media resource name as evidence.
 */

import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, businesses, jobs } from "@/lib/db";
import { uploadGbpPhoto, isGbpConnected } from "@/lib/integrations/gbp-write";
import { normalizePlanTierFromDb } from "@/lib/plans";
import { getBusinessTruth } from "@/lib/truth";

const ELIGIBLE_TIERS = ["growth", "pro", "agency"];

const jobTypeFor = (url: string) => `gbp_photo_${createHash("sha1").update(url).digest("hex").slice(0, 16)}`;

export async function runGbpPhotoUploadBatch(
  batchSize = 3,
): Promise<{ processed: number; uploaded: number; errors: number }> {
  const db = getDb();
  if (!db) return { processed: 0, uploaded: 0, errors: 0 };

  const biz = await db
    .select({ id: businesses.id, name: businesses.name, planTier: businesses.planTier })
    .from(businesses)
    .where(inArray(businesses.planTier, ELIGIBLE_TIERS))
    .limit(50);

  let processed = 0;
  let uploaded = 0;
  let errors = 0;
  const weekAgo = new Date(Date.now() - 6 * 86_400_000);

  for (const b of biz) {
    if (processed >= batchSize) break;
    if (!ELIGIBLE_TIERS.includes(normalizePlanTierFromDb(b.planTier))) continue;
    if (!(await isGbpConnected(b.id))) continue;

    // One photo per business per week.
    const [recent] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.businessId, b.id), eq(jobs.type, "gbp_photo_upload"), gte(jobs.createdAt, weekAgo)))
      .limit(1);
    if (recent) continue;

    const truth = await getBusinessTruth(b.id);
    const images = truth.facts.filter((f) => f.key === "image");
    if (images.length === 0) continue;

    let chosen: (typeof images)[number] | null = null;
    for (const img of images) {
      const [done] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.businessId, b.id), eq(jobs.type, jobTypeFor(img.value)))).limit(1);
      if (!done) {
        chosen = img;
        break;
      }
    }
    if (!chosen) continue;

    processed++;
    try {
      const result = await uploadGbpPhoto(b.id, {
        sourceUrl: chosen.value,
        description: b.name,
        category: "ADDITIONAL",
      });
      if (result.ok) {
        uploaded++;
        await db.insert(jobs).values({ businessId: b.id, type: jobTypeFor(chosen.value), status: "completed", payload: { sourceUrl: chosen.value, fromPage: chosen.sourceUrl, mediaName: result.mediaName } });
        await db.insert(jobs).values({ businessId: b.id, type: "gbp_photo_upload", status: "completed", payload: { sourceUrl: chosen.value, mediaName: result.mediaName } });
      } else {
        errors++;
        console.error("[gbp-photo-uploader] upload failed", { businessId: b.id, error: result.error });
      }
    } catch (err) {
      errors++;
      console.error("[gbp-photo-uploader] error", { businessId: b.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { processed, uploaded, errors };
}

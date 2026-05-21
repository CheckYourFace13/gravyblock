/**
 * GBP Review Auto-Responder
 *
 * For each paid business (growth+) with Google connected:
 *   1. Fetch unanswered reviews via listPendingReviews()
 *   2. Generate a personalised AI reply
 *   3. Post the reply via replyToReview()
 *
 * Runs every worker tick; safe to run repeatedly — only touches reviews
 * that have no reply yet.
 */

import { inArray } from "drizzle-orm";
import { getDb, businesses } from "@/lib/db";
import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";
import { listPendingReviews, replyToReview, isGbpConnected } from "@/lib/integrations/gbp-write";
import { normalizePlanTierFromDb } from "@/lib/plans";

const ELIGIBLE_TIERS = ["growth", "pro", "agency"];

const STYLE_RULES = `Reply rules:
- No em dashes. Use commas or short sentences instead.
- No clichés: "delve", "leverage", "comprehensive", "robust", "moreover", "furthermore".
- Sound like a real local business owner, not a PR bot.
- Keep it under 80 words.
- Thank them by first name if available.
- For 1-2 star reviews: acknowledge the concern briefly, invite them to contact directly — no excuses.
- For 3-5 star reviews: express genuine thanks, reference something specific from the review.`;

async function generateReviewReply(params: {
  businessName: string;
  reviewerName: string;
  starRating: string;
  reviewText: string;
}): Promise<string | null> {
  const stars = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }[params.starRating] ?? 5;
  return openRouterChat({
    model: MODELS.content,
    messages: [{
      role: "user",
      content: `Write a Google review reply for ${params.businessName}.

Reviewer: ${params.reviewerName}
Stars: ${stars}/5
Review: "${params.reviewText || "(no text provided)"}"

${STYLE_RULES}

Write the reply now — no quotes, no label, just the reply text.`,
    }],
    maxTokens: 150,
    temperature: 0.7,
  });
}

export async function runGbpReviewReplyBatch(
  batchSize = 5,
): Promise<{ processed: number; replied: number; errors: number }> {
  const db = getDb();
  if (!db) return { processed: 0, replied: 0, errors: 0 };

  const eligibleBizRows = await db
    .select({ id: businesses.id, name: businesses.name, planTier: businesses.planTier })
    .from(businesses)
    .where(inArray(businesses.planTier, ELIGIBLE_TIERS))
    .limit(batchSize * 3);

  let processed = 0;
  let replied = 0;
  let errors = 0;

  for (const biz of eligibleBizRows) {
    if (processed >= batchSize) break;

    const tier = normalizePlanTierFromDb(biz.planTier);
    if (!ELIGIBLE_TIERS.includes(tier)) continue;

    const connected = await isGbpConnected(biz.id);
    if (!connected) continue;

    processed++;

    try {
      const pendingReviews = await listPendingReviews(biz.id);
      if (pendingReviews.length === 0) continue;

      // Process one review per business per tick to avoid rate limits
      const review = pendingReviews[0]!;
      const replyText = await generateReviewReply({
        businessName: biz.name,
        reviewerName: review.reviewer.displayName ?? "there",
        starRating: review.starRating,
        reviewText: review.comment ?? "",
      });

      if (!replyText) continue;

      const result = await replyToReview(biz.id, review.name, replyText.trim());
      if (result.ok) {
        replied++;
        console.info("[gbp-review-responder] replied to review", {
          businessId: biz.id,
          reviewName: review.name,
          stars: review.starRating,
        });
      } else {
        errors++;
        console.error("[gbp-review-responder] reply failed", { businessId: biz.id, error: result.error });
      }
    } catch (err) {
      errors++;
      console.error("[gbp-review-responder] error", {
        businessId: biz.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { processed, replied, errors };
}

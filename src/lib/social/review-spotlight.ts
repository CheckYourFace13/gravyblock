/**
 * Review spotlight — turns real 4-5 star reviews into social posts.
 *
 * Finds a recent, substantial positive review (synced by platform-sync from
 * Google/Yelp/TripAdvisor), writes a Facebook post and an Instagram caption
 * around a short quoted excerpt, and queues both as "pending_approval" so the
 * owner approves them in the workspace content queue before the existing
 * facebook-poster publishes them.
 *
 * Guardrails:
 *  - only reviews with enough text to quote (no bare star ratings)
 *  - each review is spotlighted at most once (tracked via contentQueue.targetKeyword)
 *  - at most one spotlight per business per week (jobs table)
 *  - reviewer credited as first name + last initial, never full name
 */

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, businesses, businessReviews, contentQueue, jobs } from "@/lib/db";
import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";
import { containsPlaceholderArtifact } from "@/lib/content-gen/quality-guard";

const ELIGIBLE_TIERS = ["growth", "pro", "agency", "managed"];
const MIN_REVIEW_TEXT_LENGTH = 60;
const REVIEW_MAX_AGE_DAYS = 90;

const STYLE_RULES = `Writing rules:
- No em dashes. Use commas or periods instead.
- No AI clichés: "delve", "leverage", "comprehensive", "robust", "moreover", "furthermore".
- Sound like a proud local business owner sharing a genuine customer moment, not a marketer.
- Never invent details that aren't in the review.
- Never write placeholders like [Name] or [City].`;

/** "Jennifer Alvarez" -> "Jennifer A." — never publish a reviewer's full name. */
function displayNameFor(authorName: string | null): string {
  if (!authorName?.trim()) return "a customer";
  const parts = authorName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

function excerptFor(text: string, maxLen = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 80))}…`;
}

const PLATFORM_LABELS: Record<string, string> = {
  google: "Google",
  yelp: "Yelp",
  tripadvisor: "TripAdvisor",
};

async function generateSpotlight(params: {
  kind: "facebook_post" | "instagram_caption";
  businessName: string;
  city: string | null;
  reviewerDisplay: string;
  rating: number;
  excerpt: string;
  platformLabel: string;
}): Promise<string | null> {
  const isInstagram = params.kind === "instagram_caption";
  return openRouterChat({
    model: MODELS.content,
    messages: [{
      role: "user",
      content: `Write a ${isInstagram ? "Instagram caption" : "Facebook post"} for ${params.businessName}${params.city ? ` in ${params.city}` : ""} celebrating a real customer review.

The review (${params.rating}/5 stars on ${params.platformLabel}, from ${params.reviewerDisplay}):
"${params.excerpt}"

${STYLE_RULES}

Requirements:
- ${isInstagram ? "70-110" : "80-150"} words
- Open with a warm hook, not "We got a review!"
- Quote a short phrase from the review verbatim (in quotation marks), credit ${params.reviewerDisplay}
- Thank the customer genuinely
- End with a soft invitation for others to visit or book${params.city ? `, mentioning ${params.city} naturally` : ""}
${isInstagram ? "- End with 6-10 relevant hashtags on a new line (mix local + industry)" : "- No hashtags"}
- Plain text, no markdown

Write the ${isInstagram ? "caption" : "post"} now.`,
    }],
    maxTokens: 320,
    temperature: 0.75,
  });
}

function cityFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",");
  if (parts.length >= 2) return parts[1].trim();
  return null;
}

export type ReviewSpotlightResult = {
  businessesConsidered: number;
  spotlightsQueued: number;
};

export async function runReviewSpotlightBatch(batchSize = 3): Promise<ReviewSpotlightResult> {
  const db = getDb();
  if (!db) return { businessesConsidered: 0, spotlightsQueued: 0 };

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const reviewCutoff = new Date(Date.now() - REVIEW_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      address: businesses.address,
      planTier: businesses.planTier,
    })
    .from(businesses)
    .where(inArray(businesses.planTier, ELIGIBLE_TIERS))
    .limit(batchSize * 4);

  const result: ReviewSpotlightResult = { businessesConsidered: 0, spotlightsQueued: 0 };

  for (const biz of candidates) {
    if (result.businessesConsidered >= batchSize) break;

    const jobType = `review_spotlight_${biz.id}`;
    const [recent] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.type, jobType), gte(jobs.createdAt, weekAgo)))
      .limit(1);
    if (recent) continue;

    // Newest substantial positive reviews first
    const reviews = await db
      .select({
        id: businessReviews.id,
        authorName: businessReviews.authorName,
        rating: businessReviews.rating,
        text: businessReviews.text,
        source: businessReviews.source,
        publishTime: businessReviews.publishTime,
      })
      .from(businessReviews)
      .where(and(
        eq(businessReviews.businessId, biz.id),
        gte(businessReviews.rating, 4),
      ))
      .orderBy(desc(businessReviews.publishTime))
      .limit(10);

    const usable = reviews.filter((r) =>
      (r.text?.replace(/\s+/g, " ").trim().length ?? 0) >= MIN_REVIEW_TEXT_LENGTH &&
      (!r.publishTime || r.publishTime >= reviewCutoff),
    );
    if (!usable.length) continue;

    // Skip reviews we've already spotlighted (review id stored in targetKeyword)
    const spotlighted = await db
      .select({ targetKeyword: contentQueue.targetKeyword })
      .from(contentQueue)
      .where(and(
        eq(contentQueue.businessId, biz.id),
        eq(contentQueue.variant, "review_spotlight"),
      ))
      .limit(200);
    const usedIds = new Set(spotlighted.map((s) => s.targetKeyword).filter(Boolean));

    const review = usable.find((r) => !usedIds.has(r.id));
    if (!review) continue;

    result.businessesConsidered++;

    const city = cityFromAddress(biz.address);
    const reviewerDisplay = displayNameFor(review.authorName);
    const excerpt = excerptFor(review.text ?? "");
    const platformLabel = PLATFORM_LABELS[review.source] ?? "Google";

    const kinds = ["facebook_post", "instagram_caption"] as const;
    const rows: Array<typeof contentQueue.$inferInsert> = [];

    for (const kind of kinds) {
      const body = await generateSpotlight({
        kind,
        businessName: biz.name,
        city,
        reviewerDisplay,
        rating: review.rating,
        excerpt,
        platformLabel,
      });
      if (!body || containsPlaceholderArtifact(body)) continue;

      rows.push({
        businessId: biz.id,
        kind,
        title: `Customer spotlight: ${review.rating}★ review from ${reviewerDisplay}`,
        outline: body,
        targetKeyword: review.id,
        status: "pending_approval",
        variant: "review_spotlight",
      });
    }

    if (rows.length > 0) {
      await db.insert(contentQueue).values(rows);
      result.spotlightsQueued += rows.length;
      console.info("[review-spotlight] queued", { businessId: biz.id, reviewId: review.id, posts: rows.length });
    }

    await db.insert(jobs).values({
      businessId: biz.id,
      type: jobType,
      status: "completed",
      payload: { reviewId: review.id, queued: rows.length },
    });
  }

  return result;
}

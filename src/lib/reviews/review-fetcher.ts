/**
 * Fetches Google reviews from the Places API and generates AI reply suggestions.
 * Runs weekly per paid business via the worker.
 * Tracked via jobs table: type = "review_fetch_run", payload = { businessId }.
 */

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, businesses, businessReviews, jobs } from "@/lib/db";
import { sendNewReviewsEmail } from "@/lib/integrations/resend";

const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];

type PlacesReview = {
  time: number;
  author_name: string;
  author_url?: string;
  profile_photo_url?: string;
  rating: number;
  text?: string;
  relative_time_description?: string;
};

async function fetchPlaceReviews(placeId: string): Promise<PlacesReview[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return [];

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "reviews");
  url.searchParams.set("key", key);
  url.searchParams.set("reviews_sort", "newest");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];

  const json = (await res.json()) as {
    status?: string;
    result?: { reviews?: PlacesReview[] };
  };

  return json.result?.reviews ?? [];
}

async function generateReplyDraft(params: {
  businessName: string;
  rating: number;
  reviewText: string;
}): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const tone = params.rating >= 4
    ? "warm and grateful"
    : params.rating === 3
    ? "understanding and constructive"
    : "empathetic and solution-focused";

  const prompt = `Write a short, professional Google review reply for ${params.businessName}.

Review rating: ${params.rating}/5 stars
Review text: "${params.reviewText}"

Tone: ${tone}
Instructions:
- 2-4 sentences maximum
- Don't be generic or robotic
- If negative, acknowledge the issue and offer to resolve it
- Sign off naturally without using the business name again
- Never include placeholders like [Name] or [Phone]
- Return only the reply text, nothing else`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "http-referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.1-8b-instruct:free",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

function reviewIdFromPlacesReview(placeId: string, review: PlacesReview): string {
  return `${placeId}:${review.time}:${review.author_name.slice(0, 20)}`;
}

export async function syncReviewsForBusiness(businessId: string): Promise<{ fetched: number; newReviews: number }> {
  const db = getDb();
  if (!db) return { fetched: 0, newReviews: 0 };

  const [biz] = await db
    .select({ name: businesses.name, placeId: businesses.placeId, billingEmail: businesses.billingEmail })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz?.placeId) return { fetched: 0, newReviews: 0 };

  const reviews = await fetchPlaceReviews(biz.placeId);
  if (reviews.length === 0) return { fetched: 0, newReviews: 0 };

  const existingIds = await db
    .select({ googleReviewId: businessReviews.googleReviewId })
    .from(businessReviews)
    .where(eq(businessReviews.businessId, businessId));

  const existingSet = new Set(existingIds.map((r) => r.googleReviewId));
  let newReviews = 0;
  const newInserted: Array<{
    authorName: string;
    rating: number;
    text: string | null;
    suggestedReply: string | null;
    publishTime: Date | null;
  }> = [];

  for (const review of reviews) {
    const reviewId = reviewIdFromPlacesReview(biz.placeId, review);
    if (existingSet.has(reviewId)) continue;

    const suggestedReply = review.text
      ? await generateReplyDraft({ businessName: biz.name, rating: review.rating, reviewText: review.text })
      : null;

    await db.insert(businessReviews).values({
      businessId,
      googleReviewId: reviewId,
      authorName: review.author_name,
      authorPhotoUri: review.profile_photo_url,
      rating: review.rating,
      text: review.text,
      publishTime: review.time ? new Date(review.time * 1000) : null,
      suggestedReply,
      status: "new",
    });

    newInserted.push({
      authorName: review.author_name,
      rating: review.rating,
      text: review.text ?? null,
      suggestedReply: suggestedReply ?? null,
      publishTime: review.time ? new Date(review.time * 1000) : null,
    });
    newReviews++;
  }

  // Email the business owner about new reviews with suggested replies
  if (newInserted.length > 0 && biz.billingEmail) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
    await sendNewReviewsEmail({
      to: biz.billingEmail,
      businessName: biz.name,
      workspaceUrl: `${siteUrl}/workspace/${businessId}`,
      reviews: newInserted,
    }).catch((err) =>
      console.error("[review-fetcher] failed to send review email", { businessId, error: String(err) }),
    );
  }

  return { fetched: reviews.length, newReviews };
}

export async function runReviewSyncBatch(batchSize = 5): Promise<{ synced: number; newReviews: number }> {
  const db = getDb();
  if (!db) return { synced: 0, newReviews: 0 };

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const paid = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(inArray(businesses.planTier, PAID_TIERS))
    .limit(50);

  let synced = 0;
  let totalNew = 0;

  for (const biz of paid.slice(0, batchSize)) {
    const [recent] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.type, "review_fetch_run"),
          gte(jobs.createdAt, weekAgo),
          sql`${jobs.payload}->>'businessId' = ${biz.id}`,
        ),
      )
      .limit(1);

    if (recent) continue;

    try {
      const result = await syncReviewsForBusiness(biz.id);
      await db.insert(jobs).values({
        type: "review_fetch_run",
        status: "completed",
        payload: { businessId: biz.id, fetched: result.fetched, newReviews: result.newReviews },
      });
      totalNew += result.newReviews;
      synced++;
    } catch (err) {
      console.error("[review-fetcher] sync failed", {
        businessId: biz.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { synced, newReviews: totalNew };
}

export async function getBusinessReviews(businessId: string, limit = 20) {
  const db = getDb();
  if (!db) return [];

  return db
    .select()
    .from(businessReviews)
    .where(eq(businessReviews.businessId, businessId))
    .orderBy(desc(businessReviews.publishTime))
    .limit(limit);
}

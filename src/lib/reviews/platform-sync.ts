/**
 * Unified multi-platform review sync.
 * Runs Google + Yelp + TripAdvisor in sequence for each business,
 * collects all new reviews, then sends a single email to the owner.
 *
 * The worker calls runMultiPlatformReviewBatch() instead of individual fetchers.
 */

import { and, desc, eq, inArray, gte, sql } from "drizzle-orm";
import { getDb, businesses, businessReviews, jobs } from "@/lib/db";
import { sendNewReviewsEmail } from "@/lib/integrations/resend";
import { syncYelpReviewsForBusiness } from "./yelp-fetcher";
import { syncTripAdvisorReviewsForBusiness } from "./tripadvisor-fetcher";

const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];

// ─── Shared AI reply generator (same model as Google) ─────────────────────────

async function generateReplyDraft(params: {
  businessName: string;
  rating: number;
  reviewText: string;
}): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const tone =
    params.rating >= 4
      ? "warm and grateful"
      : params.rating === 3
      ? "understanding and constructive"
      : "empathetic and solution-focused";

  const prompt = `Write a short, professional review reply for ${params.businessName}.

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
        model: "google/gemini-flash-1.5",
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

// ─── Google sync (extracted from review-fetcher for unified use) ──────────────

type PlacesReview = {
  time: number;
  author_name: string;
  profile_photo_url?: string;
  rating: number;
  text?: string;
};

async function fetchGoogleReviews(placeId: string): Promise<PlacesReview[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return [];
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "reviews");
  url.searchParams.set("key", key);
  url.searchParams.set("reviews_sort", "newest");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const json = (await res.json()) as { result?: { reviews?: PlacesReview[] } };
  return json.result?.reviews ?? [];
}

type NewReview = {
  authorName: string;
  rating: number;
  text: string | null;
  suggestedReply: string | null;
  publishTime: Date | null;
  source: string;
};

async function syncGoogleReviewsForBusiness(
  businessId: string,
  placeId: string,
  bizName: string,
): Promise<NewReview[]> {
  const db = getDb();
  if (!db) return [];

  const reviews = await fetchGoogleReviews(placeId);
  if (reviews.length === 0) return [];

  const existingIds = await db
    .select({ googleReviewId: businessReviews.googleReviewId })
    .from(businessReviews)
    .where(eq(businessReviews.businessId, businessId));

  const existingSet = new Set(existingIds.map((r) => r.googleReviewId));
  const newInserted: NewReview[] = [];

  for (const review of reviews) {
    const externalId = `${placeId}:${review.time}:${review.author_name.slice(0, 20)}`;
    if (existingSet.has(externalId)) continue;

    const suggestedReply = review.text
      ? await generateReplyDraft({ businessName: bizName, rating: review.rating, reviewText: review.text })
      : null;

    const publishTime = review.time ? new Date(review.time * 1000) : null;

    await db.insert(businessReviews).values({
      businessId,
      googleReviewId: externalId,
      source: "google",
      authorName: review.author_name,
      authorPhotoUri: review.profile_photo_url,
      rating: review.rating,
      text: review.text,
      publishTime,
      suggestedReply,
      status: "new",
    });

    newInserted.push({
      authorName: review.author_name,
      rating: review.rating,
      text: review.text ?? null,
      suggestedReply,
      publishTime,
      source: "google",
    });
  }

  return newInserted;
}

// ─── Public: sync a single business across all platforms ─────────────────────

export async function syncAllReviewsForBusiness(businessId: string): Promise<{
  fetched: number;
  newReviews: number;
}> {
  const db = getDb();
  if (!db) return { fetched: 0, newReviews: 0 };

  const [biz] = await db
    .select({
      name: businesses.name,
      placeId: businesses.placeId,
      billingEmail: businesses.billingEmail,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) return { fetched: 0, newReviews: 0 };

  const allNew: NewReview[] = [];

  // Google
  if (biz.placeId) {
    const googleNew = await syncGoogleReviewsForBusiness(businessId, biz.placeId, biz.name);
    allNew.push(...googleNew);
  }

  // Yelp (only if key is configured)
  if (process.env.YELP_API_KEY) {
    const yelp = await syncYelpReviewsForBusiness(businessId, generateReplyDraft);
    allNew.push(...yelp.newInserted);
  }

  // TripAdvisor (only if key is configured)
  if (process.env.TRIPADVISOR_API_KEY) {
    const ta = await syncTripAdvisorReviewsForBusiness(businessId, generateReplyDraft);
    allNew.push(...ta.newInserted);
  }

  // Send one combined email if any new reviews across all platforms
  if (allNew.length > 0 && biz.billingEmail) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
    await sendNewReviewsEmail({
      to: biz.billingEmail,
      businessName: biz.name,
      workspaceUrl: `${siteUrl}/workspace/${businessId}`,
      reviews: allNew,
    }).catch((err) =>
      console.error("[platform-sync] failed to send review email", { businessId, error: String(err) }),
    );
  }

  return { fetched: allNew.length, newReviews: allNew.length };
}

// ─── Public: batch runner called by the worker ───────────────────────────────

export async function runMultiPlatformReviewBatch(batchSize = 5): Promise<{
  synced: number;
  newReviews: number;
}> {
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
      const result = await syncAllReviewsForBusiness(biz.id);
      await db.insert(jobs).values({
        type: "review_fetch_run",
        status: "completed",
        payload: { businessId: biz.id, newReviews: result.newReviews },
      });
      totalNew += result.newReviews;
      synced++;
    } catch (err) {
      console.error("[platform-sync] sync failed", {
        businessId: biz.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { synced, newReviews: totalNew };
}

// ─── Re-export for workspace page use ────────────────────────────────────────

export { businessReviews };

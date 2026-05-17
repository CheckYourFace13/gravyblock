/**
 * Unified multi-platform review sync.
 *
 * Platform strategy (cheapest first):
 *  - Google    → Google Places API (free, already configured)
 *  - Yelp      → Yelp Fusion API   (free, YELP_API_KEY)
 *  - TripAdvisor / Facebook / Trustpilot → DataForSEO (~$0.003/review, DATAFORSEO_LOGIN)
 *
 * All platforms are independently gated on their env var — safe to deploy without any of them.
 * The worker calls runMultiPlatformReviewBatch() once per business per week.
 */

import { and, desc, eq, inArray, gte, sql } from "drizzle-orm";
import { getDb, businesses, businessReviews, jobs, publishedContent, contentQueue } from "@/lib/db";
import { sendWeeklyDigestEmail } from "@/lib/integrations/resend";
import { syncYelpReviewsForBusiness } from "./yelp-fetcher";
import { syncDataForSeoReviewsForBusiness } from "./dataforseo-fetcher";

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

type NewReview = {
  authorName: string;
  rating: number;
  text: string | null;
  suggestedReply: string | null;
  publishTime: Date | null;
  source: string;
};

// ─── Smart platform detection ────────────────────────────────────────────────
// Only query paid platforms that are actually relevant for the business type.
// Saves DataForSEO cost and avoids pointless API calls.

type DfsPlatformName = "tripadvisor" | "facebook" | "trustpilot";

const TRIPADVISOR_KEYWORDS = [
  "restaurant", "bar", "cafe", "coffee", "bistro", "diner", "eatery", "food",
  "hotel", "motel", "inn", "resort", "lodge", "hostel", "airbnb",
  "brewery", "winery", "distillery", "pub", "tavern", "lounge", "nightclub",
  "tourism", "attraction", "museum", "theater", "theatre", "entertainment",
  "spa", "salon", "beauty",
];

const TRUSTPILOT_KEYWORDS = [
  "law", "lawyer", "attorney", "legal", "firm",
  "financial", "finance", "insurance", "accounting", "accountant", "tax",
  "consultant", "consulting", "agency", "advisor", "adviser",
  "mortgage", "real estate", "realty", "investment", "wealth",
  "software", "tech", "saas", "online",
];

function getRelevantDfsPlatforms(
  vertical: string | null | undefined,
  primaryCategory: string | null | undefined,
): DfsPlatformName[] {
  const haystack = [vertical, primaryCategory]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const platforms: DfsPlatformName[] = ["facebook"]; // always relevant

  if (TRIPADVISOR_KEYWORDS.some((kw) => haystack.includes(kw))) {
    platforms.push("tripadvisor");
  }

  if (TRUSTPILOT_KEYWORDS.some((kw) => haystack.includes(kw))) {
    platforms.push("trustpilot");
  }

  return platforms;
}

// ─── Google Places API (free) ─────────────────────────────────────────────────

type PlacesReview = {
  time: number;
  author_name: string;
  profile_photo_url?: string;
  rating: number;
  text?: string;
};

async function syncGooglePlacesReviews(
  businessId: string,
  placeId: string,
  bizName: string,
): Promise<NewReview[]> {
  const db = getDb();
  if (!db) return [];

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "reviews");
  url.searchParams.set("key", process.env.GOOGLE_PLACES_API_KEY!);
  url.searchParams.set("reviews_sort", "newest");

  let reviews: PlacesReview[] = [];
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as { result?: { reviews?: PlacesReview[] } };
      reviews = json.result?.reviews ?? [];
    }
  } catch {
    return [];
  }

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
      vertical: businesses.vertical,
      primaryCategory: businesses.primaryCategory,
      rating: businesses.rating,
      reviewCount: businesses.reviewCount,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) return { fetched: 0, newReviews: 0 };

  const allNew: NewReview[] = [];

  // ── Google: free via Places API (everyone) ───────────────────────────────────
  if (biz.placeId && process.env.GOOGLE_PLACES_API_KEY) {
    const googleNew = await syncGooglePlacesReviews(businessId, biz.placeId, biz.name);
    allNew.push(...googleNew);
  }

  // ── Yelp: free via Fusion API (everyone) ────────────────────────────────────
  if (process.env.YELP_API_KEY) {
    const yelp = await syncYelpReviewsForBusiness(businessId, generateReplyDraft);
    allNew.push(...yelp.newInserted);
  }

  // ── DataForSEO: only platforms relevant to this business type ────────────────
  if (process.env.DATAFORSEO_LOGIN) {
    const relevantPlatforms = getRelevantDfsPlatforms(biz.vertical, biz.primaryCategory);
    console.info("[platform-sync] relevant platforms for business", {
      businessId,
      vertical: biz.vertical,
      primaryCategory: biz.primaryCategory,
      platforms: relevantPlatforms,
    });

    const results = await Promise.allSettled(
      relevantPlatforms.map((platform) =>
        syncDataForSeoReviewsForBusiness(businessId, platform, generateReplyDraft),
      ),
    );
    for (const result of results) {
      if (result.status === "fulfilled") allNew.push(...result.value.newInserted);
    }
  }

  // ── Gather extra context for the digest email ────────────────────────────────
  if (biz.billingEmail) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
    const weekAgoDate = new Date();
    weekAgoDate.setDate(weekAgoDate.getDate() - 7);

    const [publishedRows, queuedRows] = await Promise.all([
      db
        .select({ title: publishedContent.title, channel: publishedContent.channel, publicUrl: publishedContent.publicUrl })
        .from(publishedContent)
        .where(and(eq(publishedContent.businessId, businessId), gte(publishedContent.createdAt, weekAgoDate)))
        .orderBy(desc(publishedContent.createdAt))
        .limit(5),
      db
        .select({ title: contentQueue.title, kind: contentQueue.kind, targetKeyword: contentQueue.targetKeyword })
        .from(contentQueue)
        .where(and(eq(contentQueue.businessId, businessId), eq(contentQueue.status, "queued")))
        .orderBy(contentQueue.createdAt)
        .limit(3),
    ]);

    // Group new reviews by platform, cap at 5 per platform
    const grouped = new Map<string, typeof allNew>();
    for (const r of allNew) {
      if (!grouped.has(r.source)) grouped.set(r.source, []);
      const arr = grouped.get(r.source)!;
      if (arr.length < 5) arr.push(r);
    }

    await sendWeeklyDigestEmail({
      to: biz.billingEmail,
      businessName: biz.name,
      workspaceUrl: `${siteUrl}/workspace/${businessId}`,
      googleRating: biz.rating ?? null,
      totalReviewCount: biz.reviewCount ?? 0,
      reviewGroups: Array.from(grouped.entries()).map(([source, reviews]) => ({ source, reviews })),
      publishedThisWeek: publishedRows,
      contentQueued: queuedRows,
    }).catch((err) =>
      console.error("[platform-sync] failed to send digest email", { businessId, error: String(err) }),
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

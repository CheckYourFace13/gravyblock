/**
 * Fetches TripAdvisor reviews via the TripAdvisor Content API v3.
 * Auto-discovers the TripAdvisor location ID from the business name + address on first run
 * and caches it in businesses.tripAdvisorLocationId for future syncs.
 *
 * Requires: TRIPADVISOR_API_KEY environment variable.
 * Free tier: 5,000 requests/month. Returns up to 5 reviews per call.
 * Most useful for restaurants, hotels, and tourism-adjacent businesses.
 */

import { eq } from "drizzle-orm";
import { getDb, businesses, businessReviews } from "@/lib/db";

type TALocationSearchResult = {
  data?: Array<{ location_id: string; name: string; address_obj?: { address_string?: string } }>;
};

type TAReview = {
  id: string;
  rating: number;
  text?: string;
  title?: string;
  published_date: string; // ISO 8601
  user?: {
    username?: string;
    avatar?: { small?: string };
  };
};

type TAReviewsResult = {
  data?: TAReview[];
};

const TA_BASE = "https://api.content.tripadvisor.com/api/v1";

/** Search TripAdvisor for a location ID by business name + address. */
async function discoverTripAdvisorLocationId(params: {
  name: string;
  address: string | null | undefined;
}): Promise<string | null> {
  const key = process.env.TRIPADVISOR_API_KEY;
  if (!key) return null;

  const query = [params.name, params.address].filter(Boolean).join(", ");
  if (!query) return null;

  const url = new URL(`${TA_BASE}/location/search`);
  url.searchParams.set("key", key);
  url.searchParams.set("searchQuery", query);
  url.searchParams.set("language", "en");

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      console.warn("[tripadvisor] location search failed", { status: res.status });
      return null;
    }
    const json = (await res.json()) as TALocationSearchResult;
    return json.data?.[0]?.location_id ?? null;
  } catch (err) {
    console.error("[tripadvisor] discovery error", { error: String(err) });
    return null;
  }
}

/** Fetch reviews for a known TripAdvisor location ID. */
async function fetchTripAdvisorReviews(locationId: string): Promise<TAReview[]> {
  const key = process.env.TRIPADVISOR_API_KEY;
  if (!key) return [];

  const url = new URL(`${TA_BASE}/location/${encodeURIComponent(locationId)}/reviews`);
  url.searchParams.set("key", key);
  url.searchParams.set("language", "en");

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      console.warn("[tripadvisor] reviews fetch failed", { status: res.status, locationId });
      return [];
    }
    const json = (await res.json()) as TAReviewsResult;
    return json.data ?? [];
  } catch (err) {
    console.error("[tripadvisor] reviews error", { error: String(err) });
    return [];
  }
}

export type TripAdvisorSyncResult = {
  fetched: number;
  newReviews: number;
  newInserted: Array<{
    authorName: string;
    rating: number;
    text: string | null;
    suggestedReply: string | null;
    publishTime: Date | null;
    source: "tripadvisor";
  }>;
};

/**
 * Sync TripAdvisor reviews for a business.
 * Returns newly inserted reviews so the caller can include them in owner emails.
 */
export async function syncTripAdvisorReviewsForBusiness(
  businessId: string,
  generateReply: (params: { businessName: string; rating: number; reviewText: string }) => Promise<string | null>,
): Promise<TripAdvisorSyncResult> {
  const db = getDb();
  if (!db) return { fetched: 0, newReviews: 0, newInserted: [] };

  const [biz] = await db
    .select({
      name: businesses.name,
      address: businesses.address,
      tripAdvisorLocationId: businesses.tripAdvisorLocationId,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) return { fetched: 0, newReviews: 0, newInserted: [] };

  // Auto-discover TripAdvisor location if not cached
  let locationId = biz.tripAdvisorLocationId;
  if (!locationId) {
    locationId = await discoverTripAdvisorLocationId({
      name: biz.name,
      address: biz.address,
    });

    if (locationId) {
      await db.update(businesses).set({ tripAdvisorLocationId: locationId }).where(eq(businesses.id, businessId));
      console.info("[tripadvisor] discovered and cached location ID", { businessId, locationId });
    } else {
      console.info("[tripadvisor] could not discover location for", { businessId });
      return { fetched: 0, newReviews: 0, newInserted: [] };
    }
  }

  const reviews = await fetchTripAdvisorReviews(locationId);
  if (reviews.length === 0) return { fetched: 0, newReviews: 0, newInserted: [] };

  const existingIds = await db
    .select({ googleReviewId: businessReviews.googleReviewId })
    .from(businessReviews)
    .where(eq(businessReviews.businessId, businessId));

  const existingSet = new Set(existingIds.map((r) => r.googleReviewId));
  const newInserted: TripAdvisorSyncResult["newInserted"] = [];
  let newReviews = 0;

  for (const review of reviews) {
    const externalId = `ta:${review.id}`;
    if (existingSet.has(externalId)) continue;

    const reviewText = [review.title, review.text].filter(Boolean).join(" — ");

    const suggestedReply = reviewText
      ? await generateReply({ businessName: biz.name, rating: review.rating, reviewText })
      : null;

    const publishTime = review.published_date ? new Date(review.published_date) : null;
    const authorName = review.user?.username ?? "Anonymous";

    await db.insert(businessReviews).values({
      businessId,
      googleReviewId: externalId,
      source: "tripadvisor",
      authorName,
      authorPhotoUri: review.user?.avatar?.small ?? undefined,
      rating: review.rating,
      text: reviewText || null,
      publishTime,
      suggestedReply,
      status: "new",
    });

    newInserted.push({
      authorName,
      rating: review.rating,
      text: reviewText || null,
      suggestedReply,
      publishTime,
      source: "tripadvisor",
    });
    newReviews++;
  }

  return { fetched: reviews.length, newReviews, newInserted };
}

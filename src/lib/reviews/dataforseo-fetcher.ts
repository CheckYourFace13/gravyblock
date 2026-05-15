/**
 * DataForSEO Business Data Reviews API.
 * Covers Google, TripAdvisor, Facebook, and Trustpilot through one integration.
 * Yelp is intentionally excluded — we use the free Yelp Fusion API instead.
 *
 * Auth: Basic Auth using DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD env vars.
 * Cost: ~$0.003 per review fetched. Much cheaper than individual platform APIs.
 * Docs: https://docs.dataforseo.com/v3/business_data/google/reviews/live/
 */

import { eq } from "drizzle-orm";
import { getDb, businesses, businessReviews } from "@/lib/db";

export type DataForSeoReview = {
  reviewId: string;
  rating: number;
  text: string | null;
  publishTime: Date | null;
  authorName: string;
  authorPhotoUri: string | null;
};

export type DfsPlatform = "google" | "tripadvisor" | "facebook" | "trustpilot";

type DfsRawItem = {
  review_id?: string;
  rating?: { value?: number } | number;
  review_text?: string | null;
  timestamp?: string | null;
  profile_name?: string | null;
  profile_image_url?: string | null;
  // TripAdvisor / Facebook variants
  author?: { name?: string; image_url?: string } | null;
  text?: string | null;
  date?: string | null;
};

type DfsResponse = {
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: Array<{
      items?: DfsRawItem[];
      items_count?: number;
    }> | null;
  }>;
};

function dfsAuth(): string | null {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

/** Normalise address into "City, State, United States" for DataForSEO locationName. */
function locationNameFromAddress(address: string | null | undefined): string {
  if (!address) return "United States";
  // Typical format: "123 Main St, Austin, TX 78701, USA"
  const parts = address.split(",").map((p) => p.trim());
  // Find state+zip part (e.g. "TX 78701") and city before it
  const stateZipIdx = parts.findIndex((p) => /^[A-Z]{2}\s+\d{5}/.test(p));
  if (stateZipIdx >= 2) {
    const city = parts[stateZipIdx - 1];
    const state = parts[stateZipIdx].split(/\s+/)[0];
    return `${city}, ${state}, United States`;
  }
  if (stateZipIdx === 1) {
    const state = parts[1].split(/\s+/)[0];
    return `${state}, United States`;
  }
  // Fallback: last 2 parts
  return parts.slice(-2).join(", ") || "United States";
}

function normaliseRating(raw: DfsRawItem["rating"]): number {
  if (typeof raw === "number") return Math.round(raw);
  if (typeof raw === "object" && raw !== null && typeof raw.value === "number") return Math.round(raw.value);
  return 0;
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Fetch reviews for a business from DataForSEO. */
export async function fetchDataForSeoReviews(params: {
  businessName: string;
  locationName: string;
  platform: DfsPlatform;
  depth?: number;
}): Promise<DataForSeoReview[]> {
  const auth = dfsAuth();
  if (!auth) return [];

  const url = `https://api.dataforseo.com/v3/business_data/${params.platform}/reviews/live`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          keyword: params.businessName,
          location_name: params.locationName,
          language_name: "English",
          depth: params.depth ?? 20,
        },
      ]),
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn("[dataforseo] request failed", { platform: params.platform, status: res.status });
      return [];
    }

    const json = (await res.json()) as DfsResponse;
    const task = json.tasks?.[0];

    if (!task || task.status_code !== 20000) {
      console.warn("[dataforseo] task error", {
        platform: params.platform,
        code: task?.status_code,
        msg: task?.status_message,
      });
      return [];
    }

    const items = task.result?.[0]?.items ?? [];

    return items.map((item): DataForSeoReview => ({
      reviewId: item.review_id ?? `${Date.now()}-${Math.random()}`,
      rating: normaliseRating(item.rating),
      text: item.review_text ?? item.text ?? null,
      publishTime: parseDate(item.timestamp ?? item.date),
      authorName: item.profile_name ?? item.author?.name ?? "Anonymous",
      authorPhotoUri: item.profile_image_url ?? item.author?.image_url ?? null,
    }));
  } catch (err) {
    console.error("[dataforseo] fetch error", { platform: params.platform, error: String(err) });
    return [];
  }
}

export type DfsSyncResult = {
  fetched: number;
  newReviews: number;
  newInserted: Array<{
    authorName: string;
    rating: number;
    text: string | null;
    suggestedReply: string | null;
    publishTime: Date | null;
    source: string;
  }>;
};

/**
 * Sync reviews from one DataForSEO platform for a business.
 * Deduplicates, generates AI reply drafts, and inserts new rows.
 */
export async function syncDataForSeoReviewsForBusiness(
  businessId: string,
  platform: DfsPlatform,
  generateReply: (params: { businessName: string; rating: number; reviewText: string }) => Promise<string | null>,
): Promise<DfsSyncResult> {
  const db = getDb();
  if (!db) return { fetched: 0, newReviews: 0, newInserted: [] };

  const [biz] = await db
    .select({ name: businesses.name, address: businesses.address })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) return { fetched: 0, newReviews: 0, newInserted: [] };

  const locationName = locationNameFromAddress(biz.address);
  const reviews = await fetchDataForSeoReviews({
    businessName: biz.name,
    locationName,
    platform,
  });

  if (reviews.length === 0) return { fetched: 0, newReviews: 0, newInserted: [] };

  const existingIds = await db
    .select({ googleReviewId: businessReviews.googleReviewId })
    .from(businessReviews)
    .where(eq(businessReviews.businessId, businessId));

  const existingSet = new Set(existingIds.map((r) => r.googleReviewId));
  const newInserted: DfsSyncResult["newInserted"] = [];
  let newReviews = 0;

  for (const review of reviews) {
    const externalId = `${platform}:${review.reviewId}`;
    if (existingSet.has(externalId)) continue;

    const suggestedReply = review.text
      ? await generateReply({ businessName: biz.name, rating: review.rating, reviewText: review.text })
      : null;

    await db.insert(businessReviews).values({
      businessId,
      googleReviewId: externalId,
      source: platform,
      authorName: review.authorName,
      authorPhotoUri: review.authorPhotoUri ?? undefined,
      rating: review.rating,
      text: review.text,
      publishTime: review.publishTime,
      suggestedReply,
      status: "new",
    });

    newInserted.push({
      authorName: review.authorName,
      rating: review.rating,
      text: review.text,
      suggestedReply,
      publishTime: review.publishTime,
      source: platform,
    });
    newReviews++;
  }

  return { fetched: reviews.length, newReviews, newInserted };
}

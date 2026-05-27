/**
 * Finds local businesses that are the best prospects for GravyBlock:
 * - Active businesses with a website (can email them)
 * - Not already dominating (room to grow = motivation to pay)
 * - Sweet spot: 10–80 reviews, rating 3.2–4.5
 *
 * We score each prospect 0–100 based on opportunity signal strength.
 * The highest-scoring prospects get emailed first.
 */

export type Prospect = {
  placeId: string;
  businessName: string;
  address: string;
  city: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  opportunityScore: number;
  weaknessReasons: string[];
};

type PlacesTextSearchResult = {
  place_id: string;
  name: string;
  formatted_address: string;
  rating?: number;
  user_ratings_total?: number;
};

type PlacesTextSearchResponse = {
  status: string;
  results: PlacesTextSearchResult[];
  next_page_token?: string;
  error_message?: string;
};

type PlaceDetailsResponse = {
  status: string;
  result?: {
    website?: string;
    formatted_phone_number?: string;
  };
};

async function fetchPlaceDetails(placeId: string, apiKey: string): Promise<{ website?: string; phone?: string }> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "website,formatted_phone_number");
  url.searchParams.set("key", apiKey);
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return {};
    const data = (await res.json()) as PlaceDetailsResponse;
    if (data.status !== "OK" || !data.result) return {};
    return { website: data.result.website, phone: data.result.formatted_phone_number };
  } catch {
    return {};
  }
}

function extractCity(formattedAddress: string): string {
  const parts = formattedAddress.split(",").map((p) => p.trim());
  for (let i = parts.length - 3; i >= 1; i--) {
    const candidate = parts[i];
    if (candidate && !/\d/.test(candidate) && candidate.length < 40) return candidate;
  }
  return parts[0] ?? "";
}

/**
 * Opportunity score 0–100:
 * Higher = better prospect (active, not dominant, has a website).
 *
 * Sweet spot: 15–60 reviews, 3.5–4.4 stars.
 * We avoid: 0 reviews (too new/inactive), >150 reviews (already dominating),
 *           <3.0 stars (struggling, less likely to invest in marketing).
 */
function scoreOpportunity(
  rating: number | undefined,
  reviewCount: number | undefined,
  hasWebsite: boolean,
): number {
  if (!hasWebsite) return 0; // can't email them without a website

  let score = 50; // baseline

  // Review count scoring (sweet spot: 15-80 reviews)
  const r = reviewCount ?? 0;
  if (r === 0) score -= 20;
  else if (r < 5) score -= 10;
  else if (r <= 15) score += 5;
  else if (r <= 40) score += 20; // sweet spot — active but not dominant
  else if (r <= 80) score += 12;
  else if (r <= 150) score -= 5;
  else score -= 25; // dominant already

  // Rating scoring (sweet spot: 3.5-4.4)
  if (rating === undefined) {
    score -= 5; // no rating yet
  } else if (rating < 3.0) {
    score -= 15; // struggling
  } else if (rating < 3.5) {
    score += 5;
  } else if (rating <= 4.2) {
    score += 20; // real opportunity — good enough to care, not perfect
  } else if (rating <= 4.5) {
    score += 10;
  } else {
    score -= 10; // near-perfect rating, may not feel the pain
  }

  return Math.max(0, Math.min(100, score));
}

function buildWeaknessReasons(
  rating: number | undefined,
  reviewCount: number | undefined,
  hasWebsite: boolean,
): string[] {
  const reasons: string[] = [];
  const r = reviewCount ?? 0;

  if (!hasWebsite) reasons.push("no website on Google");
  if (r === 0) reasons.push("no Google reviews yet");
  else if (r < 15) reasons.push(`only ${r} Google review${r === 1 ? "" : "s"}`);
  else if (r < 50) reasons.push(`${r} reviews — competitors may have 3–5× more`);

  if (rating !== undefined && rating < 4.0) {
    reasons.push(`${rating}-star average — below the local top-performer threshold`);
  } else if (rating !== undefined && rating < 4.5 && r < 60) {
    reasons.push("ranking below top 3 in Maps due to low review velocity");
  }

  if (reasons.length === 0) reasons.push("visibility gaps in local SEO coverage");

  return reasons;
}

/** Fetches one page of Places Text Search results, returning results + next page token. */
async function fetchPlacesPage(
  query: string,
  apiKey: string,
  pageToken?: string,
): Promise<{ results: PlacesTextSearchResult[]; nextPageToken?: string }> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", apiKey);
  if (pageToken) url.searchParams.set("pagetoken", pageToken);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Google Places Text Search failed: ${res.status}`);

  const data = (await res.json()) as PlacesTextSearchResponse;
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google Places API error: ${data.status} — ${data.error_message ?? "unknown"}`);
  }

  return { results: data.results ?? [], nextPageToken: data.next_page_token };
}

export async function findWeakBusinesses(params: {
  city: string;
  state: string;
  industry: string;
  maxResults?: number;
}): Promise<Prospect[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY is not set");

  const { city, state, industry, maxResults = 50 } = params;
  const query = `${industry} in ${city} ${state}`;

  // Paginate through up to 3 pages (Google Places max) — 20 results/page = up to 60 raw results
  const allResults: PlacesTextSearchResult[] = [];
  let nextPageToken: string | undefined;

  for (let page = 0; page < 3; page++) {
    // Google requires a short delay before using a next_page_token
    if (page > 0 && nextPageToken) {
      await new Promise((r) => setTimeout(r, 2000));
    }

    const { results, nextPageToken: token } = await fetchPlacesPage(query, apiKey, nextPageToken);
    allResults.push(...results);
    nextPageToken = token;

    if (!nextPageToken) break; // no more pages
  }

  // Dedupe by place_id
  const unique = Array.from(new Map(allResults.map((r) => [r.place_id, r])).values());

  // Fetch website + phone for all places in parallel
  const detailsMap = new Map<string, { website?: string; phone?: string }>();
  await Promise.all(
    unique.map(async (place) => {
      const details = await fetchPlaceDetails(place.place_id, apiKey);
      detailsMap.set(place.place_id, details);
    }),
  );

  const prospects: Prospect[] = [];

  for (const place of unique) {
    const details = detailsMap.get(place.place_id) ?? {};
    const hasWebsite = Boolean(details.website);
    const opportunityScore = scoreOpportunity(place.rating, place.user_ratings_total, hasWebsite);

    // Skip no-website businesses (can't email) and skip already-dominant ones
    if (!hasWebsite) continue;
    if (opportunityScore < 30) continue;

    const weaknessReasons = buildWeaknessReasons(place.rating, place.user_ratings_total, hasWebsite);

    prospects.push({
      placeId: place.place_id,
      businessName: place.name,
      address: place.formatted_address,
      city: extractCity(place.formatted_address) || city,
      phone: details.phone,
      website: details.website,
      rating: place.rating,
      reviewCount: place.user_ratings_total,
      opportunityScore,
      weaknessReasons,
    });
  }

  // Sort by opportunity score descending — best prospects first
  prospects.sort((a, b) => b.opportunityScore - a.opportunityScore);

  return prospects.slice(0, maxResults);
}

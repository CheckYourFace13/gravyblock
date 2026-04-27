// Uses Google Places Text Search API to find local businesses with weak online presence.
// Text Search is simpler than Nearby Search for city-based queries — no geocoding needed.
// https://maps.googleapis.com/maps/api/place/textsearch/json

export type Prospect = {
  placeId: string;
  businessName: string;
  address: string;
  city: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  weaknessReasons: string[];
};

type PlacesTextSearchResult = {
  place_id: string;
  name: string;
  formatted_address: string;
  rating?: number;
  user_ratings_total?: number;
  website?: string;
  formatted_phone_number?: string;
  // Text Search doesn't return phone/website — need Details call for those
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

/** Fetch website and phone from Place Details (not in Text Search results). */
async function fetchPlaceDetails(placeId: string, apiKey: string): Promise<{ website?: string; phone?: string }> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "website,formatted_phone_number");
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return {};
    const data = (await res.json()) as PlaceDetailsResponse;
    if (data.status !== "OK" || !data.result) return {};
    return {
      website: data.result.website,
      phone: data.result.formatted_phone_number,
    };
  } catch {
    return {};
  }
}

function extractCity(formattedAddress: string): string {
  // "123 Main St, Austin, TX 78701, USA" -> "Austin"
  const parts = formattedAddress.split(",").map((p) => p.trim());
  // City is typically the second-to-last or third-from-last part before state+zip
  if (parts.length >= 3) {
    // Try to find a part that looks like a city (not a state+zip combo)
    for (let i = parts.length - 3; i >= 1; i--) {
      const candidate = parts[i];
      if (candidate && !/\d/.test(candidate) && candidate.length < 40) {
        return candidate;
      }
    }
  }
  return parts[0] ?? "";
}

function assessWeakness(place: PlacesTextSearchResult, website?: string): string[] {
  const reasons: string[] = [];

  if (place.rating === undefined || place.rating === null) {
    reasons.push("no Google rating");
  } else if (place.rating < 3.8) {
    reasons.push(`low rating (${place.rating} stars)`);
  }

  if (!place.user_ratings_total || place.user_ratings_total === 0) {
    reasons.push("no Google reviews");
  } else if (place.user_ratings_total < 15) {
    reasons.push(`fewer than 15 reviews (has ${place.user_ratings_total})`);
  }

  if (!website) {
    reasons.push("no website listed on Google");
  }

  return reasons;
}

export async function findWeakBusinesses(params: {
  city: string;
  state: string;
  industry: string;
  radiusMeters?: number;
  maxResults?: number;
}): Promise<Prospect[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_PLACES_API_KEY is not set");
  }

  const { city, state, industry, maxResults = 10 } = params;

  const query = `${industry} in ${city} ${state}`;
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Google Places Text Search failed: ${res.status}`);
  }

  const data = (await res.json()) as PlacesTextSearchResponse;
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google Places API error: ${data.status} — ${data.error_message ?? "unknown"}`);
  }

  const results = data.results ?? [];

  // Fetch details for each place to get website + phone (in parallel, capped)
  const detailsMap = new Map<string, { website?: string; phone?: string }>();
  await Promise.all(
    results.map(async (place) => {
      const details = await fetchPlaceDetails(place.place_id, apiKey);
      detailsMap.set(place.place_id, details);
    }),
  );

  // Score and filter weak businesses
  const prospects: Prospect[] = [];

  for (const place of results) {
    const details = detailsMap.get(place.place_id) ?? {};
    const weaknessReasons = assessWeakness(place, details.website);

    // Skip businesses with no identified weaknesses
    if (weaknessReasons.length === 0) continue;

    prospects.push({
      placeId: place.place_id,
      businessName: place.name,
      address: place.formatted_address,
      city: extractCity(place.formatted_address) || city,
      phone: details.phone,
      website: details.website,
      rating: place.rating,
      reviewCount: place.user_ratings_total,
      weaknessReasons,
    });
  }

  // Sort by most obvious opportunity: fewest reviews first, then no rating, then low rating
  prospects.sort((a, b) => {
    const aReviews = a.reviewCount ?? 0;
    const bReviews = b.reviewCount ?? 0;
    if (aReviews !== bReviews) return aReviews - bReviews;
    // Tie-break: no rating is worse than low rating
    if (a.rating === undefined && b.rating !== undefined) return -1;
    if (b.rating === undefined && a.rating !== undefined) return 1;
    return (a.rating ?? 5) - (b.rating ?? 5);
  });

  return prospects.slice(0, maxResults);
}

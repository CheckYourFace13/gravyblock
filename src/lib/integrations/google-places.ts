import { normalizeUrl } from "@/lib/business/normalize";

export type GooglePlaceCandidate = {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  rating?: number;
  reviewCount?: number;
  types: string[];
  mapsUri: string;
  latitude?: number;
  longitude?: number;
  confidence: number;
};

export type GooglePlaceDetails = {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  phone?: string;
  website?: string;
  mapsUri: string;
  rating?: number;
  reviewCount?: number;
  types: string[];
  primaryCategory?: string;
  businessStatus?: string;
  openNow?: boolean;
  latitude?: number;
  longitude?: number;
  raw: unknown;
};

type LegacyPlaceResult = {
  place_id: string;
  name: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  geometry?: { location?: { lat?: number; lng?: number } };
};

function apiKey() {
  return process.env.GOOGLE_PLACES_API_KEY ?? "";
}

function mapsUriForPlace(placeId: string) {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function confidenceScore(query: string, locationHint: string, candidate: LegacyPlaceResult) {
  const q = normalize(query);
  const name = normalize(candidate.name ?? "");
  const addr = normalize(candidate.formatted_address ?? "");
  let score = 25;

  if (name === q) score += 45;
  else if (name.includes(q)) score += 32;
  else {
    const qTokens = q.split(" ").filter(Boolean);
    const matched = qTokens.filter((t) => name.includes(t));
    score += Math.min(24, matched.length * 8);
  }

  const loc = normalize(locationHint);
  if (loc) {
    const locTokens = loc.split(" ").filter(Boolean);
    const matchedLoc = locTokens.filter((t) => addr.includes(t));
    score += Math.min(18, matchedLoc.length * 6);
  }

  if ((candidate.user_ratings_total ?? 0) > 25) score += 5;
  if ((candidate.rating ?? 0) >= 4.2) score += 4;
  return Math.max(0, Math.min(100, score));
}

export async function searchGooglePlaceCandidates(input: {
  query: string;
  locationHint?: string;
  maxResults?: number;
}): Promise<GooglePlaceCandidate[]> {
  const key = apiKey();
  if (!key) {
    throw new Error("Missing GOOGLE_PLACES_API_KEY");
  }

  const q = [input.query.trim(), input.locationHint?.trim()].filter(Boolean).join(" ");
  if (!q) return [];

  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", q);
  url.searchParams.set("key", key);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Google Places search failed (${res.status})`);
  }

  const json = (await res.json()) as { status?: string; results?: LegacyPlaceResult[]; error_message?: string };
  if (json.status && json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    throw new Error(json.error_message ?? `Google Places returned ${json.status}`);
  }

  const max = input.maxResults ?? 8;
  const candidates = (json.results ?? []).slice(0, max).map((p) => ({
    placeId: p.place_id,
    displayName: p.name,
    formattedAddress: p.formatted_address ?? "",
    rating: p.rating,
    reviewCount: p.user_ratings_total,
    types: p.types ?? [],
    mapsUri: mapsUriForPlace(p.place_id),
    latitude: p.geometry?.location?.lat,
    longitude: p.geometry?.location?.lng,
    confidence: confidenceScore(input.query, input.locationHint ?? "", p),
  }));

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

export async function getGooglePlaceDetails(placeId: string): Promise<GooglePlaceDetails> {
  const key = apiKey();
  if (!key) {
    throw new Error("Missing GOOGLE_PLACES_API_KEY");
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set(
    "fields",
    [
      "place_id",
      "name",
      "formatted_address",
      "international_phone_number",
      "website",
      "url",
      "rating",
      "user_ratings_total",
      "types",
      "business_status",
      "opening_hours",
      "geometry",
    ].join(","),
  );
  url.searchParams.set("key", key);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Google Place details failed (${res.status})`);
  }

  const json = (await res.json()) as {
    status?: string;
    result?: {
      place_id: string;
      name: string;
      formatted_address?: string;
      international_phone_number?: string;
      website?: string;
      url?: string;
      rating?: number;
      user_ratings_total?: number;
      types?: string[];
      business_status?: string;
      opening_hours?: { open_now?: boolean };
      geometry?: { location?: { lat?: number; lng?: number } };
    };
    error_message?: string;
  };

  if (json.status !== "OK" || !json.result) {
    throw new Error(json.error_message ?? `Google Place details returned ${json.status ?? "unknown"}`);
  }

  return {
    placeId: json.result.place_id,
    displayName: json.result.name,
    formattedAddress: json.result.formatted_address ?? "",
    phone: json.result.international_phone_number,
    website: normalizeUrl(json.result.website) ?? undefined,
    mapsUri: json.result.url ?? mapsUriForPlace(json.result.place_id),
    rating: json.result.rating,
    reviewCount: json.result.user_ratings_total,
    types: json.result.types ?? [],
    primaryCategory: json.result.types?.[0],
    businessStatus: json.result.business_status,
    openNow: json.result.opening_hours?.open_now,
    latitude: json.result.geometry?.location?.lat,
    longitude: json.result.geometry?.location?.lng,
    raw: json.result,
  };
}

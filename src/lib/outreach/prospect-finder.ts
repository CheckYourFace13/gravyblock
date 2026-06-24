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

// Places API (New) — places.googleapis.com/v1/places:searchText.
// The legacy maps.googleapis.com Text Search was sunset for new API keys
// (returns INVALID_REQUEST). The new API returns website + phone + rating +
// review count in ONE call, so we no longer need per-result Place Details
// lookups (faster, far less quota).
type NewPlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  nationalPhoneNumber?: string;
};

type NewPlacesResponse = {
  places?: NewPlace[];
  nextPageToken?: string;
  error?: { message?: string; status?: string };
};

/** One page of the new Places API searchText. Returns places + next page token. */
async function searchPlacesNew(
  textQuery: string,
  apiKey: string,
  pageToken?: string,
): Promise<{ places: NewPlace[]; nextPageToken?: string }> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      // Field mask is REQUIRED by the new API; request only what we use.
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri,places.nationalPhoneNumber,nextPageToken",
    },
    body: JSON.stringify({ textQuery, pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Places API (New) error: ${res.status} — ${body.slice(0, 160)}`);
  }

  const data = (await res.json()) as NewPlacesResponse;
  if (data.error) {
    throw new Error(`Places API (New) error: ${data.error.status ?? ""} ${data.error.message ?? ""}`);
  }
  return { places: data.places ?? [], nextPageToken: data.nextPageToken };
}

// ── Legacy fallback (proven to work on the current key) ─────────────────────
// Used only if the new Places API isn't enabled on the project. Legacy base
// text search works; only its page-token pagination was failing, so we take
// page 0 (20 results) and fetch website/phone per result.
type LegacyResult = { place_id: string; name: string; formatted_address: string; rating?: number; user_ratings_total?: number };

async function searchPlacesLegacy(query: string, apiKey: string): Promise<NewPlace[]> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", apiKey);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Legacy Places error: ${res.status}`);
  const data = (await res.json()) as { status: string; results?: LegacyResult[]; error_message?: string };
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Legacy Places error: ${data.status} — ${data.error_message ?? "unknown"}`);
  }
  const results = data.results ?? [];

  // Legacy text search omits website/phone — fetch per result (parallel).
  const enriched = await Promise.all(
    results.map(async (r): Promise<NewPlace> => {
      let websiteUri: string | undefined;
      let nationalPhoneNumber: string | undefined;
      try {
        const d = new URL("https://maps.googleapis.com/maps/api/place/details/json");
        d.searchParams.set("place_id", r.place_id);
        d.searchParams.set("fields", "website,formatted_phone_number");
        d.searchParams.set("key", apiKey);
        const dr = await fetch(d.toString(), { signal: AbortSignal.timeout(6000) });
        if (dr.ok) {
          const dj = (await dr.json()) as { result?: { website?: string; formatted_phone_number?: string } };
          websiteUri = dj.result?.website;
          nationalPhoneNumber = dj.result?.formatted_phone_number;
        }
      } catch { /* leave undefined */ }
      return {
        id: r.place_id,
        displayName: { text: r.name },
        formattedAddress: r.formatted_address,
        rating: r.rating,
        userRatingCount: r.user_ratings_total,
        websiteUri,
        nationalPhoneNumber,
      };
    }),
  );
  return enriched;
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

// National chains, franchises, and supply houses that will never buy a $40/mo
// local SEO tool (they have corporate marketing) and that hurt deliverability
// when cold-emailed. Matched as case-insensitive substrings of the business name.
const CHAIN_NAME_PATTERNS = [
  "aspen dental", "western dental", "bright now", "greenberg dental", "jefferson dental",
  "midas", "aire serv", "mr. rooter", "mr rooter", "roto-rooter", "roto rooter",
  "one hour heating", "benjamin franklin plumbing", "service experts", "ars/rescue",
  "johnstone supply", "ferguson", "grainger", "home depot", "lowe's", "lowes",
  "morton's", "mortons", "the capital grille", "ruth's chris", "hyatt", "marriott",
  "hilton", "holiday inn", "temperaturepro", "aaa ", "jiffy lube", "valvoline",
  "meineke", "pep boys", "firestone", "goodyear", "les schwab", "lifetime",
  "lifeclinic", "the joint chiropractic", "massage envy", "european wax",
  "great clips", "supercuts", "sport clips", "regis", "h&r block", "ups store",
  "fedex office", "aspen", // catch Aspen Dental variants
];

// Domains that are aggregators, social pages, page builders, or national-chain
// corporate sites — not a real local business website we can pitch.
const BLOCKED_DOMAIN_PATTERNS = [
  "facebook.com", "instagram.com", "twitter.com", "x.com", "yelp.com",
  "linktr.ee", "linktree", "wix-vibe-site", "getbento.com", "google.com",
  "godaddysites.com", "business.site", "wixsite.com/",
  "aspendental.com", "westerndental.com", "brightnow.com", "midas.com",
  "ferguson.com", "johnstonesupply.com", "hyatt.com", "marriott.com",
  "mortons.com", "aireserv.com", "lifetime.life", "aspendental",
];

function isChainOrIneligible(name: string, website: string | undefined): boolean {
  const n = name.toLowerCase();
  if (CHAIN_NAME_PATTERNS.some((p) => n.includes(p))) return true;
  if (website) {
    const w = website.toLowerCase();
    if (BLOCKED_DOMAIN_PATTERNS.some((d) => w.includes(d))) return true;
  }
  return false;
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
  const textQuery = `${industry} in ${city} ${state}`;

  // Paginate up to 3 pages (20 each). The new API returns all fields we need
  // per place, so no separate Place Details calls.
  const allPlaces: NewPlace[] = [];
  let nextPageToken: string | undefined;

  for (let page = 0; page < 3; page++) {
    try {
      const { places, nextPageToken: token } = await searchPlacesNew(textQuery, apiKey, nextPageToken);
      allPlaces.push(...places);
      nextPageToken = token;
      if (!nextPageToken) break;
    } catch (err) {
      if (page > 0) {
        // Later page failed — use what we have.
        console.warn("[prospect-finder] pagination page failed, using partial results", { page, error: String(err) });
        break;
      }
      // Page 0 failed on the new API — most likely "Places API (New)" isn't
      // enabled on this key. Fall back to the legacy search we know works.
      console.warn("[prospect-finder] new Places API failed, falling back to legacy", { error: String(err) });
      try {
        const legacy = await searchPlacesLegacy(textQuery, apiKey);
        allPlaces.push(...legacy);
      } catch (legacyErr) {
        console.error("[prospect-finder] both new and legacy Places failed", { error: String(legacyErr) });
        throw legacyErr;
      }
      break;
    }
  }

  // Dedupe by place id
  const unique = Array.from(new Map(allPlaces.map((p) => [p.id, p])).values());

  const prospects: Prospect[] = [];

  for (const place of unique) {
    const name = place.displayName?.text ?? "";
    const website = place.websiteUri;
    const hasWebsite = Boolean(website);
    const opportunityScore = scoreOpportunity(place.rating, place.userRatingCount, hasWebsite);

    if (!name) continue;
    // Skip no-website businesses (can't email) and skip already-dominant ones
    if (!hasWebsite) continue;
    if (opportunityScore < 30) continue;
    // Skip national chains, franchises, and aggregator/social domains
    if (isChainOrIneligible(name, website)) continue;

    const weaknessReasons = buildWeaknessReasons(place.rating, place.userRatingCount, hasWebsite);

    prospects.push({
      placeId: place.id,
      businessName: name,
      address: place.formattedAddress ?? "",
      city: extractCity(place.formattedAddress ?? "") || city,
      phone: place.nationalPhoneNumber,
      website,
      rating: place.rating,
      reviewCount: place.userRatingCount,
      opportunityScore,
      weaknessReasons,
    });
  }

  // Sort by opportunity score descending — best prospects first
  prospects.sort((a, b) => b.opportunityScore - a.opportunityScore);

  return prospects.slice(0, maxResults);
}

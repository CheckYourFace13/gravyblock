import type { Vertical } from "./types";

/**
 * The business category a free scan searches with. Public scans used to hard-code "other", so a brewery was searched with "best local business in <city>".
 * This reads the Google listing's own place types and the business name instead. It never guesses beyond them: an unrecognised business stays "other".
 */
export function inferVertical(types: readonly string[] = [], name = ""): Vertical {
  const t = new Set(types.map((x) => x.toLowerCase()));
  const n = name.toLowerCase();
  if (/\b(brewery|brewing|brewpub|taproom|tap room|brew co)\b/.test(n)) return "brewery";
  if (t.has("bar") || t.has("night_club")) return /\b(restaurant|grill|kitchen|bistro|eatery)\b/.test(n) && t.has("restaurant") ? "restaurant" : "bar";
  if (t.has("restaurant") || t.has("cafe") || t.has("bakery") || t.has("meal_takeaway") || t.has("meal_delivery") || t.has("food")) return "restaurant";
  if (["dentist", "doctor", "hospital", "physiotherapist", "pharmacy", "health", "spa", "beauty_salon", "hair_care", "veterinary_care"].some((x) => t.has(x))) return "healthcare";
  if (["plumber", "electrician", "roofing_contractor", "general_contractor", "hvac_contractor", "painter", "locksmith", "moving_company", "car_repair", "laundry"].some((x) => t.has(x))) return "home_services";
  if (["lawyer", "accounting", "insurance_agency", "real_estate_agency", "finance"].some((x) => t.has(x))) return "professional_services";
  if (["store", "clothing_store", "shoe_store", "book_store", "home_goods_store", "furniture_store", "jewelry_store", "shopping_mall"].some((x) => t.has(x))) return "retail";
  return "other";
}

/** What to call the category in a search query for a vertical. Used where a query needs a noun rather than a template. */
export const VERTICAL_NOUN: Partial<Record<Vertical, string>> = {
  brewery: "brewery",
  bar: "bar",
  restaurant: "restaurant",
  healthcare: "clinic",
  home_services: "service",
  professional_services: "firm",
  retail: "store",
};

/** Names that are not real current competitors: a place that has moved or closed, or a result that is just the town or neighborhood itself. */
export function isRealCompetitor(c: { displayName: string; formattedAddress?: string; types?: string[] }, cityHint: string): boolean {
  if (/\b(now moved|moved to|permanently closed|temporarily closed|closed down|relocated)\b/i.test(c.displayName)) return false;
  const types = c.types ?? [];
  if (types.some((x) => ["locality", "political", "neighborhood", "sublocality", "administrative_area_level_1", "administrative_area_level_2", "postal_code"].includes(x)) && !types.some((x) => ["establishment", "point_of_interest"].includes(x))) return false;
  const city = cityHint.split(",")[0]?.trim().toLowerCase().replace(/\s+(il|illinois|[a-z]{2})$/i, "") ?? "";
  const addr = (c.formattedAddress ?? "").toLowerCase();
  // a result whose address is in a different town than the one searched is not a local competitor
  if (!/\d/.test(cityHint) && city.length >= 3 && addr && !addr.includes(city)) return false;
  return true;
}

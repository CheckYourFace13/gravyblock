import type { LocalRankingCheck } from "@/lib/report/types";
import type { Vertical } from "@/lib/report/types";
import { searchGooglePlaceCandidates } from "@/lib/integrations/google-places";

function queryTemplates(vertical: Vertical) {
  switch (vertical) {
    case "bar":
      return ["best bar in {city}", "cocktail bar {city}", "sports bar {city}", "late night bar {city}"];
    case "brewery":
      return ["brewery in {city}", "taproom {city}", "craft beer near {city}", "brewery with food {city}"];
    case "restaurant":
      return ["best restaurant in {city}", "dinner near {city}", "brunch {city}", "restaurants open now {city}"];
    case "retail":
      return ["best store in {city}", "shop near {city}", "local boutique {city}", "{name} {city}"];
    case "healthcare":
      return ["best clinic in {city}", "doctor near {city}", "urgent care {city}", "{name} {city} reviews"];
    case "home_services":
      return ["best service in {city}", "same day service {city}", "{name} {city}", "trusted service provider {city}"];
    case "professional_services":
      return ["best firm in {city}", "trusted advisor {city}", "{name} {city}", "top rated service {city}"];
    case "online_brand":
      return ["best {name} alternatives in {city}", "{name} shipping to {city}", "{name} trusted in {city}", "{name} reviews {city}"];
    case "hybrid":
      return ["{name} near {city}", "{name} online order {city}", "{name} local pickup {city}", "best {name} in {city}"];
    default:
      return ["best local business in {city}", "{name} {city}", "near me {city}"];
  }
}

export async function estimateLocalRankings(input: {
  placeId: string;
  businessName: string;
  vertical: Vertical;
  cityHint: string;
}): Promise<LocalRankingCheck[]> {
  const templates = queryTemplates(input.vertical);
  const checks: LocalRankingCheck[] = [];

  for (const template of templates.slice(0, 4)) {
    const query = template.replace("{city}", input.cityHint).replace("{name}", input.businessName);
    try {
      const candidates = await searchGooglePlaceCandidates({
        query,
        locationHint: input.cityHint,
        maxResults: 10,
      });
      const idx = candidates.findIndex((c) => c.placeId === input.placeId);
      const rank = idx === -1 ? null : idx + 1;
      checks.push({
        query,
        estimatedPosition: rank,
        inTop3: rank !== null && rank <= 3,
        inMapPack: rank !== null && rank <= 3,
        confidence: rank === null ? 55 : 75,
        source: "estimated_local_rank",
        competitors: candidates
          .filter((c) => c.placeId !== input.placeId)
          .slice(0, 3)
          .map((c, index) => ({
            placeId: c.placeId,
            name: c.displayName,
            rating: c.rating,
            reviewCount: c.reviewCount,
            position: index + 1,
          })),
      });
    } catch {
      checks.push({
        query,
        estimatedPosition: null,
        inTop3: false,
        inMapPack: false,
        confidence: 40,
        source: "estimated_local_rank",
        competitors: [],
      });
    }
  }

  return checks;
}

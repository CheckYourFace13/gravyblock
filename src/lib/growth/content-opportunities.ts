import type { BusinessProfile } from "@/lib/report/types";
import type { ReportPayload } from "@/lib/report/types";

export type ContentOpportunitySeed = {
  angle: string;
  title: string;
  body: string;
};

/** Recurring content angles seeded from the scan (Layer 1 → Layer 2 handoff). */
export function buildContentOpportunitySeeds(
  profile: BusinessProfile,
  payload: ReportPayload,
): ContentOpportunitySeed[] {
  const place = profile.address?.split(",").slice(-2).join(",").trim() || "your market";
  const name = profile.name;
  const vertical =
    profile.vertical === "brewery"
      ? "taproom"
      : profile.vertical === "bar"
        ? "bar"
        : profile.vertical === "restaurant"
          ? "restaurant"
          : profile.vertical === "home_services"
            ? "crew"
            : profile.vertical === "professional_services"
              ? "practice"
              : "business";

  const lowSection = payload.sections.length
    ? payload.sections.reduce((min, s) => (s.score < min.score ? s : min), payload.sections[0])
    : undefined;

  return [
    {
      angle: "neighborhood",
      title: `Own the “near ${place}” story on your homepage`,
      body: `Rewrite one hero block that names ${place} explicitly, what you serve first-timers, and the fastest way to visit ${name} tonight.`,
    },
    {
      angle: "freshness",
      title: `Publish a weekly “what’s new” surface`,
      body: `Short updates (site, email, or social) beat a static ${vertical} presence — they signal you are active this week to both people and discovery systems.`,
    },
    {
      angle: "events",
      title: "If you run events, give each one a clear landing path",
      body: `Promotions, pop-ups, or seasonal pushes deserve a dated snippet with time, location/service area, and one obvious CTA — reduces bounce from comparison lists.`,
    },
    {
      angle: "trust",
      title: "Turn your best reviews into scannable proof",
      body: `Pull 3 quotes that mention specifics (service, dish, beer) and mirror that language near your call and map modules — aligns with your ${lowSection?.title ?? "weakest"} score band.`,
    },
  ];
}

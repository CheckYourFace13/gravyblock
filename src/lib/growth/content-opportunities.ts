import type { BusinessProfile } from "@/lib/report/types";
import type { ReportPayload } from "@/lib/report/types";

export type ContentOpportunitySeed = {
  angle: string;
  title: string;
  body: string;
};

/** Hospitality-flavored recurring content angles (Layer 1 → Layer 2 handoff). */
export function buildContentOpportunitySeeds(
  profile: BusinessProfile,
  payload: ReportPayload,
): ContentOpportunitySeed[] {
  const place = profile.address?.split(",").slice(-2).join(",").trim() || "your neighborhood";
  const name = profile.name;
  const vertical =
    profile.vertical === "brewery"
      ? "taproom"
      : profile.vertical === "bar"
        ? "bar"
        : profile.vertical === "restaurant"
          ? "restaurant"
          : "venue";

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
      angle: "menu_or_tap",
      title: `Publish a weekly “what’s pouring / plating” update`,
      body: `Short posts or GBP updates beat static ${vertical} sites — they train Google (and AI summaries) that you are active this week.`,
    },
    {
      angle: "events",
      title: "Bundle events + reservations in one clear path",
      body: `If you run trivia, live music, or pairings, give each event a landing snippet with date, cover, and CTA — reduces bounce from AI-generated lists.`,
    },
    {
      angle: "trust",
      title: "Turn your best reviews into scannable proof",
      body: `Pull 3 quotes that mention specifics (service, dish, beer) and mirror that language near your call and map modules — aligns with your ${lowSection?.title ?? "weakest"} score band.`,
    },
  ];
}

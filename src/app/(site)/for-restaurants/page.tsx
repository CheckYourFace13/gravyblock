import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "GravyBlock for restaurants",
  description:
    "Autopilot-friendly growth for restaurants — clearer listings, stronger conversion paths, and recurring content ideas.",
};

export default function ForRestaurantsPage() {
  return (
    <VerticalLanding
      eyebrow="Restaurants"
      title="Win the map moment before someone picks a competitor two doors down."
      body="Restaurants live and die on clarity: hours, menu, reservations, parking, and dietary promises. GravyBlock scores the whole stack, ships a prioritized roadmap, and keeps a workspace so improvements do not stall after the first win."
      bullets={[
        "Tighten homepage messaging for walk-ins, reservations, and delivery paths.",
        "Spot weak trust signals like thin reviews, inconsistent hours, or missing schema.",
        "Prioritize fixes that help Google, Apple Maps, and humans agree on the same story.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a restaurant scan"
    />
  );
}

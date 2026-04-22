import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "GravyBlock for bars & nightlife",
  description:
    "Runway for AI answers, Maps dominance, and late-night conversion — scans, roadmaps, and recurring growth plays built for bars.",
};

export default function ForBarsPage() {
  return (
    <VerticalLanding
      eyebrow="Bars & nightlife"
      title="Make the first digital round as strong as the in-house pour."
      body="Late-night traffic is competitive. GravyBlock keeps your digital story as tight as your floor shift — scans, prioritized fixes, and a workspace that tracks how you show up in Maps, search, and AI answers over time."
      bullets={[
        "Clarify what makes you different in one sentence above the fold.",
        "Make call, directions, and cover charge answers effortless on mobile.",
        "Align Google Business Profile with what your website promises tonight.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a bar scan"
    />
  );
}

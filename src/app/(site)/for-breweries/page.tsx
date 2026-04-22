import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "GravyBlock for breweries & taprooms",
  description:
    "Taproom-focused scans, Maps + AI visibility framing, and recurring content angles for events, flights, and tourism.",
};

export default function ForBreweriesPage() {
  return (
    <VerticalLanding
      eyebrow="Breweries & taprooms"
      title="Tell the story of your beer, your space, and tonight’s experience in one coherent digital thread."
      body="Breweries juggle events, food trucks, distribution, and tourism. GravyBlock ties those threads into one growth workspace — so assistants, maps, and your site all agree on what is pouring and why tonight matters."
      bullets={[
        "Surface events, hours, and family or pet policies without burying them.",
        "Make taproom-only exclusives obvious to people comparing options on maps.",
        "Tie your website narrative back to the keywords locals actually use nearby.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a brewery scan"
    />
  );
}

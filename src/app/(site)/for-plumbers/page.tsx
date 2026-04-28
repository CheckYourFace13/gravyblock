import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for plumbers | GravyBlock",
  description: "Autopilot local SEO for plumbing businesses. Rank higher for emergency and local searches, get more Google reviews, and publish content automatically.",
};

export default function ForPlumbersPage() {
  return (
    <VerticalLanding
      eyebrow="Plumbers"
      title="Show up first when someone searches for a plumber at 11pm."
      body="Emergency plumbing searches happen at the worst times. When someone's basement is flooding they pick the first trusted result with good reviews and a working phone number. GravyBlock keeps your profile sharp, your review count climbing, and your content showing up for the right searches."
      bullets={[
        "Score your Google Business Profile for emergency search readiness.",
        "Track review count and recency — the top signals for local service rankings.",
        "Generate content automatically: service pages, GBP posts, and local articles.",
        "Get alerted when your visibility score drops between scheduled refreshes.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free plumber scan"
    />
  );
}

import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for plumbers — rank for emergency & local searches on Google | GravyBlock",
  description: "GravyBlock automates local SEO for plumbers: tracks 'plumber near me' rankings, publishes content, manages Google reviews, and sends backlink outreach. Free scan.",
};

export default function ForPlumbersPage() {
  return (
    <VerticalLanding
      eyebrow="Plumbers"
      title="When a pipe bursts at midnight, homeowners call the first plumber they trust on Google. Be that plumber."
      body="Emergency plumbing searches are immediate and high-value. The homeowner picks the first result with strong reviews and a working phone number. GravyBlock keeps your Google profile optimized, your reviews building, and your ranking strong, so you win the emergency calls and the planned jobs alike."
      bullets={[
        "Optimize your GBP for emergency plumbing, drain cleaning, water heater repair, and city-specific searches.",
        "Publish weekly content: DIY guides, prevention tips, city-specific plumbing guides that rank long-term.",
        "Track Google Map rankings for 'plumber near me,' 'emergency plumber,' and specific service searches.",
        "Build review count on Google. It's the single biggest ranking factor for local plumbing searches.",
        "Send backlink outreach to local home improvement, real estate, and neighborhood content sites.",
        "Track AI visibility for home emergency searches. More homeowners ask ChatGPT first now.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free plumber scan"
    />
  );
}

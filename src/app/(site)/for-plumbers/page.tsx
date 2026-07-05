import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for plumbers — get found on Google Maps & Search | GravyBlock",
  description: "GravyBlock automates local SEO for plumbers: publishes content, gathers reviews, keeps your profile fresh, audits citations. Help homeowners find you fast. Free scan.",
};

export default function ForPlumbersPage() {
  return (
    <VerticalLanding
      eyebrow="Plumbers"
      title="When a pipe bursts at midnight, homeowners call the first plumber they trust on Google. Be that plumber."
      body="Emergency plumbing searches are immediate and high-value. Homeowners pick businesses with strong reviews and easy phone numbers. GravyBlock keeps your Google profile complete and up-to-date, helps you gather reviews, and fixes your citations—so you're more discoverable for emergency and planned jobs alike."
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

import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for dentists | GravyBlock",
  description: "Autopilot local SEO for dental practices. Rank higher in local search, build trust with new patients, and publish content automatically.",
};

export default function ForDentistsPage() {
  return (
    <VerticalLanding
      eyebrow="Dentists"
      title="New patients Google you before they book. Make sure they like what they find."
      body="Dental practices live on new patient acquisition. Most patients search, read reviews, and check the website before they ever call. GravyBlock scores every signal that matters for dental search visibility: profile completeness, review volume and recency, website trust, and local content."
      bullets={[
        "Score your Google Business Profile for new-patient search terms.",
        "Track reviews across Google and Healthgrades in one visibility score.",
        "Auto-generate local dental content: patient FAQs, procedure explainers, and GBP posts.",
        "Monitor AI search visibility so you show up when patients ask ChatGPT for a dentist.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free dental practice scan"
    />
  );
}

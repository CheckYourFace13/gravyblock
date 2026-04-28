import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for real estate agents | GravyBlock",
  description: "Autopilot local SEO for real estate agents. Rank for neighborhood searches, build your online reputation, and generate leads without paid ads.",
};

export default function ForRealEstateAgentsPage() {
  return (
    <VerticalLanding
      eyebrow="Real estate agents"
      title="Buyers and sellers Google agents in their area before they reach out to anyone."
      body="Real estate is intensely local. People search by neighborhood, by city, by school district. An agent with strong local search presence gets called first. GravyBlock tracks your visibility across Google, builds your review foundation, and publishes neighborhood content that signals local expertise — automatically."
      bullets={[
        "Score your Google Business Profile and website for local real estate searches.",
        "Generate neighborhood guides and market update content that ranks for city-specific searches.",
        "Track reviews and ratings as trust signals for buyer and seller prospects.",
        "Monitor AI search visibility — a growing share of home buyers start with ChatGPT or Perplexity.",
        "Publish content across multiple cities or zip codes you serve on Growth and Pro plans.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free agent visibility scan"
    />
  );
}

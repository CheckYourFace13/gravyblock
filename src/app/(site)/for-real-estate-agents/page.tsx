import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for real estate agents — get found on Google Maps & Search | GravyBlock",
  description: "GravyBlock automates local SEO for agents: publishes neighborhood content, gathers reviews, monitors your visibility, audits citations. Help buyers find you. Free scan.",
};

export default function ForRealEstateAgentsPage() {
  return (
    <VerticalLanding
      eyebrow="Real estate agents"
      title="Buyers and sellers Google agents in their area before they reach out to anyone. Win that first impression."
      body="Real estate is the most local of all local businesses. Buyers search by neighborhood, by school district, by zip code. The agent who ranks first in those searches gets the call. GravyBlock publishes content from your own website's facts, monitors your reviews, and keeps your Google profile active with weekly posts."
      bullets={[
        "Publish a weekly Google Business Profile post based on a page from your own website, and add your own website images to your profile once Google is connected.",
        "Publish weekly neighborhood guides, market update articles, and local area content that rank for city searches.",
        "Track Google rankings for 'real estate agent near me' and neighborhood-specific searches.",
        "Monitor reviews and reply to Google reviews automatically once Google is connected. Yelp and TripAdvisor reviews are monitored and flagged for you — their APIs do not allow automatic replies.",
        "Send personalized outreach to relevant local organizations. A link only counts once verified live; links are never guaranteed.",
        "Track AI search visibility. Home buyers increasingly use ChatGPT and Perplexity to find agents.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free agent visibility scan"
    />
  );
}

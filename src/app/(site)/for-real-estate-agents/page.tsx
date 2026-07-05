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
      body="Real estate is the most local of all local businesses. Buyers search by neighborhood, by school district, by zip code. The agent who ranks first in those searches gets the call. GravyBlock builds your content, grows your reviews, and keeps your profile sharp so you look like the obvious local expert."
      bullets={[
        "Optimize your GBP and website for buyer, seller, and neighborhood-specific search terms.",
        "Publish weekly neighborhood guides, market update articles, and local area content that rank for city searches.",
        "Track Google rankings for 'real estate agent near me' and neighborhood-specific searches.",
        "Monitor reviews on Google and Zillow, the two biggest trust signals for buyers and sellers.",
        "Send backlink outreach to local news, community boards, and real estate directories.",
        "Track AI search visibility. Home buyers increasingly use ChatGPT and Perplexity to find agents.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free agent visibility scan"
    />
  );
}

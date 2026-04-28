import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for law firms | GravyBlock",
  description: "Autopilot local SEO for law firms and attorneys. Rank for practice area searches, build credibility online, and stay visible in your city.",
};

export default function ForLawyersPage() {
  return (
    <VerticalLanding
      eyebrow="Law firms"
      title="Clients search for an attorney once. If you are not on that first page, you are not in the running."
      body="Legal searches carry high intent and high stakes. People searching for a personal injury lawyer, family attorney, or criminal defense firm want credibility signals fast: reviews, a professional website, clear practice areas, and local presence. GravyBlock tracks every one of those signals and keeps your visibility improving month over month."
      bullets={[
        "Score your GBP, website, and citation consistency for legal search terms.",
        "Track reviews on Google and Avvo as a combined trust signal.",
        "Auto-generate practice area content and city-specific landing page copy.",
        "Monitor whether your firm appears in AI search results for local legal queries.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free law firm scan"
    />
  );
}

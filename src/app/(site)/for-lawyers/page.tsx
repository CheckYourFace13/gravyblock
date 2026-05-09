import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for law firms & attorneys — rank on Google Maps | GravyBlock",
  description: "GravyBlock automates local SEO for law firms: publishes practice area content weekly, tracks Google rankings, monitors Avvo and Google reviews, and builds backlinks. Free scan.",
};

export default function ForLawyersPage() {
  return (
    <VerticalLanding
      eyebrow="Law firms"
      title="Prospective clients search for an attorney once. If you're not on the first page, they call someone else."
      body="Legal searches carry the highest intent of any local search category. Someone searching for a personal injury lawyer or divorce attorney is ready to hire. GravyBlock keeps your firm visible with weekly content, active reviews, and consistent citations so you're the one they call."
      bullets={[
        "Optimize your Google Business Profile for every practice area: PI, family, criminal, estate, business law.",
        "Publish weekly content: case type explainers, FAQ articles, state law summaries, city-specific guides.",
        "Track Google Map rankings for 'attorney near me' and specific practice area searches.",
        "Monitor reviews on Google and Avvo, credibility signals that convert searchers into consultations.",
        "Send backlink outreach to local news sites, community boards, and legal directories.",
        "Track AI search mentions. Potential clients increasingly ask ChatGPT to recommend attorneys.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free law firm scan"
    />
  );
}

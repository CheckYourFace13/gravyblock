import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for law firms & attorneys — get discovered on Google | GravyBlock",
  description: "GravyBlock automates local SEO for law firms: publishes practice area content weekly, gathers reviews, keeps citations consistent, monitors Avvo and Google. Help clients find you. Free scan.",
};

export default function ForLawyersPage() {
  return (
    <VerticalLanding
      eyebrow="Law firms"
      title="Prospective clients search for an attorney once. If you're not on the first page, they call someone else."
      body="Legal searches carry the highest intent of any local search category. Someone searching for a personal injury lawyer or divorce attorney is ready to hire. GravyBlock publishes content from your own website's facts, monitors your reviews, and checks that your name, phone and address agree across your website and Google, to help you be the one they call."
      bullets={[
        "Publish a weekly Google Business Profile post based on a page from your own website, and add your own website images to your profile once Google is connected.",
        "Publish weekly content: case type explainers, FAQ articles, state law summaries, city-specific guides.",
        "Track Google Map rankings for 'attorney near me' and specific practice area searches.",
        "Monitor reviews and reply to Google reviews automatically once Google is connected. Yelp and TripAdvisor replies are drafted for you to paste.",
        "Send personalized outreach to relevant local organizations. A link only counts once verified live; links are never guaranteed.",
        "Track AI search mentions. Potential clients increasingly ask ChatGPT to recommend attorneys.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free law firm scan"
    />
  );
}

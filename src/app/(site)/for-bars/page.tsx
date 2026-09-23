import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for bars & nightlife venues — get discovered on Google | GravyBlock",
  description:
    "GravyBlock automates local SEO for bars: keeps your profile fresh, gathers reviews, publishes content, audits citations. Help patrons find you. Free scan.",
};

export default function ForBarsPage() {
  return (
    <VerticalLanding
      eyebrow="Bars & nightlife"
      title="People searching for a bar tonight pick the first option that looks alive on Google."
      body="Bar searches spike Thursday through Saturday night. High competition, no time to lose. GravyBlock keeps your Google listing active with weekly posts and your own photos, monitors your reviews, and checks whether your name shows up when someone asks an AI assistant where to go for drinks tonight."
      bullets={[
        "Publish a weekly Google Business Profile post based on a page from your own website, and add your own website images to your profile once Google is connected.",
        "Track your Google Map ranking for 'bars near me' and specific drink/vibe searches.",
        "Publish local content: best happy hours, weekend events, drink specials. Drives discovery.",
        "Monitor reviews and reply to Google reviews automatically once Google is connected. Yelp and TripAdvisor reviews are monitored and flagged for you — their APIs do not allow automatic replies.",
        "Check AI search mentions. ChatGPT and Perplexity increasingly answer nightlife questions.",
        "Share your real reviews on your connected Facebook Page, with no per-post approval.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free bar scan"
    />
  );
}

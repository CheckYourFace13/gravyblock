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
      body="Bar searches spike Thursday through Saturday night. High competition, no time to lose. GravyBlock keeps your Google listing active with photos and posts, your reviews climbing, and your name showing up when someone asks an AI assistant where to go for drinks tonight."
      bullets={[
        "Keep your Google Business Profile updated with hours, events, happy hour details, and photos.",
        "Track your Google Map ranking for 'bars near me' and specific drink/vibe searches.",
        "Publish local content: best happy hours, weekend events, drink specials. Drives discovery.",
        "Monitor reviews on Google and Yelp and flag anything that needs a response.",
        "Check AI search mentions. ChatGPT and Perplexity increasingly answer nightlife questions.",
        "Post to local subreddits and community boards to drive foot traffic and backlinks.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free bar scan"
    />
  );
}

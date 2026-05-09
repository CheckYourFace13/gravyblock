import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for restaurants — rank higher on Google Maps | GravyBlock",
  description:
    "GravyBlock automates local SEO for restaurants: publishes content weekly, tracks Google rankings, manages reviews, and keeps your Google Business Profile optimized. Free scan.",
};

export default function ForRestaurantsPage() {
  return (
    <VerticalLanding
      eyebrow="Restaurants"
      title="Diners pick the first restaurant they trust on Google Maps. Make sure it's yours."
      body="Restaurant searches happen right before someone eats. High intent, short window. GravyBlock keeps your Google Business Profile complete and active, your review count climbing, and your content publishing automatically so you show up before the competitor two doors down."
      bullets={[
        "Audit your Google Business Profile for hours, menu links, photos, and dietary attributes.",
        "Publish weekly local content: neighborhood food guides, seasonal specials, event recaps.",
        "Track your Google Map ranking for 'restaurants near me' and top cuisine searches.",
        "Monitor review count and recency on Google and Yelp, the two biggest trust signals for dining.",
        "Post to Reddit local community boards (r/[yourcity]) to drive discovery and backlinks.",
        "Check whether AI assistants mention your restaurant when asked for dining recommendations.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free restaurant scan"
    />
  );
}

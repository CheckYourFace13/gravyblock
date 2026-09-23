import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for restaurants — get discovered on Google Maps | GravyBlock",
  description:
    "GravyBlock automates local SEO for restaurants: publishes content weekly, gathers reviews, keeps your Google Business Profile fresh, and audits citations. Help customers find you on Google Maps and Search. Free scan.",
};

export default function ForRestaurantsPage() {
  return (
    <VerticalLanding
      eyebrow="Restaurants"
      title="Diners pick the first restaurant they trust on Google Maps. Make sure it's yours."
      body="Restaurant searches happen right before someone eats. High intent, short window. GravyBlock keeps your Google Business Profile active with weekly posts, monitors your reviews, and publishes content from your own website's facts to help you show up before the competitor two doors down."
      bullets={[
        "Publish a weekly Google Business Profile post based on a page from your own website, and add your own website images to your profile once Google is connected.",
        "Publish weekly local content: neighborhood food guides, seasonal specials, event recaps.",
        "Track your Google Map ranking for 'restaurants near me' and top cuisine searches.",
        "Monitor reviews and reply to Google reviews automatically once Google is connected. Yelp and TripAdvisor reviews are monitored and flagged for you — their APIs do not allow automatic replies.",
        "Share your real reviews on your connected Facebook Page, with no per-post approval.",
        "Check whether AI assistants mention your restaurant when asked for dining recommendations.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free restaurant scan"
    />
  );
}

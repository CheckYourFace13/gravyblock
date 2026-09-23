import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for breweries & taprooms — get discovered on Google | GravyBlock",
  description:
    "GravyBlock automates local SEO for breweries: publishes content, gathers reviews, keeps your profile fresh, audits citations. Help customers find you. Free scan.",
};

export default function ForBreweriesPage() {
  return (
    <VerticalLanding
      eyebrow="Breweries & taprooms"
      title="Tourists and locals search for the best taprooms nearby. Show up before the chain wins the click."
      body="Breweries compete on experience, not just beer. The ones that win on Google have active profiles, fresh event content, and strong review counts. GravyBlock automatically decides what will help and does it, so your taproom is better placed to show up when beer lovers search, plan trips, and ask AI assistants for recommendations."
      bullets={[
        "Publish a weekly Google Business Profile post based on a page from your own website, and add your own website images to your profile once Google is connected.",
        "Publish weekly content: new releases, event recaps, brewery guides, local beer tourism.",
        "Track Google Map rankings for ‘craft brewery near me’ and city-specific beer searches.",
        "Monitor reviews on Google, Yelp and TripAdvisor, and reply to Google reviews automatically once Google is connected.",
        "Share your real reviews on your connected Facebook Page and keep your profile active with weekly Google Business Profile posts.",
        "Check AI search visibility. Travelers increasingly ask ChatGPT for taproom recommendations.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free brewery scan"
    />
  );
}

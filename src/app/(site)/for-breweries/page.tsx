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
      body="Breweries compete on experience, not just beer. The ones that win on Google have active profiles, fresh event content, and strong review counts. GravyBlock keeps all of that running automatically, so your taproom shows up when beer lovers search, plan trips, and ask AI assistants for recommendations."
      bullets={[
        "Optimize your Google Business Profile for taproom hours, events, food options, and pet/family policies.",
        "Publish weekly content: new releases, event recaps, brewery guides, local beer tourism.",
        "Track Google Map rankings for ‘craft brewery near me’ and city-specific beer searches.",
        "Monitor reviews on Google, Untappd, and Yelp. Key trust signals for brewery visitors.",
        "Post to local and craft beer subreddits to build community and earn backlinks.",
        "Check AI search visibility. Travelers increasingly ask ChatGPT for taproom recommendations.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free brewery scan"
    />
  );
}

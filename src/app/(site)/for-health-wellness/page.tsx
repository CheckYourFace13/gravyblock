import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for health & wellness businesses — gyms, spas, therapists | GravyBlock",
  description: "GravyBlock automates local SEO for health and wellness: publishes content, gathers reviews, keeps citations consistent, monitors your visibility. Help clients find you. Free scan.",
};

export default function ForHealthWellnessPage() {
  return (
    <VerticalLanding
      eyebrow="Health & Wellness"
      title="People searching for gyms, therapists, and wellness studios choose based on Google reviews and rankings. Show up first."
      body="Health and wellness decisions are personal. When someone types 'yoga studio near me' or 'massage therapist in [city]', they're ready to book. GravyBlock keeps your Google profile active with weekly posts, monitors your reviews, and publishes content — so you're the first result they trust enough to call."
      bullets={[
        "Publish a weekly Google Business Profile post based on a page from your own website, and add your own website images to your profile once Google is connected.",
        "Publish weekly content: workout tips, wellness guides, and local health resources that rank long-term.",
        "Track Google Map rankings for 'gym near me,' 'personal trainer,' 'yoga studio,' and city-specific searches.",
        "Monitor reviews and reply to Google reviews automatically once Google is connected. Yelp and TripAdvisor reviews are monitored and flagged for you — their APIs do not allow automatic replies.",
        "Send personalized outreach to relevant local organizations. A link only counts once verified live; links are never guaranteed.",
        "Monitor AI visibility — health and wellness searches are increasingly answered by ChatGPT and Perplexity.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free wellness business scan"
    />
  );
}

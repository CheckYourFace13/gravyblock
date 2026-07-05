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
      body="Health and wellness decisions are personal. When someone types 'yoga studio near me' or 'massage therapist in [city]', they're ready to book. GravyBlock keeps your Google profile complete, your reviews growing, and your content publishing weekly — so you're the first result they trust enough to call."
      bullets={[
        "Optimize your Google Business Profile for your specific services: personal training, yoga, massage, therapy, and more.",
        "Publish weekly content: workout tips, wellness guides, and local health resources that rank long-term.",
        "Track Google Map rankings for 'gym near me,' 'personal trainer,' 'yoga studio,' and city-specific searches.",
        "Build your review count on Google. Social proof is the #1 conversion factor for wellness bookings.",
        "Send backlink outreach to local health blogs, fitness communities, and neighborhood directories.",
        "Monitor AI visibility — health and wellness searches are increasingly answered by ChatGPT and Perplexity.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free wellness business scan"
    />
  );
}

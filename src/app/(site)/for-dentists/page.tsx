import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for dentists & dental practices — rank on Google Maps | GravyBlock",
  description: "GravyBlock automates local SEO for dentists: publishes patient content weekly, tracks 'dentist near me' rankings, manages reviews, and monitors AI health search visibility. Free scan.",
};

export default function ForDentistsPage() {
  return (
    <VerticalLanding
      eyebrow="Dentists"
      title="New patients search for a dentist on Google before they ever call. Win that first click."
      body="Dental practices that rank at the top of Google Maps have more reviews, more content, and more active profiles than their competition. GravyBlock automates all of it, so your practice keeps climbing the rankings while you focus on patients."
      bullets={[
        "Optimize your Google Business Profile for 'dentist near me,' cosmetic, emergency, and pediatric searches.",
        "Publish weekly content: patient FAQs, procedure guides, oral health tips, and local health resources.",
        "Track Google Map rankings for high-intent dental searches in your city.",
        "Monitor reviews on Google and Healthgrades, the two most important trust signals for new patients.",
        "Build backlinks through outreach to local health and community websites.",
        "Track AI search mentions. A growing number of patients ask ChatGPT which dentist to call.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free dental practice scan"
    />
  );
}

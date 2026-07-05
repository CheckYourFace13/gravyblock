import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for dentists & dental practices — get discovered on Google | GravyBlock",
  description: "GravyBlock automates local SEO for dentists: publishes patient content weekly, gathers reviews, keeps your Google Business Profile fresh, audits citations. Help patients find you. Free scan.",
};

export default function ForDentistsPage() {
  return (
    <VerticalLanding
      eyebrow="Dentists"
      title="New patients search for a dentist on Google before they ever call. Win that first click."
      body="Successful dental practices on Google Maps have strong profiles, active reviews, and fresh content. GravyBlock automates all of it—building your profile strength and credibility signals—so you can focus on patients instead of chasing visibility."
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

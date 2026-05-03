import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for chiropractors & chiropractic practices — rank on Google | GravyBlock",
  description: "GravyBlock automates local SEO for chiropractors: publishes patient content weekly, tracks 'chiropractor near me' rankings, manages Google reviews, and monitors AI health search. Free scan.",
};

export default function ForChiropractorsPage() {
  return (
    <VerticalLanding
      eyebrow="Chiropractors"
      title="Patients searching for back pain relief call the first chiropractor they trust on Google. Be that practice."
      body="Chiropractic searches are high-intent and highly local. Someone searching 'chiropractor near me' is ready to book. GravyBlock keeps your Google profile optimized, your reviews growing, and your content publishing automatically — so new patients find you before they find your competitors."
      bullets={[
        "Optimize your GBP for back pain, neck pain, sports injury, auto accident, and pediatric chiropractic searches.",
        "Publish weekly patient-friendly content: condition guides, treatment FAQs, wellness tips, and local health articles.",
        "Track Google Map rankings for 'chiropractor near me' and condition-specific searches in your city.",
        "Monitor reviews on Google and Healthgrades — the top trust signals for new chiropractic patients.",
        "Send backlink outreach to local health, wellness, and sports community websites.",
        "Track AI search mentions for health and pain relief queries in your area.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free chiropractic practice scan"
    />
  );
}

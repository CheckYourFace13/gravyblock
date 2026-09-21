import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for chiropractors & chiropractic practices — get discovered on Google | GravyBlock",
  description: "GravyBlock automates local SEO for chiropractors: publishes patient content, gathers reviews, keeps your profile fresh, audits citations. Help patients find you. Free scan.",
};

export default function ForChiropractorsPage() {
  return (
    <VerticalLanding
      eyebrow="Chiropractors"
      title="Patients searching for back pain relief call the first chiropractor they trust on Google. Be that practice."
      body="Chiropractic searches are high-intent and highly local. Someone searching 'chiropractor near me' is ready to book. GravyBlock keeps your Google profile active with weekly posts, monitors your reviews, and publishes content from your own website's facts, to help new patients find you."
      bullets={[
        "Publish a weekly Google Business Profile post based on a page from your own website, and add your own website images to your profile once Google is connected.",
        "Publish weekly patient-friendly content: condition guides, treatment FAQs, wellness tips, and local health articles.",
        "Track Google Map rankings for 'chiropractor near me' and condition-specific searches in your city.",
        "Monitor reviews and reply to Google reviews automatically once Google is connected. Yelp and TripAdvisor replies are drafted for you to paste.",
        "Send personalized outreach to relevant local organizations. A link only counts once verified live; links are never guaranteed.",
        "Track AI search mentions for health and pain relief queries in your area.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free chiropractic practice scan"
    />
  );
}

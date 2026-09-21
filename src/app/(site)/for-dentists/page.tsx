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
      body="Successful dental practices on Google Maps have strong profiles, active reviews, and fresh content. GravyBlock handles a defined set of that work on a schedule (website content, Google posts, review replies, local outreach) so you can focus on patients."
      bullets={[
        "Publish a weekly Google Business Profile post based on a page from your own website, and add your own website images to your profile once Google is connected.",
        "Publish weekly content: patient FAQs, procedure guides, oral health tips, and local health resources.",
        "Track Google Map rankings for high-intent dental searches in your city.",
        "Monitor reviews and reply to Google reviews automatically once Google is connected. Yelp and TripAdvisor replies are drafted for you to paste.",
        "Send personalized outreach to relevant local organizations. A link only counts once verified live; links are never guaranteed.",
        "Track AI search mentions. A growing number of patients ask ChatGPT which dentist to call.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free dental practice scan"
    />
  );
}

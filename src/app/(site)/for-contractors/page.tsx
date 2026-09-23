import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for contractors & home service businesses — get discovered on Google | GravyBlock",
  description: "GravyBlock automates local SEO for contractors: publishes content, gathers reviews, keeps citations consistent, monitors your visibility. Help homeowners find you. Free scan.",
};

export default function ForContractorsPage() {
  return (
    <VerticalLanding
      eyebrow="Contractors"
      title="Most homeowners call the first contractor they find and trust on Google. Be that contractor."
      body="Contractor leads are local and high-value. Homeowners search, compare the first 3 results, and call whoever looks most trustworthy. GravyBlock keeps your Google Business Profile active with weekly posts, publishes service-area content from your own website's facts, and tracks your ranking."
      bullets={[
        "Publish a weekly Google Business Profile post based on a page from your own website, and add your own website images to your profile once Google is connected.",
        "Publish weekly content: project spotlights, how-to guides, city-specific service pages.",
        "Track Google Map rankings for high-intent searches like 'contractor near me' by city and service.",
        "Monitor reviews and reply to Google reviews automatically once Google is connected. Yelp and TripAdvisor reviews are monitored and flagged for you — their APIs do not allow automatic replies.",
        "Send personalized outreach to relevant local organizations. A link only counts once verified live; links are never guaranteed.",
        "Track AI search visibility so your business gets mentioned when homeowners ask for contractor recommendations.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free contractor scan"
    />
  );
}

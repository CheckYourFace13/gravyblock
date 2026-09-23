import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for plumbers — get found on Google Maps & Search | GravyBlock",
  description: "GravyBlock automates local SEO for plumbers: publishes content, gathers reviews, keeps your profile fresh, audits citations. Help homeowners find you fast. Free scan.",
};

export default function ForPlumbersPage() {
  return (
    <VerticalLanding
      eyebrow="Plumbers"
      title="When a pipe bursts at midnight, homeowners call the first plumber they trust on Google. Be that plumber."
      body="Emergency plumbing searches are immediate and high-value. Homeowners pick businesses with strong reviews and easy phone numbers. GravyBlock keeps your Google profile active with weekly posts, monitors your reviews, and checks that your name, phone and address agree across your website and Google, to help you be discoverable for emergency and planned jobs alike."
      bullets={[
        "Publish a weekly Google Business Profile post based on a page from your own website, and add your own website images to your profile once Google is connected.",
        "Publish weekly content: DIY guides, prevention tips, city-specific plumbing guides that rank long-term.",
        "Track Google Map rankings for 'plumber near me,' 'emergency plumber,' and specific service searches.",
        "Monitor reviews and reply to Google reviews automatically once Google is connected. Once your booking/invoicing system is connected, GravyBlock automatically asks your real completed customers for a review — no list to send yourself.",
        "Send personalized outreach to relevant local organizations. A link only counts once verified live; links are never guaranteed.",
        "Track AI visibility for home emergency searches. More homeowners ask ChatGPT first now.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free plumber scan"
    />
  );
}

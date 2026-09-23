import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for hair salons, nail salons & spas — get discovered on Google | GravyBlock",
  description: "GravyBlock automates local SEO for salons and spas: publishes content, gathers reviews, keeps your profile fresh, audits citations. Help clients find you. Free scan.",
};

export default function ForSalonsPage() {
  return (
    <VerticalLanding
      eyebrow="Salons and spas"
      title="New clients search for a salon near them every day. Make sure yours shows up first."
      body="Salon bookings are almost always triggered by a Google search or Google Maps result. The salons at the top have more photos, more reviews, and more active profiles. GravyBlock keeps your Google profile active with weekly posts, publishes local beauty content from your own website's facts, and tracks your ranking week over week."
      bullets={[
        "Publish a weekly Google Business Profile post based on a page from your own website, and add your own website images to your profile once Google is connected.",
        "Publish weekly local content: seasonal hair trends, nail looks, before-and-afters, and style guides.",
        "Track your Google Map ranking for 'hair salon near me' and specific service searches.",
        "Monitor reviews and reply to Google reviews automatically once Google is connected. Yelp and TripAdvisor reviews are monitored and flagged for you — their APIs do not allow automatic replies.",
        "Share your real reviews on your connected Facebook Page and keep your profile active with weekly Google Business Profile posts.",
        "Check AI search mentions for beauty recommendations in your city.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free salon scan"
    />
  );
}

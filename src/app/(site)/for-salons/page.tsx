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
      body="Salon bookings are almost always triggered by a Google search or Google Maps result. The salons at the top have more photos, more reviews, and more active profiles. GravyBlock keeps your profile fresh, publishes local beauty content automatically, and tracks your ranking week over week."
      bullets={[
        "Optimize your Google Business Profile: categories, photos, booking links, and service descriptions.",
        "Publish weekly local content: seasonal hair trends, nail looks, before-and-afters, and style guides.",
        "Track your Google Map ranking for 'hair salon near me' and specific service searches.",
        "Monitor review count and recency on Google and Yelp, the top trust signals for new salon clients.",
        "Post seasonal content to local community boards and subreddits to drive bookings.",
        "Check AI search mentions for beauty recommendations in your city.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free salon scan"
    />
  );
}

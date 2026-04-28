import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for salons | GravyBlock",
  description: "Autopilot local SEO for hair salons, nail salons, and spas. Rank higher for local beauty searches and build a consistent stream of new clients.",
};

export default function ForSalonsPage() {
  return (
    <VerticalLanding
      eyebrow="Salons and spas"
      title="New clients search for a salon near them. Make sure yours is the one they call."
      body="Salon clients are local, loyal, and search-driven. The first booking almost always comes from Google Maps or a search result. GravyBlock scores your online presence — photos, reviews, booking links, and local content — and keeps it competitive without adding work to your schedule."
      bullets={[
        "Score your Google Business Profile for beauty and personal care searches.",
        "Track photo count, review recency, and booking link visibility.",
        "Generate seasonal GBP posts and local content automatically.",
        "Monitor competitor visibility so you know when to push harder on reviews.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free salon scan"
    />
  );
}

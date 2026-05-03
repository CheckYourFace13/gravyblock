import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for contractors & home service businesses — rank on Google | GravyBlock",
  description: "GravyBlock automates local SEO for contractors: publishes service-area content weekly, tracks Google rankings, manages reviews, and sends backlink outreach. Free scan.",
};

export default function ForContractorsPage() {
  return (
    <VerticalLanding
      eyebrow="Contractors"
      title="Most homeowners call the first contractor they find and trust on Google. Be that contractor."
      body="Contractor leads are local and high-value. Homeowners search, compare the first 3 results, and call whoever looks most trustworthy. GravyBlock keeps your Google Business Profile optimized, publishes service-area content for every city you work in, and tracks your ranking — all automatically."
      bullets={[
        "Optimize your GBP for every service: roofing, HVAC, electrical, plumbing, remodeling, and more.",
        "Publish weekly content: project spotlights, how-to guides, city-specific service pages.",
        "Track Google Map rankings for high-intent searches like 'contractor near me' by city and service.",
        "Build review volume — GravyBlock monitors count and recency on Google and HomeAdvisor.",
        "Send backlink outreach to local home improvement blogs, realty sites, and neighborhood boards.",
        "Track AI search visibility so your business gets mentioned when homeowners ask for contractor recommendations.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free contractor scan"
    />
  );
}

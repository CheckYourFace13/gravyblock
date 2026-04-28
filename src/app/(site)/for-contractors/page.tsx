import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for contractors | GravyBlock",
  description: "Autopilot local SEO for contractors and home service businesses. Rank higher in local search, get more Google reviews, and build a steady lead flow.",
};

export default function ForContractorsPage() {
  return (
    <VerticalLanding
      eyebrow="Contractors"
      title="Most homeowners pick a contractor from the first three results. Be one of them."
      body="Contractors depend on local trust. Whether you do roofing, HVAC, electrical, or general remodeling, your Google presence is your first impression. GravyBlock audits every local signal — your profile, reviews, website, and content — and runs ongoing optimization so your ranking improves without you managing it manually."
      bullets={[
        "Identify GBP gaps that are holding your ranking back against competitors.",
        "Build review volume with automated prompts sent to your billing contacts.",
        "Publish service-area content that targets homeowners in each city you work.",
        "Get weekly visibility refreshes so you know when rankings shift.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free contractor scan"
    />
  );
}

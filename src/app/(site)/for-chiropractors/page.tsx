import type { Metadata } from "next";
import { VerticalLanding } from "@/components/vertical-landing";

export const metadata: Metadata = {
  title: "Local SEO for chiropractors | GravyBlock",
  description: "Autopilot local SEO for chiropractic practices. Rank for local pain relief searches, build patient trust online, and grow without paid ads.",
};

export default function ForChiropractorsPage() {
  return (
    <VerticalLanding
      eyebrow="Chiropractors"
      title="Patients searching for back pain relief pick the first provider they trust. That trust starts online."
      body="Chiropractic practices win on local trust signals: reviews from real patients, a clean and informative website, and a complete Google Business Profile. GravyBlock runs the ongoing optimization work so your practice stays visible for the searches that bring in new patients."
      bullets={[
        "Audit your GBP, reviews, and website for health-search trust signals.",
        "Generate condition-specific content: back pain, neck pain, sports injuries, and more.",
        "Track AI search visibility for local health queries — a growing patient source.",
        "Monitor review count and recency, the biggest drivers of chiropractic local rank.",
      ]}
      ctaHref="/scan"
      ctaLabel="Run a free chiropractic practice scan"
    />
  );
}

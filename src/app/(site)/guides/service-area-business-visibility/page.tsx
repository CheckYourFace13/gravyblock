import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "@/components/guide-shell";

export const metadata: Metadata = {
  title: "Service-area business visibility — GravyBlock guide",
  description:
    "How service-area businesses (SABs) clarify where they work, what they offer, and how they earn trust without a single flagship storefront.",
};

export default function ServiceAreaBusinessVisibilityGuidePage() {
  return (
    <GuideShell
      title="Service-area businesses: earn the map without faking a storefront"
      intro="Plumbers, HVAC, mobile clinics, and consultants often serve a radius. The job is to make that radius legible to humans and systems — not to keyword-stuff city names."
      related={[
        { href: "/guides/multi-location-local-seo", label: "Multi-location local SEO" },
        { href: "/guides/social-proof-and-local-conversion", label: "Social proof and local conversion" },
        { href: "/guides", label: "All guides" },
      ]}
    >
      <h2>Clarify the geography</h2>
      <p>
        List primary cities and counties you truly serve. If you subcontract or refer outside core zones, say so. Clear
        geography reduces bad leads and improves assistant summaries because the facts are not contradictory.
      </p>
      <h2>Match the site to the listing</h2>
      <p>
        Your homepage should repeat the same service list, emergency policies, and proof points as your public listing
        fields allow. Mismatches are a common reason assistants hedge with “call to confirm.”
      </p>
      <h2>Proof for high-stakes jobs</h2>
      <p>
        Licenses, insurance, warranties, and response-time SLAs belong in obvious places. For SABs, trust beats clever
        copy — especially when someone is comparing three tabs at midnight.
      </p>
      <h2>What GravyBlock checks today</h2>
      <p>
        The scan scores public listing signals plus a fetch of your website and discovered social links — a practical
        baseline for SABs that live on maps + mobile.{" "}
        <Link href="/scan" className="font-medium text-red-800 hover:underline">
          Run a scan
        </Link>{" "}
        to see prioritized fixes.
      </p>
    </GuideShell>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "@/components/guide-shell";

export const metadata: Metadata = {
  title: "Multi-location local SEO — GravyBlock guide",
  description:
    "How multi-location brands keep listings, sites, and trust signals aligned so Google, Maps, and AI summaries stay consistent.",
};

export default function MultiLocationLocalSeoGuidePage() {
  return (
    <GuideShell
      title="Multi-location local SEO that survives real operations"
      intro="When you add locations, search systems do not automatically inherit your brand story. They inherit whatever each storefront publishes — which is how chains quietly lose map share."
      related={[
        { href: "/guides/service-area-business-visibility", label: "Service-area business visibility" },
        { href: "/guides/website-trust-signals", label: "Website trust signals" },
        { href: "/#plans", label: "GravyBlock Entry vs Pro" },
      ]}
    >
      <h2>One entity, many surfaces</h2>
      <p>
        Treat each location as a first-class page and listing: unique NAP where it truly differs, shared brand promises,
        and a clear relationship between the brand site and each local URL. Avoid duplicate boilerplate that reads like
        spam; do include real differences (hours, parking, services, staff).
      </p>
      <h2>Consistency without copy-paste</h2>
      <p>
        Use a content model: approved claims, approved categories, approved CTAs. Locations customize within guardrails.
        That is how you keep Apple Maps, Google, Bing, and your own site aligned without a weekly crisis.
      </p>
      <h2>Measurement that scales</h2>
      <p>
        Track a small set of KPIs per location: impression trends, call clicks, direction requests, and on-site conversion
        events tied to UTM discipline. GravyBlock’s workspace is built around snapshots and recommendations so you can
        see movement over time — not a one-off PDF.
      </p>
      <h2>Multi-location readiness in the product</h2>
      <p>
        The data model supports brands and locations; scans run per business today. Use Entry for a single-location
        baseline, then Pro when you want recurring automation jobs and publishing queues on a workspace that is already on
        the Pro plan.{" "}
        <Link href="/scan" className="font-medium text-red-800 hover:underline">
          Start with a scan
        </Link>
        .
      </p>
    </GuideShell>
  );
}

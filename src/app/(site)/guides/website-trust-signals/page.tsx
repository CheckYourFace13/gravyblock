import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "@/components/guide-shell";

export const metadata: Metadata = {
  title: "Website trust signals for local businesses — GravyBlock guide",
  description:
    "Security, schema, contact clarity, and mobile UX that make maps traffic convert — explained without SEO snake oil.",
};

export default function WebsiteTrustSignalsGuidePage() {
  return (
    <GuideShell
      title="Website trust signals locals actually check"
      intro="After someone taps directions, they still open your site on their phone. Trust is the absence of surprises: HTTPS, correct phone numbers, readable hours, and forms that work."
      related={[
        { href: "/guides/social-proof-and-local-conversion", label: "Social proof and local conversion" },
        { href: "/guides/ai-search-local-businesses", label: "AI search for local businesses" },
        { href: "/#plans", label: "Base vs Pro" },
      ]}
    >
      <h2>Common checks that still fail audits</h2>
      <p>
        Valid SSL, no mixed content, fast LCP on mobile, tap targets that are not microscopic, and a phone number that
        matches your listing. These are table stakes, and they are still common losses in automated checks.
      </p>
      <h2>Schema where it helps humans too</h2>
      <p>
        LocalBusiness and opening hours markup should mirror what a person reads in plain text. If JSON-LD disagrees
        with the footer, you have created two sources of truth.
      </p>
      <h2>Contact and policy clarity</h2>
      <p>
        Privacy policy for forms, refund and cancellation pages for bookings, and a visible address or service area for
        regulated trades. Ambiguity increases bounce rate faster than weak adjectives.
      </p>
      <h2>What the product measures</h2>
      <p>
        GravyBlock fetches your homepage during the scan and scores technical and conversion readiness signals you can
        act on immediately.{" "}
        <Link href="/scan" className="font-medium text-red-800 hover:underline">
          Run the free scan
        </Link>
        .
      </p>
    </GuideShell>
  );
}

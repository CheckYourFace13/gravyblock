import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "@/components/guide-shell";

export const metadata: Metadata = {
  title: "Social proof and local conversion — GravyBlock guide",
  description:
    "Reviews, policies, and low-friction paths that help maps-driven visitors become customers — without manipulative dark patterns.",
};

export default function SocialProofAndLocalConversionGuidePage() {
  return (
    <GuideShell
      title="Social proof and local conversion: earn the visit, then earn the booking"
      intro="Maps get you considered; your site and policies get you chosen. The bridge is fast answers to anxious questions."
      related={[
        { href: "/guides/website-trust-signals", label: "Website trust signals" },
        { href: "/guides/service-area-business-visibility", label: "Service-area business visibility" },
        { href: "/for-restaurants", label: "Example: restaurants" },
      ]}
    >
      <h2>Reviews are a product surface</h2>
      <p>
        Respond to reviews, fix recurring complaints operationally, and surface the themes you want new customers to
        see (accessibility, speed, cleanliness). Fresh, specific reviews beat volume alone.
      </p>
      <h2>Reduce decision anxiety</h2>
      <p>
        Show menus, pricing bands, insurance, arrival instructions, and cancellation rules. For services, “what
        happens on day one” is a conversion lever.
      </p>
      <h2>One primary CTA per page</h2>
      <p>
        Pick whether you want calls, bookings, or directions — then design the mobile fold around that choice. Extra
        buttons dilute action without adding clarity.
      </p>
      <h2>How GravyBlock helps</h2>
      <p>
        The scan highlights conversion gaps alongside listing clarity. Use the workspace to track improvements over time
        and Pro to queue content that reinforces proof.{" "}
        <Link href="/scan" className="font-medium text-red-800 hover:underline">
          Run a scan
        </Link>
        .
      </p>
    </GuideShell>
  );
}

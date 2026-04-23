import type { Metadata } from "next";
import Link from "next/link";
import { GuideShell } from "@/components/guide-shell";

export const metadata: Metadata = {
  title: "AI search visibility for local businesses — GravyBlock guide",
  description:
    "How assistants and AI summaries use your facts, and how to improve clarity without promising guaranteed rankings.",
};

export default function AiSearchLocalBusinessesGuidePage() {
  return (
    <GuideShell
      title="AI search and assistants: make the facts boring (in a good way)"
      intro="Assistants summarize what they can verify. If hours, services, and policies disagree across the open web, the model hedges — and hedging loses the click."
      related={[
        { href: "/guides/website-trust-signals", label: "Website trust signals" },
        { href: "/guides/multi-location-local-seo", label: "Multi-location local SEO" },
        { href: "/#ai-search", label: "Homepage: AI search section" },
      ]}
    >
      <h2>Structured beats clever</h2>
      <p>
        Use consistent business names, categories, and service nouns everywhere. Avoid rotating taglines in place of
        factual service lines — models latch onto stable tokens.
      </p>
      <h2>Answer the obvious questions upfront</h2>
      <p>
        Pricing ranges, insurance accepted, service radius, cancellation policy, and “how to book” should not require
        archaeology. When those answers live in predictable sections, summaries get sharper.
      </p>
      <h2>Monitoring without magic</h2>
      <p>
        GravyBlock Pro runs scheduled automation that records synthetic AI visibility checks alongside visibility
        snapshots — useful for trend watching, not a promise of rank position in any specific engine.
      </p>
      <p>
        Start with a free scan to see how your listing and site line up today:{" "}
        <Link href="/scan" className="font-medium text-red-800 hover:underline">
          Run the scan
        </Link>
        .
      </p>
    </GuideShell>
  );
}

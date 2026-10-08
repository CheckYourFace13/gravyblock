import type { Metadata } from "next";
import Link from "next/link";
import { ScanForm } from "@/components/scan-form";

export const metadata: Metadata = {
  title: "Free local SEO scan — see your visibility score in 60 seconds",
  description:
    "Free Google visibility scan for local businesses. See your score, top ranking problems, and a prioritized fix list in under 60 seconds. No credit card required.",
  // Canonical without query params — prevents /scan?vertical=X&location=Y
  // variants from being indexed as separate pages.
  alternates: { canonical: "https://gravyblock.com/scan" },
};

import { trackReferralEvent } from "@/lib/referrals/referral-tracker";
import { normalizePromoCode } from "@/lib/stripe/promo-codes";
import { FunnelBeacon } from "@/components/funnel-beacon";

type Props = { searchParams: Promise<{ plan?: string; promo?: string; ref?: string; q?: string; city?: string; location?: string; e?: string }> };

function decodeLeadEmail(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

export default async function ScanPage({ searchParams }: Props) {
  const query = await searchParams;
  // Pre-fill from outreach email links (/scan?q=Business&city=City&e=base64email)
  const initialQuery = query.q?.trim() || undefined;
  const initialCity = query.city?.trim() || query.location?.trim() || undefined;
  const leadEmail = decodeLeadEmail(query.e);

  // Track referral clicks (fire-and-forget, non-blocking)
  if (query.ref) {
    void trackReferralEvent("click", query.ref).catch(() => null);
  }
  const raw = query.plan?.toLowerCase() ?? "";
  const selectedPlan = (["starter", "growth", "pro", "agency"].includes(raw)
    ? raw
    : raw === "base" || raw === "entry" ? "starter" : null) as "starter" | "growth" | "pro" | "agency" | null;
  const promoCode = normalizePromoCode(query.promo);

  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "GravyBlock Free Local SEO Scan",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: "Free Google visibility scan for local businesses. See your score across 6 ranking factors — profile quality, reviews, citations, trust signals, conversion readiness, and AI search presence — in under 60 seconds.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: "https://gravyblock.com/scan",
    publisher: {
      "@type": "Organization",
      name: "GravyBlock",
      url: "https://gravyblock.com",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
      />
      <FunnelBeacon eventType="scan_started" />
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-800">Free scan</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">
          See your Google visibility score in 60 seconds.
        </h1>
        <p className="mt-4 text-lg text-zinc-600">
          Find your business, get a score across 6 ranking factors, and see what is holding you back and what GravyBlock would do about it. Free, no credit card.
        </p>
      </div>

      <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-10">
        <ScanForm selectedPlan={selectedPlan} promoCode={promoCode} initialQuery={initialQuery} initialCity={initialCity} leadEmail={leadEmail} />
      </div>
    </div>
    </>
  );
}

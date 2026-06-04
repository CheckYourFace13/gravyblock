import type { Metadata } from "next";
import Link from "next/link";
import { ScanForm } from "@/components/scan-form";

export const metadata: Metadata = {
  title: "Free local SEO scan — see your visibility score in 60 seconds | GravyBlock",
  description:
    "Free Google visibility scan for local businesses. See your score, top ranking problems, and a prioritized fix list in under 60 seconds. No credit card required.",
  // Canonical without query params — prevents /scan?vertical=X&location=Y
  // variants from being indexed as separate pages.
  alternates: { canonical: "https://gravyblock.com/scan" },
};

import { trackReferralEvent } from "@/lib/referrals/referral-tracker";
import { normalizePromoCode } from "@/lib/stripe/promo-codes";

type Props = { searchParams: Promise<{ plan?: string; promo?: string; ref?: string }> };

export default async function ScanPage({ searchParams }: Props) {
  const query = await searchParams;

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
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-800">Free scan</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">
          See your Google visibility score in 60 seconds.
        </h1>
        <p className="mt-4 text-lg text-zinc-600">
          Find your business on Google, get a score across 6 ranking factors, and see exactly what's holding you back. Free, no credit card required. Works for restaurants, dentists, contractors, salons, lawyers, and any local business.
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Already know you want more? Use code <strong className="text-zinc-700">INTRO50</strong> at checkout for 50% off month one.
        </p>
      </div>

      <div className="mx-auto mt-6 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
        <p className="text-sm font-semibold text-zinc-900">Want ongoing automation? Pick a plan after your scan:</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={promoCode ? `/start?plan=starter&promo=${encodeURIComponent(promoCode)}` : "/start?plan=starter"}
            className="inline-flex items-center justify-center rounded-full bg-zinc-100 border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-200"
          >
            Starter — $39.99/mo
          </Link>
          <Link
            href={promoCode ? `/start?plan=growth&promo=${encodeURIComponent(promoCode)}` : "/start?plan=growth"}
            className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500"
          >
            Scale — $74.99/mo ★
          </Link>
          <Link
            href={promoCode ? `/start?plan=pro&promo=${encodeURIComponent(promoCode)}` : "/start?plan=pro"}
            className="inline-flex items-center justify-center rounded-full bg-zinc-100 border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-200"
          >
            Pro — $149.99/mo
          </Link>
        </div>
      </div>
      {promoCode ? (
        <div className="mx-auto mt-3 max-w-3xl rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs font-medium text-zinc-700">
          Promo code ready: {promoCode}
        </div>
      ) : null}

      {selectedPlan ? (
        <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-red-200 bg-red-50/70 p-4 text-sm text-zinc-900">
          <p className="font-semibold">{selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)} selected</p>
          <p className="mt-1 text-zinc-700">
            Confirm the right Google listing so we can attach {selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)} to this business
            before checkout in your workspace.
          </p>
        </div>
      ) : null}
      <div className="mt-10 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-10">
        <ScanForm selectedPlan={selectedPlan} promoCode={promoCode} />
      </div>
    </div>
    </>
  );
}

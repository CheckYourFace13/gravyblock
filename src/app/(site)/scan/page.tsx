import type { Metadata } from "next";
import Link from "next/link";
import { ScanForm } from "@/components/scan-form";

export const metadata: Metadata = {
  title: "Free visibility scan | GravyBlock",
  description:
    "Run a free scan for any local business: score and top findings first, full report by email after unlock. Starter, Growth, Pro, and Agency add ongoing automation from your workspace.",
};

import { trackReferralEvent } from "@/lib/referrals/referral-tracker";

type Props = { searchParams: Promise<{ plan?: string; promo?: string; ref?: string }> };

function normalizePromoCodeIntent(raw?: string): "ILoveYouFree" | "ILikeYou50" | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value === "ILoveYouFree" || value === "ILikeYou50") return value;
  return null;
}

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
  const promoCode = normalizePromoCodeIntent(query.promo);

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-800">Scan</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">Confirm the business to scan</h1>
        <p className="mt-4 text-lg text-zinc-600">
          Works for restaurants, med spas, salons, law firms, dental practices, gyms, apartment communities, home
          services, retail, clinics, and other local businesses.
        </p>
      </div>

      <div className="mx-auto mt-6 flex max-w-3xl flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-left text-sm text-zinc-700">
          <p className="font-semibold text-zinc-900">Plans</p>
          <p className="mt-1 text-xs text-zinc-600">
            Free: score preview and email unlock. Starter: monthly monitoring. Growth: full publishing and Reddit outreach. Pro: programmatic SEO and GBP sync. Agency: up to 10 clients.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/scan"
            className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            Free report
          </Link>
          <Link
            href={promoCode ? `/scan?plan=starter&promo=${encodeURIComponent(promoCode)}` : "/scan?plan=starter"}
            className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 hover:border-zinc-400"
          >
            Starter
          </Link>
          <Link
            href={promoCode ? `/scan?plan=growth&promo=${encodeURIComponent(promoCode)}` : "/scan?plan=growth"}
            className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500"
          >
            Growth
          </Link>
          <Link
            href={promoCode ? `/scan?plan=pro&promo=${encodeURIComponent(promoCode)}` : "/scan?plan=pro"}
            className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 hover:border-zinc-400"
          >
            Pro
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
  );
}

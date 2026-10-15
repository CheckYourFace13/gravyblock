import type { Metadata } from "next";
import { SignupForm } from "./signup-form";
import { ProofTeaser } from "./proof-teaser";
import { FunnelBeacon } from "@/components/funnel-beacon";
import { getReportWithContext } from "@/lib/report/repository";
import { OFFER } from "@/lib/offer";

export const metadata: Metadata = {
  title: "Start GravyBlock",
  description: "Start GravyBlock for $39.99 a month. Cancel anytime, 30-day money-back guarantee.",
  robots: { index: false, follow: false }, // don't index the signup funnel
};

type Props = { searchParams: Promise<{ report?: string }> };

const INCLUDED = [
  "Finds what is hurting your visibility",
  "Chooses what is worth fixing next",
  "Does the eligible work automatically and verifies it",
  "Works on Google, reviews and social once connected",
  "Keeps monitoring and working automatically",
];

export default async function StartPage({ searchParams }: Props) {
  const query = await searchParams;
  // Arriving from a completed report: the business is already known, so only the email is missing.
  const reportRecord = query.report ? await getReportWithContext(query.report).catch(() => null) : null;
  const prefill = reportRecord?.businessId
    ? {
        reportPublicId: query.report as string,
        businessName: reportRecord.payload.business.name,
        website: reportRecord.payload.business.website ?? "",
        city: reportRecord.payload.business.address ?? "",
      }
    : null;

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-50 to-white px-4 py-10 sm:px-6">
      <FunnelBeacon eventType="start_page_viewed" reportPublicId={prefill?.reportPublicId ?? null} businessId={reportRecord?.businessId ?? null} />
      <div className="mx-auto max-w-lg">
        {prefill ? null : <ProofTeaser />}

        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl shadow-zinc-100">
          <div className="bg-gradient-to-br from-red-600 to-red-700 px-8 pb-6 pt-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-200">{OFFER.name}</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-4xl font-black text-white">$39.99</span>
              <span className="text-sm text-red-200">/month</span>
            </div>
            <p className="mt-0.5 text-xs font-semibold text-red-200">{OFFER.risk}</p>
            <ul className="mt-5 space-y-1.5">
              {INCLUDED.map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm text-red-100">
                  <span className="text-xs font-bold text-red-300">✓</span>
                  {b}
                </li>
              ))}
            </ul>
          </div>

          <div className="px-8 py-8">
            <h1 className="mb-1 text-xl font-semibold text-zinc-900">{prefill ? "Confirm your email to start" : "Start GravyBlock"}</h1>
            <p className="mb-6 text-sm text-zinc-500">
              {prefill ? "That is the only thing we still need." : "Tell us about your business and go straight to secure checkout."}
            </p>
            <SignupForm priceLabel={OFFER.priceLabel} prefill={prefill} />
          </div>
        </div>

        <div className="mt-4 flex justify-center gap-x-6 text-xs text-zinc-500">
          <span>✓ No setup fees</span>
          <span>✓ Cancel anytime</span>
          <span>✓ 30-day money-back guarantee</span>
        </div>
      </div>
    </div>
  );
}

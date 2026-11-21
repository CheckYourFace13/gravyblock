import type { Metadata } from "next";
import { SignupForm } from "./signup-form";
import { ProofTeaser } from "./proof-teaser";
import { FunnelBeacon } from "@/components/funnel-beacon";
import { getReportWithContext } from "@/lib/report/repository";
import { OFFER } from "@/lib/offer";
import { WebsiteVideo } from "@/components/website-video";

export const metadata: Metadata = {
  title: "Start GravyBlock",
  description: "Start GravyBlock with a 14-day free trial, then $29.99 a month or $299 a year. Cancel anytime, 30-day money-back guarantee after your first payment.",
  robots: { index: false, follow: false }, // don't index the signup funnel
};

type Props = { searchParams: Promise<{ report?: string; interval?: string }> };

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
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="text-4xl font-black text-white">14 days free</span>
            </div>
            <p className="mt-1 text-sm text-red-100">
              Then {OFFER.priceLong}, or {OFFER.annualLabel} (save {OFFER.annualSavings} a year).
            </p>
            <p className="mt-0.5 text-xs font-semibold text-red-200">Cancel anytime during the trial and you are not charged.</p>
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
            <SignupForm defaultInterval={query.interval === "annual" ? "annual" : "monthly"} prefill={prefill} />
          </div>
        </div>

        <div className="mt-4 flex justify-center gap-x-6 text-xs text-zinc-500">
          <span>✓ No setup fees</span>
          <span>✓ Cancel anytime</span>
          <span>✓ 14-day free trial</span>
          <span>✓ 30-day money-back guarantee after your first payment</span>
        </div>
        <WebsiteVideo slot="getting-started" heading="Getting started" />
      </div>
    </div>
  );
}

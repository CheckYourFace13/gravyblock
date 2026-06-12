import type { Metadata } from "next";
import Link from "next/link";
import { RoiCalculator } from "./roi-calculator";

export const metadata: Metadata = {
  title: "Local SEO ROI Calculator — What Is a Top-3 Google Ranking Worth? | GravyBlock",
  description:
    "Calculate how much revenue your business is missing by not ranking in Google's top 3. Free interactive calculator based on real local search click data.",
  alternates: { canonical: "https://gravyblock.com/tools/local-seo-roi-calculator" },
  openGraph: {
    title: "Local SEO ROI Calculator — What Is a Top-3 Ranking Worth?",
    description: "See the monthly revenue at stake for your business in local search.",
    url: "https://gravyblock.com/tools/local-seo-roi-calculator",
    type: "website",
  },
};

const schema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Local SEO ROI Calculator",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  url: "https://gravyblock.com/tools/local-seo-roi-calculator",
  publisher: { "@type": "Organization", name: "GravyBlock", url: "https://gravyblock.com" },
};

export default function RoiCalculatorPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Free tool</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">
          Local SEO ROI Calculator
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-zinc-600">
          The top 3 results in Google Maps capture over 70% of local search clicks.
          See what that&apos;s worth for your business — and what staying invisible costs you every month.
        </p>

        <div className="mt-8">
          <RoiCalculator />
        </div>

        <section className="mt-14 rounded-2xl border border-zinc-200 bg-zinc-50 p-8">
          <h2 className="text-xl font-semibold text-zinc-900">How the math works</h2>
          <ul className="mt-4 space-y-3 text-sm text-zinc-600 leading-relaxed">
            <li className="flex gap-2">
              <span className="shrink-0 font-bold text-red-600">1.</span>
              <span><strong>Local searches</strong> — how many times people in your area search for your service each month. For most service categories in a mid-size city this is 500–3,000 searches.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 font-bold text-red-600">2.</span>
              <span><strong>70% to the top 3</strong> — multiple click studies show the Google Maps 3-pack plus top organic results capture 68–75% of all clicks. Businesses below the fold split the remainder.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 font-bold text-red-600">3.</span>
              <span><strong>Your close rate</strong> — local search leads have high intent. Most service businesses close 20–40% of inbound calls from Google.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 font-bold text-red-600">4.</span>
              <span><strong>Average job value</strong> — what a typical new customer is worth to you (first transaction, not lifetime value — so the real number is bigger).</span>
            </li>
          </ul>
        </section>

        <section className="mt-12 rounded-2xl border border-red-200 bg-red-50/60 p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-800">The next step</p>
          <h2 className="mt-2 text-2xl font-semibold text-zinc-900">Find out where you actually rank</h2>
          <p className="mt-2 text-sm text-zinc-600 max-w-lg mx-auto">
            Run a free 60-second scan to see your visibility score, where you rank vs. competitors,
            and exactly what&apos;s keeping you out of the top 3.
          </p>
          <Link
            href="/scan"
            className="mt-5 inline-block rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-500"
          >
            Get my free visibility score →
          </Link>
        </section>
      </div>
    </>
  );
}

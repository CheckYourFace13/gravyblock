import type { Metadata } from "next";
import Link from "next/link";
import { ReviewLinkTool } from "./review-link-tool";

export const metadata: Metadata = {
  title: "Free Google Review Link Generator (with QR Code) | GravyBlock",
  description:
    "Generate a direct 'leave us a review' link and QR code for your Google Business Profile in 10 seconds. Free, no account needed. Works for any business.",
  alternates: { canonical: "https://gravyblock.com/tools/review-link-generator" },
  openGraph: {
    title: "Free Google Review Link Generator (with QR Code)",
    description: "Get your direct Google review link + QR code in 10 seconds. Free, no signup.",
    url: "https://gravyblock.com/tools/review-link-generator",
    type: "website",
  },
};

const faqs = [
  {
    q: "How do I get my Google review link?",
    a: "Search for your business above, select it from the results, and your direct review link is generated instantly. The link opens Google's review form pre-loaded with your business — customers just tap stars and write.",
  },
  {
    q: "Does the QR code expire?",
    a: "No. The QR code points to your Google review link, which is permanent as long as your Google Business Profile exists. Print it on receipts, table tents, business cards, or invoices.",
  },
  {
    q: "Why do more Google reviews matter?",
    a: "Review count and recency are two of the top three local ranking factors. Businesses in Google's top 3 average 47+ reviews. A steady stream of new reviews directly improves your Maps ranking.",
  },
  {
    q: "Where should I put my review link?",
    a: "The highest-converting spots: a text message right after service, the bottom of receipts and invoices (as QR code), your email signature, and a follow-up email 24 hours after the job.",
  },
];

const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Google Review Link Generator",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      url: "https://gravyblock.com/tools/review-link-generator",
      publisher: { "@type": "Organization", name: "GravyBlock", url: "https://gravyblock.com" },
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

export default function ReviewLinkGeneratorPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Free tool</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">
          Google Review Link Generator
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-zinc-600">
          Get your direct &ldquo;leave us a review&rdquo; link and a print-ready QR code in 10 seconds.
          Free, no account needed.
        </p>

        <div className="mt-8">
          <ReviewLinkTool />
        </div>

        {/* Why it matters */}
        <section className="mt-14 rounded-2xl border border-zinc-200 bg-zinc-50 p-8">
          <h2 className="text-xl font-semibold text-zinc-900">Why a direct review link works better</h2>
          <p className="mt-3 text-zinc-600 leading-relaxed">
            When you ask a customer for a review and they have to find your business on Google themselves,
            friction drops conversion rates. A direct link opens the review form instantly — no searching, just stars ready to tap. Research shows businesses that use direct links collect more reviews than those asking without one.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { icon: "💬", title: "Text it", desc: "Send the link right after a job — completion rates are highest within an hour of service." },
              { icon: "🧾", title: "Print the QR", desc: "Put the QR code on receipts, invoices, table tents, and business cards." },
              { icon: "✉️", title: "Add to email", desc: "Drop the link in your email signature and post-service follow-ups." },
            ].map((item) => (
              <div key={item.title} className="rounded-xl bg-white border border-zinc-200 p-4">
                <div className="text-xl mb-1">{item.icon}</div>
                <p className="text-sm font-semibold text-zinc-900">{item.title}</p>
                <p className="mt-1 text-xs text-zinc-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold text-zinc-900 mb-5">Common questions</h2>
          <div className="space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="rounded-xl border border-zinc-200 bg-white p-5">
                <p className="font-semibold text-zinc-900">{f.q}</p>
                <p className="mt-1.5 text-sm text-zinc-600 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Upsell */}
        <section className="mt-12 rounded-2xl border border-red-200 bg-red-50/60 p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-800">Go further</p>
          <h2 className="mt-2 text-2xl font-semibold text-zinc-900">
            GravyBlock asks your customers for reviews automatically
          </h2>
          <p className="mt-2 text-sm text-zinc-600 max-w-lg mx-auto">
            Weekly review requests, review monitoring, AI-drafted reply suggestions, and your full
            local SEO running on autopilot — from $39.99/mo.
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

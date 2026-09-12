import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — GravyBlock",
  description:
    "GravyBlock is an automated local SEO platform: weekly content, Google Business Profile management, citation monitoring, and visibility tracking — built and personally operated by one team, committed to truthful measurement.",
  alternates: { canonical: "https://gravyblock.com/about" },
};

const schema = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "About GravyBlock",
  url: "https://gravyblock.com/about",
  mainEntity: {
    "@type": "Organization",
    name: "GravyBlock",
    url: "https://gravyblock.com",
    description:
      "Automated local SEO platform for small and local businesses: weekly content publishing, Google Business Profile management, citation monitoring, and visibility tracking.",
  },
};

export default function AboutPage() {
  return (
    <div className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <section className="border-b border-zinc-100 bg-gradient-to-b from-red-50 to-white px-4 pt-14 pb-12 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-800">About GravyBlock</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            Local SEO, handled — automatically, every week.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600">
            GravyBlock is an automated local SEO platform. It runs the ongoing work that gets a business found on
            Google Maps and Google Search — content, profile management, citation monitoring, and visibility
            tracking — without you having to do it yourself every week.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 space-y-12">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">The problem</h2>
          <p className="text-zinc-600 leading-relaxed">
            Local visibility comes from doing a lot of small things consistently: publishing content, keeping your
            Google Business Profile active, staying consistent across directories, responding to reviews, tracking
            where you actually rank. Most small business owners don't have the hours for it, and most SEO agencies
            charge $1,000+/month to do it manually with a person, not a system.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">How the automation works</h2>
          <p className="text-zinc-600 leading-relaxed">
            You run a free scan, which pulls your real Google listing and scores it across measurable ranking
            factors. On a paid plan, GravyBlock keeps working on that score every week: publishing AI-written
            content to your site, posting to your Google Business Profile once it's connected, monitoring your
            citations for mismatches, and tracking your visibility over time. Some of it runs fully automatically;
            some of it — connecting your Google Business Profile, approving a draft, adding missing information —
            needs a quick action from you. Your workspace always shows which is which, not a vague "everything is
            automatic" claim.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">Who operates it</h2>
          <p className="text-zinc-600 leading-relaxed">
            GravyBlock is built and personally operated by Chris. There's no account-management layer between you
            and the person running the product — if something's wrong with your setup, you can reach the person who
            can actually fix it.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">Truthful measurement, no fabricated results</h2>
          <p className="text-zinc-600 leading-relaxed">
            GravyBlock doesn't publish customer results it can't back with real data, and doesn't show a trend or a
            score improvement that isn't a genuine, comparable measurement. Where a claim depends on something you
            haven't connected yet (Google Business Profile, Search Console), the product says so instead of
            assuming. You can see exactly what's running for GravyBlock's own operated businesses at{" "}
            <Link href="/proof" className="font-semibold text-red-700 underline">
              /proof
            </Link>
            .
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 sm:p-8 text-center">
          <p className="text-sm font-semibold text-zinc-900">See it for your own business</p>
          <p className="mt-1 text-sm text-zinc-500">Free 60-second scan, no account required.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/scan" className="rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-500">
              Get my free visibility score →
            </Link>
            <Link href="/pricing" className="rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-700 hover:border-zinc-400">
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

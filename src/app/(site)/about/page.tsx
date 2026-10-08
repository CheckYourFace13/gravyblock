import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/company";

export const metadata: Metadata = {
  title: "About",
  description:
    "GravyBlock is software that learns a local business, decides what will help it get found on Google, and does the work automatically, with every result verified before it is reported.",
  alternates: { canonical: "/about" },
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
      "Automated local SEO platform for small and local businesses: website content publishing, Google Business Profile posts, citation consistency checks, and visibility tracking.",
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
            An engine that decides, does, and keeps going.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600">
            GravyBlock is an automated local SEO platform. It runs the ongoing work that gets a business found on
            Google Maps and Google Search — website content, Google Business Profile posts, citation consistency checks,
            and visibility tracking — without you having to do it yourself every week.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 space-y-12">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">The problem</h2>
          <p className="text-zinc-600 leading-relaxed">
            Local visibility comes from doing a lot of small things consistently: publishing content, keeping your
            Google Business Profile active, staying consistent across directories, responding to reviews, tracking
            where you actually rank. Most small business owners don't have the hours for it, and agencies that do it by hand are
            expensive. GravyBlock does the repeatable part as software.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">How the automation works</h2>
          <p className="text-zinc-600 leading-relaxed">
            You run a free scan, which pulls your real Google listing and scores it across measurable ranking
            factors. On a paid plan, GravyBlock keeps working on that score: publishing content written from your
            own website's facts to your connected site, posting to your Google Business Profile once it's connected,
            checking your citations for mismatches, and tracking your visibility over time. Some work needs a one-time
            connection first (your website, Google account or Facebook Page). Your workspace always shows what is working for
            you, what has been verified, and which single connection would unlock more, rather than a vague "everything is
            automatic" claim.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">Support</h2>
          <p className="text-zinc-600 leading-relaxed">
            Questions about billing, access, setup or what GravyBlock is doing for your business go to our support team
            at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-red-700 underline">
              {SUPPORT_EMAIL}
            </a>
            . We reply by email, usually within one business day. See also our{" "}
            <Link href="/privacy" className="font-semibold text-red-700 underline">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="font-semibold text-red-700 underline">
              Terms of Service
            </Link>
            .
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

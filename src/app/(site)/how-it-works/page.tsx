import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How GravyBlock Works: Local SEO That Runs Itself",
  description:
    "GravyBlock learns your business, finds what will help you get found on Google, decides what is worth doing, does the work automatically, verifies it, and measures the result. Connect once; GravyBlock takes it from there.",
  alternates: { canonical: "/how-it-works" },
};

const steps = [
  {
    title: "It learns your business",
    body: "GravyBlock reads your real website and your Google profile and builds a record of verified facts: what you do, where you do it, your hours, your services, your reviews. Everything it writes or posts later comes from that record. If your website does not say something, GravyBlock does not claim it.",
  },
  {
    title: "It finds growth opportunities",
    body: "It looks across the places local customers find you: your website, your Google Business Profile, your reviews, your listings, links from other sites, and whether AI assistants mention you. Each gap or opening it finds is recorded as an opportunity.",
  },
  {
    title: "It decides what is worth doing",
    body: "Not every fix is worth making. GravyBlock ranks the opportunities for your specific business and your stage, favors work that can actually move results over cosmetic tidying, and skips what is not worth the effort. You do not choose tactics, keywords or schedules.",
  },
  {
    title: "It does the eligible work automatically",
    body: "When an action is possible with the connections you have made, GravyBlock just does it: it publishes website content, posts to your Google Business Profile, replies to Google reviews, and pitches relevant local organizations for links. Routine work does not wait for your approval.",
  },
  {
    title: "It verifies that it happened",
    body: "After each action it checks the live result, for example loading the published page or looking at the profile, instead of trusting that a request succeeded. Work that cannot be confirmed is not counted.",
  },
  {
    title: "It measures what happens",
    body: "GravyBlock tracks the things that show whether the work helped: map rankings, search data when Google is connected, links earned, and whether AI assistants mention you. Early on it says results are too early to judge rather than guessing.",
  },
  {
    title: "It learns and continues",
    body: "What it measures feeds the next decision, so effort goes where it is working. Then the cycle repeats. It keeps going without a weekly task list for you to manage.",
  },
];

const connections = [
  { name: "Your website", detail: "WordPress, Webflow or Shopify. Lets GravyBlock publish content to your own site." },
  { name: "Your Google account", detail: "Lets GravyBlock post to your Google Business Profile, reply to Google reviews and read Search Console data." },
  { name: "Your Facebook Page", detail: "Lets GravyBlock post to your Page and Instagram." },
  { name: "Your booking or invoicing system", detail: "Lets GravyBlock know who your real completed customers are so it can ask them for a review." },
];

export default function HowItWorksPage() {
  return (
    <div>
      <section className="border-b border-zinc-200 bg-gradient-to-b from-red-50 via-white to-white">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">How it works</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            Local SEO that does the work, not just the reporting
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600">
            Most SEO software shows you a list of things to fix. GravyBlock decides which work is worth doing for your
            business and then does it, so you are not operating an SEO toolbox.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/scan"
              className="inline-flex items-center justify-center rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
            >
              Get my free visibility score →
            </Link>
            <Link
              href="/features"
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              See exactly what it does
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-semibold text-zinc-900">The loop, in seven steps</h2>
        <ol className="mt-8 space-y-4">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold text-zinc-900">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold text-zinc-900">Connect once. GravyBlock takes it from there.</h2>
          <p className="mt-3 max-w-2xl text-zinc-600">
            Some work needs permission to act on your accounts. You grant each permission one time, in your workspace.
            After that it is not a recurring chore.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {connections.map((c) => (
              <li key={c.name} className="rounded-2xl border border-zinc-200 bg-white p-5">
                <p className="font-semibold text-zinc-900">{c.name}</p>
                <p className="mt-1 text-sm text-zinc-600">{c.detail}</p>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/60 p-5 text-sm text-zinc-700">
            <p className="font-semibold text-zinc-900">A missing connection does not stop everything else.</p>
            <p className="mt-1">
              If you have not connected your Facebook Page, social posting waits, while content, reviews, monitoring and
              the rest keep running. GravyBlock shows you which single connection would unlock which work.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-semibold text-zinc-900">What you see in your workspace</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-red-700">Working for you</p>
            <p className="mt-2 text-sm text-zinc-600">What GravyBlock is doing right now and what is next.</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-red-700">Results</p>
            <p className="mt-2 text-sm text-zinc-600">
              Only work that was completed and verified. Nothing is shown as a result until it has been confirmed.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-red-700">Needs you</p>
            <p className="mt-2 text-sm text-zinc-600">Only an unavoidable one-time connection, or a rare exception.</p>
          </div>
        </div>
      </section>

      <section className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold text-zinc-900">What GravyBlock will not do</h2>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-sm text-zinc-700">
            <li>Promise rankings, traffic or a timeline. Results depend on your market and are never guaranteed.</li>
            <li>Make up facts about your business, or publish anything your own website and profiles do not support.</li>
            <li>Buy links, post in forums or comments, or create fake accounts.</li>
            <li>Ask you to pick keywords, approve routine posts, or manage a campaign calendar.</li>
          </ul>
          <p className="mt-4 text-sm text-zinc-600">
            Read the full list of{" "}
            <Link href="/features" className="underline">
              what is automatic, what needs a connection, and what is not offered
            </Link>
            , or see{" "}
            <Link href="/proof" className="underline">
              verified work on businesses we operate ourselves
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-8 text-center">
          <h2 className="text-2xl font-semibold text-zinc-900">Start with a free scan</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-600">
            Find your business, see your visibility score, and see what GravyBlock would do about each finding. About a
            minute, no credit card. Scale is $74.99/mo, locked while subscribed, with a 30-day money-back guarantee.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/scan"
              className="inline-flex items-center justify-center rounded-full bg-red-600 px-8 py-3 text-sm font-semibold text-white hover:bg-red-500"
            >
              Get my free visibility score →
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-8 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

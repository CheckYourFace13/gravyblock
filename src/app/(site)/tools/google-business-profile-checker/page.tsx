import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Free Google Business Profile Checker | GravyBlock",
  description: "Check how complete and trustworthy your Google Business Profile looks to customers and to Google's ranking algorithm. Free, instant, no account needed.",
  alternates: { canonical: "https://gravyblock.com/tools/google-business-profile-checker" },
};

const checks = [
  { label: "Profile completeness", detail: "Business name, address, phone, hours, and website all present and consistent." },
  { label: "Photo coverage", detail: "At least 5 photos including interior, exterior, and team or product shots." },
  { label: "Category accuracy", detail: "Primary category matches your actual services. Secondary categories add relevant coverage." },
  { label: "Review count", detail: "15+ reviews is a strong signal. Under 5 is a visible gap for most local searches." },
  { label: "Rating", detail: "4.0+ is considered trustworthy. Under 3.8 is a conversion risk even for high-ranking profiles." },
  { label: "Review recency", detail: "Reviews in the last 90 days show an active, engaged business." },
  { label: "Owner response rate", detail: "Responding to reviews signals professionalism and boosts click-through rate." },
  { label: "Services and products listed", detail: "Adding specific services or products helps match intent-based searches." },
  { label: "Q&A section", detail: "Answered questions on your profile show up in search and pre-empt objections." },
  { label: "Posts activity", detail: "Regular GBP posts show freshness and can capture attention in the knowledge panel." },
];

export default function GbpCheckerPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <div className="mb-4">
        <Link href="/tools" className="text-sm text-zinc-500 hover:text-zinc-800">
          Free tools
        </Link>
        <span className="mx-2 text-zinc-400">/</span>
        <span className="text-sm text-zinc-700">Google Business Profile Checker</span>
      </div>

      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Free tool</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">
        Google Business Profile Checker
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-zinc-600">
        See exactly what Google and potential customers see when they evaluate your business profile.
        Our free scan checks every signal that affects your local search ranking.
      </p>

      <div className="mt-8">
        <Link
          href="/scan"
          className="inline-block rounded-full bg-red-600 px-8 py-4 text-base font-semibold text-white shadow-sm hover:bg-red-500"
        >
          Check my Google Business Profile — free
        </Link>
        <p className="mt-3 text-sm text-zinc-500">Takes 30 seconds. No account required.</p>
      </div>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold text-zinc-900">What the checker looks at</h2>
        <p className="mt-2 text-zinc-600">
          Your Google Business Profile is the single most important factor in local search rankings.
          Here is what we check and why each one matters.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {checks.map((check) => (
            <div key={check.label} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="font-semibold text-zinc-900">{check.label}</p>
              <p className="mt-1 text-sm text-zinc-500">{check.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-2xl border border-zinc-200 bg-zinc-50 p-8">
        <h2 className="text-xl font-semibold text-zinc-900">Why GBP completeness matters so much</h2>
        <div className="mt-4 space-y-4 text-sm text-zinc-600">
          <p>
            Google uses your Business Profile as its primary data source for local search results. A thin or inconsistent profile
            is harder to rank and harder for customers to trust.
          </p>
          <p>
            Businesses with complete profiles, regular photo updates, and high review volume consistently outrank nearby competitors
            with higher domain authority or more backlinks. Local search rewards engagement signals, not just SEO authority.
          </p>
          <p>
            The checker runs against your live Google data, not cached information. The score you get reflects your profile today.
          </p>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold text-zinc-900">Common GBP problems we find</h2>
        <ul className="mt-4 space-y-3">
          {[
            "Business name has keywords stuffed in it (violates Google's guidelines and risks suspension).",
            "Primary category is too broad — \"Restaurant\" instead of \"Italian restaurant\" or \"Pizza delivery\".",
            "No photos uploaded in the last 6 months, signaling an inactive profile.",
            "Under 10 reviews despite 3+ years in business.",
            "Phone number or address doesn't match website contact page (citation inconsistency).",
            "Services menu is empty even though the website lists 8+ offerings.",
          ].map((issue) => (
            <li key={issue} className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm">
              <span className="mt-0.5 shrink-0 text-red-400">!</span>
              <span className="text-zinc-700">{issue}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-14 rounded-2xl bg-zinc-900 p-8 text-white">
        <h2 className="text-2xl font-semibold">Run your free GBP check now</h2>
        <p className="mt-3 text-zinc-300">
          Enter your business name and city. We will pull your Google data and score every signal in 30 seconds.
        </p>
        <div className="mt-6">
          <Link
            href="/scan"
            className="inline-block rounded-full bg-red-600 px-8 py-4 text-base font-semibold text-white hover:bg-red-500"
          >
            Start my free scan
          </Link>
        </div>
        <p className="mt-4 text-sm text-zinc-400">
          Already have results?{" "}
          <Link href="/#plans" className="text-zinc-300 underline">
            See how autopilot keeps your profile improving automatically.
          </Link>
        </p>
      </div>
    </div>
  );
}

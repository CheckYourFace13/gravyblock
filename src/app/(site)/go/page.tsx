import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Automated Local SEO for Small Businesses | GravyBlock",
  description:
    "Stop paying an agency. GravyBlock publishes content, sends backlink outreach, monitors reviews, and tracks your Google rankings every week — automatically. Free scan, no credit card.",
  robots: { index: false }, // Paid traffic page — keep SEO equity on homepage
};

const wins = [
  { icon: "✍️", text: "AI articles published to your site every week" },
  { icon: "🔗", text: "Backlink outreach emails sent monthly, automatically" },
  { icon: "⭐", text: "Reviews monitored, AI reply drafts ready in your inbox" },
  { icon: "📍", text: "Google Business Profile scored and fix queue updated" },
  { icon: "🤖", text: "ChatGPT, Perplexity, Gemini checked for your business" },
  { icon: "📊", text: "Competitor review gap tracked week over week" },
];

export default function GoPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Urgency bar */}
      <div className="bg-red-600 px-4 py-2.5 text-center text-xs font-bold text-white tracking-wide">
        Use code <span className="bg-white/20 rounded px-1.5 py-0.5">GOOGLE50</span> at checkout — 50% off your first month
      </div>

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-start">

          {/* Left: value prop */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-red-700 mb-3">Local SEO autopilot</p>
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl leading-tight">
              Stop doing SEO.<br />Let it run itself.
            </h1>
            <p className="mt-5 text-lg text-zinc-600 leading-relaxed">
              Local SEO agencies charge $1,000–$3,000/month. GravyBlock does the same work automatically for a fraction of the cost — publishing content, building backlinks, monitoring reviews, and tracking your Google rankings every single week.
            </p>

            <ul className="mt-8 space-y-3">
              {wins.map((w) => (
                <li key={w.text} className="flex items-center gap-3 text-sm text-zinc-700">
                  <span className="text-lg shrink-0">{w.icon}</span>
                  {w.text}
                </li>
              ))}
            </ul>

            <div className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Local SEO agency</span>
                <span className="font-bold text-zinc-900">$1,000–$3,000/mo</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Semrush + doing it yourself</span>
                <span className="font-bold text-zinc-900">$140/mo + 10 hrs/mo</span>
              </div>
              <div className="border-t border-zinc-200 pt-2 flex justify-between text-sm">
                <span className="font-semibold text-red-700">GravyBlock Scale</span>
                <span className="font-bold text-emerald-700">$74.99/mo, hands-free</span>
              </div>
            </div>
          </div>

          {/* Right: scan CTA card */}
          <div className="lg:sticky lg:top-8">
            <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-lg">
              <p className="text-xs font-bold uppercase tracking-widest text-red-700 mb-1">Free visibility scan</p>
              <h2 className="text-2xl font-bold text-zinc-900">See your Google score in 60 seconds</h2>
              <p className="mt-2 text-sm text-zinc-500">
                Find out exactly why competitors outrank you. No credit card, no signup required to run your scan.
              </p>

              <div className="mt-6 space-y-3">
                <Link
                  href="/scan?promo=GOOGLE50"
                  className="flex w-full items-center justify-center rounded-full bg-red-600 px-6 py-3.5 text-sm font-bold text-white hover:bg-red-500 shadow-sm transition"
                >
                  Get my free visibility score
                </Link>
                <Link
                  href="/scan?plan=growth&promo=GOOGLE50"
                  className="flex w-full items-center justify-center rounded-full border border-zinc-300 bg-white px-6 py-3.5 text-sm font-bold text-zinc-900 hover:bg-zinc-50 transition"
                >
                  Start Scale — $74.99/mo
                </Link>
              </div>

              <div className="mt-5 space-y-2 text-xs text-zinc-400">
                <p className="flex items-center gap-1.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Free scan, no credit card required
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Code GOOGLE50 = 50% off your first month
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  30-day money-back guarantee on paid plans
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="text-emerald-500 font-bold">✓</span>
                  Cancel anytime, no contracts
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 text-xs text-zinc-500">
              <p className="font-semibold text-zinc-700 mb-1">Works for any local business</p>
              Restaurants · Dentists · HVAC · Plumbers · Salons · Lawyers · Chiropractors · Real estate agents · Contractors · And more
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

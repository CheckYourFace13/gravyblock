import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "GravyBlock on Product Hunt — Local SEO That Runs Itself",
  description:
    "GravyBlock automates local SEO for small businesses. Weekly AI content, Google Business Profile posts, backlink outreach, review monitoring, and Google ranking tracking. Free scan. Product Hunt exclusive: 50% off your first 2 months.",
  robots: { index: false }, // PH page shouldn't compete with homepage in search
};

const features = [
  {
    icon: "✍️",
    title: "Weekly content published to your site",
    desc: "AI-written local SEO articles go live automatically. No login, no approval needed (unless you want it).",
  },
  {
    icon: "📣",
    title: "Google Business Profile on autopilot",
    desc: "Weekly GBP posts, photo uploads, and Q&A seeding keep your listing active — the strongest freshness signal for Maps rankings.",
  },
  {
    icon: "🔗",
    title: "Backlink outreach, automated",
    desc: "We find local chambers, news sites, and niche blogs in your area and send personalized outreach emails monthly.",
  },
  {
    icon: "⭐",
    title: "Review monitoring + AI reply drafts",
    desc: "New reviews flagged instantly. AI drafts a reply you can copy in one click. Negative reviews caught privately.",
  },
  {
    icon: "🤖",
    title: "AI search visibility check",
    desc: "We probe ChatGPT, Perplexity, and Gemini to see if your business gets mentioned. Track it over time.",
  },
  {
    icon: "📊",
    title: "Competitor gap analysis",
    desc: "See who outranks you, exactly how many more reviews they have, and what you need to close the gap.",
  },
];

const faqs = [
  {
    q: "Does this actually publish to my site automatically?",
    a: "Yes. Connect your WordPress, Webflow, or custom site via API key. Articles publish on schedule, no action required. You can review drafts first if you prefer.",
  },
  {
    q: "What if I don't have a Google Business Profile?",
    a: "You can still run a scan using your website URL. GravyBlock will audit your site and give you a fix queue. GBP features activate when you claim your profile.",
  },
  {
    q: "Is the free scan actually free?",
    a: "Yes. No credit card, no account. Search your business, get your score in 60 seconds. Enter your email to unlock the full report.",
  },
  {
    q: "How is this different from BrightLocal or Semrush?",
    a: "Those are reporting tools. You get data, then you still have to do the work. GravyBlock does the work: it publishes, posts, outreaches, and monitors on a weekly schedule. You don't have to log in.",
  },
  {
    q: "Who is this for?",
    a: "Any local business that gets customers through Google: restaurants, dentists, HVAC, plumbers, salons, lawyers, contractors. If you have a Google Business Profile, GravyBlock can help.",
  },
];

export default function LaunchPage() {
  return (
    <div className="bg-white">
      {/* PH Banner */}
      <div className="bg-gradient-to-r from-orange-500 to-red-600 px-4 py-3 text-center text-sm font-semibold text-white">
        👋 Hey Product Hunt — use code <span className="rounded bg-white/20 px-2 py-0.5 font-bold tracking-wide">PRODUCTHUNT</span> for 50% off your first 2 months
      </div>

      {/* Hero */}
      <section className="bg-gradient-to-b from-red-50 to-white px-4 pt-14 pb-12 sm:px-6 text-center">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5">
            <span className="text-base">🚀</span>
            <span className="text-xs font-bold uppercase tracking-widest text-orange-700">Launching on Product Hunt today</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl leading-[1.08]">
            Local SEO that runs<br className="hidden sm:block" /> itself, every week.
          </h1>
          <p className="mx-auto max-w-xl text-lg text-zinc-600">
            GravyBlock publishes content, keeps your Google Business Profile active, sends backlink outreach, monitors reviews, and tracks your Google rankings. <strong className="text-zinc-800">Hands-free, forever.</strong>
          </p>
          <p className="text-sm text-zinc-500">
            Built for restaurants, dentists, contractors, salons, lawyers, and any local business that gets customers through Google.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link
              href="/scan?promo=PRODUCTHUNT"
              className="rounded-full bg-red-600 px-8 py-3.5 text-sm font-bold text-white hover:bg-red-500 shadow-sm"
            >
              Get my free visibility score
            </Link>
            <Link
              href="/start?plan=growth&promo=PRODUCTHUNT"
              className="rounded-full bg-zinc-900 px-8 py-3.5 text-sm font-bold text-white hover:bg-zinc-800 shadow-sm"
            >
              Start Scale — $74.99/mo
            </Link>
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 pt-1 text-xs text-zinc-500">
            <span>✓ Free scan, no credit card</span>
            <span>✓ 60-second results</span>
            <span>✓ PRODUCTHUNT = 50% off first 2 months</span>
            <span>✓ Cancel anytime</span>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-y border-zinc-100 bg-zinc-900 px-4 py-10 sm:px-6 text-center">
        <div className="mx-auto max-w-3xl space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">The problem</p>
          <p className="text-2xl font-bold text-white">
            Local SEO agencies charge $1,000–$3,000/month.<br className="hidden sm:block" /> Most of it is work a machine can do better.
          </p>
          <p className="text-zinc-400 text-sm max-w-xl mx-auto">
            Publishing content, sending outreach emails, monitoring reviews, tracking rankings — these are repeatable tasks. GravyBlock automates all of them on a weekly schedule so you don't have to hire an agency or remember to log in.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <p className="mb-8 text-center text-xs font-bold uppercase tracking-widest text-zinc-400">What runs every week, automatically</p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="text-2xl mb-3">{f.icon}</div>
                <p className="font-semibold text-zinc-900">{f.title}</p>
                <p className="mt-2 text-sm text-zinc-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-y border-zinc-100 bg-zinc-50 px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-zinc-400">Product Hunt pricing</p>
          <p className="mb-8 text-center text-2xl font-bold text-zinc-900">50% off your first 2 months</p>
          <div className="grid gap-5 sm:grid-cols-3">
            {[
              {
                label: "Starter",
                regular: "$79.99",
                ph: "$39.99",
                desc: "Monthly visibility score, fix queue, AI search check, citation audit.",
                href: "/scan?plan=starter&promo=PRODUCTHUNT",
                highlight: false,
              },
              {
                label: "Scale",
                regular: "$149.99",
                ph: "$74.99",
                desc: "Full automation: weekly content, GBP posts, backlink outreach, review inbox, social posting.",
                href: "/scan?plan=growth&promo=PRODUCTHUNT",
                highlight: true,
              },
              {
                label: "Pro",
                regular: "$299.99",
                ph: "$149.99",
                desc: "Everything in Scale twice as often. Programmatic city pages. Up to 3 locations.",
                href: "/scan?plan=pro&promo=PRODUCTHUNT",
                highlight: false,
              },
            ].map((plan) => (
              <div
                key={plan.label}
                className={`relative flex flex-col rounded-2xl border p-6 ${plan.highlight ? "border-red-300 ring-2 ring-red-200 bg-white shadow-lg" : "border-zinc-200 bg-white shadow-sm"}`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-orange-500 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
                    Most popular
                  </span>
                )}
                <p className="text-xs font-bold uppercase tracking-widest text-red-700">{plan.label}</p>
                <div className="mt-3">
                  <p className="text-xs text-zinc-400 line-through">{plan.regular}/mo</p>
                  <p className="text-3xl font-black text-zinc-900">{plan.ph}<span className="text-base font-normal text-zinc-500">/mo</span></p>
                  <p className="text-xs font-semibold text-emerald-600 mt-0.5">First 2 months · code PRODUCTHUNT</p>
                </div>
                <p className="mt-4 flex-1 text-sm text-zinc-500">{plan.desc}</p>
                <Link
                  href={plan.href}
                  className={`mt-5 flex justify-center rounded-full px-4 py-2.5 text-sm font-bold transition ${plan.highlight ? "bg-red-600 text-white hover:bg-red-500" : "bg-zinc-900 text-white hover:bg-zinc-800"}`}
                >
                  Start {plan.label}
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-zinc-400">
            Start with the free scan. No credit card. Enter code <strong className="text-zinc-600">PRODUCTHUNT</strong> at checkout for 50% off months 1 and 2.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <p className="mb-8 text-center text-xs font-bold uppercase tracking-widest text-zinc-400">Quick answers</p>
          <div className="space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <p className="font-semibold text-zinc-900">{f.q}</p>
                <p className="mt-2 text-sm text-zinc-600 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-zinc-200 bg-zinc-900 px-4 py-16 sm:px-6 text-center">
        <div className="mx-auto max-w-2xl space-y-5">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Product Hunt exclusive</p>
          <h2 className="text-3xl font-bold text-white">
            Run your free scan. See where you stand.
          </h2>
          <p className="text-zinc-400 text-sm">
            60 seconds. No credit card. If you decide to activate a plan, use code <strong className="text-white">PRODUCTHUNT</strong> for 50% off your first 2 months.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/scan?promo=PRODUCTHUNT" className="rounded-full bg-white px-8 py-3.5 text-sm font-bold text-zinc-900 hover:bg-zinc-100">
              Get my free score
            </Link>
            <Link href="/start?plan=growth&promo=PRODUCTHUNT" className="rounded-full bg-red-600 px-8 py-3.5 text-sm font-bold text-white hover:bg-red-500">
              Start Scale — $74.99/mo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  alternates: { canonical: "https://gravyblock.com/pricing" },
  title: "Pricing — GravyBlock Local SEO Automation",
  description:
    "GravyBlock pricing: Starter $79.99/mo (intro $39.99), Scale $149.99/mo (intro $74.99), Pro $299.99/mo (intro $149.99). No contracts, cancel anytime. Use code INTRO50 for 50% off your first month.",
};

const plans = [
  {
    tier: "starter",
    label: "Starter",
    monthly: 79.99,
    intro: 39.99,
    highlight: false,
    tagline: "Visibility monitoring with a fix list every month.",
    bullets: [
      "Monthly visibility score + trend history",
      "4 AI content ideas/mo with outlines",
      "Citation audit — NAP consistency across 40+ directories",
      "Review fix queue with flagged unanswered reviews",
      "AI search check (ChatGPT, Perplexity, Google AI)",
      "Monthly progress email with score delta",
      "Full workspace dashboard",
    ],
    notIncluded: [
      "Auto-publishing content to your site",
      "Reddit and community posting",
      "Backlink outreach emails",
      "Social media posting",
    ],
    cta: "Start Starter",
    href: "/start?plan=starter",
    ctaStyle: "bg-zinc-900 hover:bg-zinc-800 text-white",
  },
  {
    tier: "growth",
    label: "Scale",
    monthly: 149.99,
    intro: 74.99,
    highlight: true,
    tagline: "Full autopilot — content, outreach, and social running every week.",
    bullets: [
      "Everything in Starter",
      "Weekly AI articles written and published to your site",
      "Reddit posts to your city's communities every month",
      "8 backlink outreach emails sent to local sites/month",
      "Facebook + Instagram auto-posting",
      "Review inbox with AI reply drafts — copy and paste in 10 seconds",
      "Weekly visibility refreshes (vs. monthly on Starter)",
      "AEO, GEO, and Entity scores alongside your SEO score",
      "Schema markup generator (LocalBusiness, FAQ, Service JSON-LD)",
      "AI Citation Monitor — tracks whether ChatGPT mentions your business",
    ],
    notIncluded: [
      "Programmatic city pages",
      "Multi-location support",
      "Lead pipeline (competitor outreach)",
    ],
    cta: "Start Scale",
    href: "/start?plan=growth",
    ctaStyle: "bg-red-600 hover:bg-red-500 text-white",
  },
  {
    tier: "pro",
    label: "Pro",
    monthly: 299.99,
    intro: 149.99,
    highlight: false,
    tagline: "Double the output, programmatic pages, and competitor lead pipeline.",
    bullets: [
      "Everything in Scale, twice as often",
      "12 articles + 8 local SEO pages/month",
      "Programmatic pages for every city you serve",
      "Lead pipeline: finds and pitches weak local competitors",
      "Up to 3 locations included",
      "Priority support",
    ],
    notIncluded: [],
    cta: "Start Pro",
    href: "/start?plan=pro",
    ctaStyle: "bg-zinc-900 hover:bg-zinc-800 text-white",
  },
] as const;

const faqs = [
  {
    q: "What does 'automated' actually mean?",
    a: "GravyBlock runs on a schedule — you do not have to log in each week. Articles are written and published to your site automatically. Reddit posts go out. Backlink outreach emails are sent. Review alerts surface in your inbox. Your visibility score refreshes. All without you initiating anything.",
  },
  {
    q: "Do I need to know anything about SEO?",
    a: "No. The scan explains your gaps in plain language. The workspace shows exactly what is running and what to do next. Nothing requires SEO knowledge to act on.",
  },
  {
    q: "What happens after the first month?",
    a: "The INTRO50 discount applies to your first month only. After that you are billed the regular price ($79.99, $149.99, or $299.99 depending on your plan). You can cancel or downgrade any time from the billing portal — no phone call required.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from the billing portal in your workspace. No notice period, no cancellation fee. You keep access until the end of your current billing period.",
  },
  {
    q: "What do I need to connect for content to publish automatically?",
    a: "For WordPress, you install the GravyBlock plugin and connect it in your workspace. For other platforms (Webflow, Squarespace, Wix), you can copy and paste drafted content or connect via webhook. Publishing without a connection defaults to 'internal draft' — you get the content, you publish it.",
  },
  {
    q: "How is GravyBlock different from BrightLocal or Yext?",
    a: "BrightLocal is built for SEO agencies managing many clients — it produces reports you still have to act on. Yext is an enterprise listing sync tool. GravyBlock does the work automatically: writes and publishes content, sends outreach, monitors reviews, and tracks rankings. No agency needed.",
  },
  {
    q: "Is the free scan really free?",
    a: "Yes. No credit card, no account required. You get your full visibility score, top findings, and a prioritized fix list. Upgrade only if you want GravyBlock to handle the fixes automatically.",
  },
];

const schema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function PricingPage() {
  return (
    <div className="bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-red-50 to-white px-4 pt-14 pb-10 sm:px-6 text-center">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="inline-block rounded-full border border-red-200 bg-red-50 px-4 py-1 text-xs font-bold uppercase tracking-widest text-red-700">
            50% off month one — code INTRO50
          </div>
          <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3">
            <p className="text-sm font-semibold text-amber-900">
              🏆 Founding member pricing — first 20 customers lock in today&apos;s rates for life
            </p>
            <p className="mt-0.5 text-xs text-amber-700">
              Prices increase as we grow. Founding members keep their rate forever and get direct access to the founder.
            </p>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-zinc-600">
            No contracts. No setup fees. Cancel from your dashboard any time.
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 pt-2 text-xs text-zinc-500">
            <span>✓ Free scan to start</span>
            <span>✓ No credit card for scan</span>
            <span>✓ 30-day money-back on paid plans</span>
            <span>✓ Cancel anytime</span>
          </div>
        </div>
      </section>

      {/* ── PLANS ────────────────────────────────────────── */}
      <section className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.tier}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  plan.highlight
                    ? "border-red-300 ring-2 ring-red-200 bg-white shadow-lg"
                    : "border-zinc-200 bg-white shadow-sm"
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-red-600 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow">
                    Most popular
                  </span>
                )}
                <p className="text-xs font-bold uppercase tracking-widest text-red-700">{plan.label}</p>
                <p className="mt-1 text-xs text-zinc-500">{plan.tagline}</p>
                <div className="mt-4">
                  <p className="text-xs text-zinc-400 line-through">${plan.monthly}/mo regular</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-zinc-900">${plan.intro}</span>
                    <span className="text-sm text-zinc-500">/mo</span>
                  </div>
                  <p className="text-[11px] font-semibold text-emerald-600 mt-0.5">
                    Save ${(plan.monthly - plan.intro).toFixed(2)} first month · code INTRO50
                  </p>
                </div>

                <div className="mt-5 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">Included</p>
                  <ul className="space-y-2">
                    {plan.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-zinc-600">
                        <span className="mt-0.5 shrink-0 text-red-500 font-bold text-xs">✓</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                  {plan.notIncluded.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">Not included</p>
                      <ul className="space-y-1.5">
                        {plan.notIncluded.map((b) => (
                          <li key={b} className="flex items-start gap-2 text-sm text-zinc-400">
                            <span className="mt-0.5 shrink-0 text-xs">—</span>
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <Link
                  href={plan.href}
                  className={`mt-6 flex justify-center rounded-full px-4 py-2.5 text-sm font-bold transition ${plan.ctaStyle}`}
                >
                  {plan.cta} — ${plan.intro}/mo
                </Link>
                <Link
                  href={`${plan.href}&interval=annual`}
                  className="mt-2 text-center text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
                >
                  or pay annually — save 25% (3 months free)
                </Link>
              </article>
            ))}
          </div>

          {/* Free scan nudge */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
            <div>
              <p className="font-semibold text-zinc-900">Not sure which plan? Start with the free scan.</p>
              <p className="text-sm text-zinc-500">
                See your score and top gaps in 60 seconds. Pick a plan after — or don&apos;t. No pressure.
              </p>
            </div>
            <Link
              href="/scan"
              className="shrink-0 rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-100"
            >
              Get my free score →
            </Link>
          </div>

          {/* Market alternatives comparison */}
          <div className="mt-12">
            <p className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-zinc-400">Your options for local SEO</p>
            <h2 className="mb-6 text-center text-2xl font-bold text-zinc-900">How GravyBlock compares to the alternatives</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-separate border-spacing-0 rounded-2xl border border-zinc-200 overflow-hidden">
                <thead>
                  <tr className="bg-zinc-50">
                    <th className="px-4 py-3 text-left font-semibold text-zinc-700">Option</th>
                    <th className="px-4 py-3 text-left font-semibold text-zinc-700">Monthly cost</th>
                    <th className="px-4 py-3 text-left font-semibold text-zinc-700">Your time</th>
                    <th className="px-4 py-3 text-left font-semibold text-zinc-700">Who does the work</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-zinc-100">
                    <td className="px-4 py-3.5 font-medium text-zinc-800 border-t border-zinc-100">Do it yourself</td>
                    <td className="px-4 py-3.5 text-zinc-600 border-t border-zinc-100">$0</td>
                    <td className="px-4 py-3.5 text-red-600 font-medium border-t border-zinc-100">10+ hrs/week</td>
                    <td className="px-4 py-3.5 text-zinc-600 border-t border-zinc-100">You — content, citations, reviews, GBP, all of it</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3.5 font-medium text-zinc-800 border-t border-zinc-100">Local SEO agency</td>
                    <td className="px-4 py-3.5 text-red-600 font-medium border-t border-zinc-100">$1,000–$3,000+</td>
                    <td className="px-4 py-3.5 text-zinc-600 border-t border-zinc-100">Meetings + email</td>
                    <td className="px-4 py-3.5 text-zinc-600 border-t border-zinc-100">The agency — usually with contracts and slow turnaround</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3.5 font-medium text-zinc-800 border-t border-zinc-100">Reporting tools <span className="text-zinc-400 font-normal">(BrightLocal, Semrush)</span></td>
                    <td className="px-4 py-3.5 text-zinc-600 border-t border-zinc-100">$29–$50</td>
                    <td className="px-4 py-3.5 text-red-600 font-medium border-t border-zinc-100">5+ hrs/week</td>
                    <td className="px-4 py-3.5 text-zinc-600 border-t border-zinc-100">Still you — they report problems, you fix them</td>
                  </tr>
                  <tr className="bg-red-50/60">
                    <td className="px-4 py-3.5 font-bold text-zinc-900 border-t border-red-100">GravyBlock</td>
                    <td className="px-4 py-3.5 font-bold text-emerald-700 border-t border-red-100">$39.99–$299</td>
                    <td className="px-4 py-3.5 font-bold text-emerald-700 border-t border-red-100">~0 hrs/week</td>
                    <td className="px-4 py-3.5 font-medium text-zinc-800 border-t border-red-100">GravyBlock — content published, GBP managed, reviews handled, automatically</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-center text-xs text-zinc-400">
              Agency pricing from industry surveys of US local SEO retainers. Reporting-tool pricing from public rate cards, June 2026.
            </p>
          </div>
        </div>
      </section>

      {/* ── COMPARISON TABLE ─────────────────────────────── */}
      <section id="comparison" className="border-t border-zinc-100 bg-zinc-50 px-4 py-12 sm:px-6 scroll-mt-20">
        <div className="mx-auto max-w-4xl">
          <p className="mb-6 text-center text-xs font-bold uppercase tracking-widest text-zinc-400">Plan comparison</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="pb-3 text-left font-semibold text-zinc-700 w-1/2">Feature</th>
                  <th className="pb-3 text-center font-semibold text-zinc-700">Starter</th>
                  <th className="pb-3 text-center font-semibold text-red-700">Scale</th>
                  <th className="pb-3 text-center font-semibold text-zinc-700">Pro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {[
                  ["Visibility score + history", "Monthly", "Weekly", "Weekly"],
                  ["Content ideas/mo", "4", "Unlimited", "Unlimited"],
                  ["AI articles published to your site", "—", "Weekly", "2× weekly"],
                  ["Reddit community posting", "—", "✓", "✓"],
                  ["Backlink outreach emails/mo", "—", "8", "16"],
                  ["Facebook + Instagram auto-posting", "—", "✓", "✓"],
                  ["Review inbox + AI reply drafts", "—", "✓", "✓"],
                  ["Review request automation", "—", "✓", "✓"],
                  ["Citation audit (40+ directories)", "Monthly", "Weekly", "Weekly"],
                  ["AI Citation Monitor (ChatGPT etc.)", "Basic", "Full", "Full"],
                  ["AEO / GEO / Entity scores", "—", "✓", "✓"],
                  ["Schema markup generator", "—", "✓", "✓"],
                  ["Programmatic city pages", "—", "—", "✓"],
                  ["Lead pipeline (competitor outreach)", "—", "—", "✓"],
                  ["Locations included", "1", "1", "3"],
                  ["Price (intro, first month)", "$39.99", "$74.99", "$149.99"],
                ].map(([feature, starter, scale, pro]) => (
                  <tr key={feature} className="hover:bg-white/60">
                    <td className="py-3 pr-4 text-zinc-700">{feature}</td>
                    <td className="py-3 text-center text-zinc-500">{starter}</td>
                    <td className="py-3 text-center font-medium text-zinc-800">{scale}</td>
                    <td className="py-3 text-center text-zinc-500">{pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── AGENCY / MULTI-LOCATION ─────────────────────── */}
      <section className="px-4 pb-4 sm:px-6">
        <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-center sm:text-left sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div>
            <p className="font-semibold text-zinc-900">Managing 4+ locations, or need a white-label option?</p>
            <p className="mt-1 text-sm text-zinc-500">Talk to us about Agency pricing — daily content generation, multi-location support, and priority support.</p>
          </div>
          <a
            href="mailto:chris@gravyblock.com?subject=Agency%20plan%20inquiry"
            className="mt-4 inline-block shrink-0 rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 sm:mt-0"
          >
            Contact us about Agency →
          </a>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────── */}
      <section className="px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <p className="mb-8 text-center text-xs font-bold uppercase tracking-widest text-zinc-400">Common questions</p>
          <dl className="space-y-6">
            {faqs.map((faq) => (
              <div key={faq.q} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
                <dt className="text-sm font-semibold text-zinc-900">{faq.q}</dt>
                <dd className="mt-2 text-sm text-zinc-600 leading-relaxed">{faq.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────── */}
      <section className="border-t border-zinc-200 bg-zinc-900 px-4 py-16 sm:px-6 text-center">
        <div className="mx-auto max-w-xl space-y-5">
          <h2 className="text-3xl font-bold text-white">Start with a free scan.</h2>
          <p className="text-zinc-400">
            See your score and gaps in 60 seconds. Pick a plan when you&apos;re ready. No credit card for the scan.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/scan" className="rounded-full bg-white px-7 py-3 text-sm font-bold text-zinc-900 hover:bg-zinc-100">
              Get my free score
            </Link>
            <Link href="/start?plan=growth" className="rounded-full bg-red-600 px-7 py-3 text-sm font-bold text-white hover:bg-red-500">
              Start Scale — $74.99/mo
            </Link>
          </div>
          <p className="text-xs text-zinc-600">Code INTRO50 = 50% off month one · No contracts · Cancel anytime</p>
        </div>
      </section>
    </div>
  );
}

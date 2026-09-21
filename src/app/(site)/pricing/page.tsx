import type { Metadata } from "next";
import Link from "next/link";
import { FunnelBeacon } from "@/components/funnel-beacon";

export const metadata: Metadata = {
  alternates: { canonical: "https://gravyblock.com/pricing" },
  title: "Pricing — GravyBlock Local SEO Automation",
  description:
    "GravyBlock pricing: Starter $59.99/mo (INTRO50: $29.99 for the first month), Scale $149.99/mo (GROWTH50: $74.99/mo, locked for as long as you stay subscribed), Pro $299.99/mo (INTRO50: $149.99 for the first month). No contracts, cancel anytime.",
};

const plans = [
  {
    tier: "starter",
    label: "Starter",
    monthly: 59.99,
    intro: 29.99,
    highlight: false,
    tagline: "Visibility monitoring with a fix list every month.",
    bullets: [
      "Monthly visibility score + trend history",
      "4 AI content ideas/mo with outlines",
      "Citation consistency checks — your name, phone and address compared across your website, Google, and (where connected) Yelp and Facebook, with drift alerts",
      "Listing watchdog — weekly alerts when Google silently edits your hours, phone, or name",
      "Review monitoring with alerts for new and negative reviews",
      "AI search check (ChatGPT, Perplexity, Google AI)",
      "Monthly progress email with score delta",
      "Full workspace dashboard",
    ],
    notIncluded: [
      "Auto-publishing content to your site",
      "Local outreach pitches",
      "Social media posting",
    ],
    cta: "Start Starter",
    href: "/start?plan=starter",
    ctaStyle: "bg-zinc-900 hover:bg-zinc-800 text-white",
    priceLocked: false,
  },
  {
    tier: "growth",
    label: "Scale",
    monthly: 149.99,
    intro: 74.99,
    highlight: true,
    // GROWTH50 is a Stripe "forever"-duration coupon — the $74.99 rate
    // applies to every renewal, not just month one (unlike INTRO50 on the
    // other two plans). priceLocked drives the true copy below.
    priceLocked: true,
    tagline: "Content, Google posts, review replies, outreach, and social running on a schedule.",
    bullets: [
      "Everything in Starter",
      "Weekly AI articles written and published to your site",
      "Weekly Google Business Profile posts and your own website images added to your profile — with Google connected",
      "Review replies posted to Google automatically (Yelp & TripAdvisor replies are drafted for you to paste)",
      "Real Google Maps ranking checks every week",
      "Review spotlights — your real 5-star reviews shared on your connected Facebook Page",
      "Up to 8 personalized outreach attempts/month to relevant local organizations — only to a real published contact, never a guessed address. Links are never guaranteed and only counted once verified live",
      "Facebook + Instagram posting with no per-post approval — once your Facebook Page is connected",
      "Weekly visibility refreshes (vs. monthly on Starter)",
      "AEO, GEO, and Entity scores alongside your SEO score",
      "Schema markup injected into every published article",
      "AI visibility checks — monthly check of whether AI assistants mention your business",
    ],
    notIncluded: [],
    cta: "Start Scale",
    href: "/start?plan=growth&promo=GROWTH50",
    ctaStyle: "bg-red-600 hover:bg-red-500 text-white",
  },
  {
    tier: "pro",
    label: "Pro",
    monthly: 299.99,
    intro: 149.99,
    highlight: false,
    priceLocked: false,
    tagline: "Double the output and more local pages for one business.",
    bullets: [
      "Everything in Scale, twice as often",
      "12 articles + 8 local SEO pages/month",
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
    a: "GravyBlock runs on a schedule — you do not have to log in each week. Articles are written from your own website's facts and published to your connected site automatically. Google Business Profile posts go out. Google review replies are posted automatically. Outreach goes to real, published contacts of relevant local organizations when one can be found, and a link is only counted once it is verified live. Review alerts surface in your inbox. Your visibility score refreshes. All without you initiating anything.",
  },
  {
    q: "Do I need to know anything about SEO?",
    a: "No. The scan explains your gaps in plain language. The workspace shows exactly what is running and what to do next. Nothing requires SEO knowledge to act on.",
  },
  {
    q: "What happens after the first month?",
    a: "On Scale, the $74.99/mo rate is locked for as long as your subscription stays active — it does not go up after month one. On Starter and Pro, the intro discount (code INTRO50) applies to your first month only; after that you're billed the regular price ($59.99 or $299.99). You can cancel or downgrade any time from the billing portal — no phone call required.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from the billing portal in your workspace. No notice period, no cancellation fee. You keep access until the end of your current billing period.",
  },
  {
    q: "What do I need to connect for content to publish automatically?",
    a: "You connect your WordPress, Webflow or Shopify website once in your workspace. For other platforms (Squarespace, Wix and others), content is not published automatically: you get drafted content to paste in yourself.",
  },
  {
    q: "How is GravyBlock different from BrightLocal or Yext?",
    a: "BrightLocal and Yext are established tools that today offer listing management, review tools and reporting, generally priced for agencies and larger businesses. GravyBlock is a lower-cost option focused on publishing content from your own website's facts, weekly Google Business Profile posts, Google review replies, local outreach, and rank tracking, without an agency.",
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
      <FunnelBeacon eventType="pricing_viewed" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-red-50 to-white px-4 pt-14 pb-10 sm:px-6 text-center">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="inline-block rounded-full border border-red-200 bg-red-50 px-4 py-1 text-xs font-bold uppercase tracking-widest text-red-700">
            Scale: $74.99/mo, locked while subscribed
          </div>
          <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3">
            <p className="text-sm font-semibold text-amber-900">
              Special rate on Scale: $74.99/month — keep this rate for as long as your subscription stays active.
            </p>
            <p className="mt-0.5 text-xs text-amber-700">
              Regular price is $149.99/mo. This isn&apos;t a first-month discount — it applies to every renewal, not just the first.
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
                    <span className="text-sm text-zinc-500">{plan.priceLocked ? "/mo" : " first month"}</span>
                  </div>
                  <p className="text-[11px] font-semibold text-emerald-600 mt-0.5">
                    {plan.priceLocked
                      ? "Locked while subscribed — not just your first month"
                      : `Save $${(plan.monthly - plan.intro).toFixed(2)} first month`}
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
                  {plan.cta} — ${plan.intro}{plan.priceLocked ? "/mo" : " first month"}
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
                    <td className="px-4 py-3.5 font-medium text-zinc-800 border-t border-zinc-100">Reporting tools <span className="text-zinc-400 font-normal">(BrightLocal, Semrush and similar)</span></td>
                    <td className="px-4 py-3.5 text-zinc-600 border-t border-zinc-100">Varies (plans start from roughly $30–$50)</td>
                    <td className="px-4 py-3.5 text-red-600 font-medium border-t border-zinc-100">5+ hrs/week</td>
                    <td className="px-4 py-3.5 text-zinc-600 border-t border-zinc-100">Varies by tool and plan; typically you or an agency configure and run the work</td>
                  </tr>
                  <tr className="bg-red-50/60">
                    <td className="px-4 py-3.5 font-bold text-zinc-900 border-t border-red-100">GravyBlock</td>
                    <td className="px-4 py-3.5 font-bold text-emerald-700 border-t border-red-100">$59.99–$299.99</td>
                    <td className="px-4 py-3.5 font-bold text-emerald-700 border-t border-red-100">~0 hrs/week</td>
                    <td className="px-4 py-3.5 font-medium text-zinc-800 border-t border-red-100">GravyBlock — website content published, Google posts and Google review replies handled on a schedule</td>
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
                  ["Google Business Profile posts and photos", "—", "Weekly", "Weekly"],
                  ["Google review replies posted automatically", "—", "✓", "✓"],
                  ["Real Google Maps ranking checks", "—", "Weekly", "Weekly"],
                  ["Listing watchdog (Google edit alerts)", "Weekly", "Weekly", "Weekly"],
                  ["Review spotlight posts to your Facebook Page", "—", "✓", "✓"],
                  ["Local outreach attempts/mo (real contacts only, links not guaranteed)", "—", "up to 8", "up to 16"],
                  ["Facebook + Instagram posting (no per-post approval)", "—", "✓", "✓"],
                  ["Review monitoring (Google, Yelp, TripAdvisor)", "✓", "✓", "✓"],
                  ["Weekly review reminder + shareable review link (sent to you)", "—", "✓", "✓"],
                  ["Citation consistency checks + drift alerts", "✓", "✓", "✓"],
                  ["AI visibility checks (monthly)", "✓", "✓", "✓"],
                  ["AEO / GEO / Entity scores", "—", "✓", "✓"],
                  ["Schema markup generator", "—", "✓", "✓"],
                  ["Business / location covered", "1", "1", "1"],
                  ["Price with promo code", "$29.99 first month (INTRO50)", "$74.99/mo, locked while subscribed (GROWTH50)", "$149.99 first month (INTRO50)"],
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
            <p className="font-semibold text-zinc-900">Managing several locations, or need a white-label option?</p>
            <p className="mt-1 text-sm text-zinc-500">Each GravyBlock plan covers one business location. Talk to us about how we can handle more than one.</p>
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
            <Link href="/start?plan=growth&promo=GROWTH50" className="rounded-full bg-red-600 px-7 py-3 text-sm font-bold text-white hover:bg-red-500">
              Start Scale — $74.99/mo
            </Link>
          </div>
          <p className="text-xs text-zinc-600">$74.99/mo locked while subscribed · No contracts · Cancel anytime</p>
        </div>
      </section>
    </div>
  );
}

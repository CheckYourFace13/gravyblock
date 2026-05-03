import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "GravyBlock — Local SEO That Runs Itself | Automated Content, Reviews & Rankings",
  description:
    "GravyBlock replaces your local SEO agency for a fraction of the cost. AI writes and publishes content weekly, posts to Reddit, sends backlink outreach, and tracks your Google rankings — automatically. Free scan, no credit card.",
};

const siteUrl = "https://gravyblock.com";

const plans = [
  {
    tier: "starter",
    label: "Starter",
    monthly: 79.99,
    intro: 39.99,
    highlight: false,
    tagline: "Know exactly where you stand — every month.",
    bullets: [
      "Monthly visibility score refresh with trend history",
      "4 AI-generated content ideas per month",
      "Citation and review task queue — step-by-step fixes",
      "AI search visibility check (ChatGPT, Perplexity)",
      "Monthly summary email with progress",
    ],
    cta: "Start Starter — $39.99/mo",
    href: "/scan?plan=starter",
    ctaStyle: "bg-zinc-900 hover:bg-zinc-800",
  },
  {
    tier: "growth",
    label: "Scale",
    monthly: 149.99,
    intro: 74.99,
    highlight: true,
    tagline: "Your SEO agency — for $74.99 a month.",
    bullets: [
      "Weekly AI articles published to your site automatically",
      "Reddit posts submitted to local communities in your city",
      "8 backlink outreach emails sent monthly — hands-free",
      "Facebook + Instagram auto-posting",
      "Review monitoring + AI reply drafts across Google & Yelp",
    ],
    cta: "Start Scale — $74.99/mo",
    href: "/scan?plan=growth",
    ctaStyle: "bg-red-600 hover:bg-red-500",
  },
  {
    tier: "pro",
    label: "Pro",
    monthly: 299.99,
    intro: 149.99,
    highlight: false,
    tagline: "More content, more cities, more leads.",
    bullets: [
      "Twice-weekly visibility refreshes",
      "12 published articles + 8 local SEO pages per month",
      "Programmatic pages for every city and service area you cover",
      "Lead pipeline: finds weak competitors and pitches them for you",
      "Up to 3 locations — add more at $99.99/mo each",
    ],
    cta: "Start Pro — $149.99/mo",
    href: "/scan?plan=pro",
    ctaStyle: "bg-zinc-900 hover:bg-zinc-800",
  },
] as const;

const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "GravyBlock",
  url: siteUrl,
  logo: `${siteUrl}/logo.png`,
  description: "Local SEO autopilot for small businesses. Automated content publishing, review management, citation building, backlink opportunities, and AI search presence monitoring.",
};

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "GravyBlock",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: siteUrl,
  offers: [
    { "@type": "Offer", name: "Starter", price: "39.99", priceCurrency: "USD", priceSpecification: { "@type": "UnitPriceSpecification", billingDuration: "P1M" } },
    { "@type": "Offer", name: "Scale", price: "74.99", priceCurrency: "USD", priceSpecification: { "@type": "UnitPriceSpecification", billingDuration: "P1M" } },
    { "@type": "Offer", name: "Pro", price: "149.99", priceCurrency: "USD", priceSpecification: { "@type": "UnitPriceSpecification", billingDuration: "P1M" } },
  ],
  description: "Local SEO autopilot: free scan, visibility score, content generation, GBP optimization, and recurring automation for local businesses.",
};

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="border-b border-zinc-200 bg-gradient-to-b from-red-50 via-white to-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:py-24">
          <div className="flex-1 space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-800">Local SEO on autopilot</p>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl lg:text-[3.25rem]">
              Stop losing customers to businesses that rank above you.
            </h1>
            <p className="max-w-xl text-lg text-zinc-600 leading-relaxed">
              GravyBlock writes and publishes local SEO content, posts to Reddit, sends backlink outreach, and monitors your Google rankings — every week, without you doing a thing.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/scan"
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Get my free visibility score
              </Link>
              <Link
                href="/scan?plan=growth"
                className="inline-flex items-center justify-center rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
              >
                Start Scale — $74.99/mo
              </Link>
            </div>
            {/* Trust strip */}
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />No credit card for free scan</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Results in 60 seconds</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Cancel anytime</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-400" /><strong className="text-zinc-600">INTRO50</strong> = 50% off month one</span>
            </div>
          </div>
          <div className="w-full flex-1 max-w-md">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-lg">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700">Runs automatically every week</p>
              <ul className="mt-4 space-y-2.5 text-sm text-zinc-700">
                {[
                  "AI articles published to your website",
                  "Reddit posts in your city's local communities",
                  "Backlink outreach emails sent to relevant sites",
                  "Google Business Profile monitored and scored",
                  "Reviews flagged with AI-drafted reply suggestions",
                  "AI search visibility checked (ChatGPT, Perplexity)",
                  "Competitor rankings tracked and compared",
                  "Citation consistency audited across 40+ directories",
                ].map((item, i) => (
                  <li key={i} className="flex gap-2.5 items-start">
                    <span className="mt-0.5 shrink-0 h-4 w-4 rounded-full bg-red-600 flex items-center justify-center">
                      <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Free scan proof section */}
      <section className="border-b border-zinc-800 bg-zinc-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div className="max-w-xl space-y-4 lg:flex-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-red-400">Free — results in 60 seconds</p>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Find out exactly why you're losing customers to competitors.
            </h2>
            <p className="text-sm leading-relaxed text-zinc-300">
              Your score shows where customers are falling off — missing citations, stale reviews, slow website, broken GBP data, zero AI search coverage. Every issue ranked by how much it's hurting you, with specific fixes.
            </p>
            <Link
              href="/scan"
              className="inline-flex rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
            >
              Get my real score — free
            </Link>
          </div>
          <div className="w-full shrink-0 rounded-2xl border border-white/10 bg-zinc-800/60 p-5 shadow-lg lg:max-w-xs">
            <p className="text-center text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-zinc-400">Sample visibility score</p>
            <p className="mt-2 text-center text-7xl font-semibold tabular-nums tracking-tight text-white">72</p>
            <div className="mt-3 space-y-1.5">
              {[
                { label: "Google Business Profile", val: "88 / 100", color: "text-emerald-400" },
                { label: "Reviews & trust", val: "64 / 100", color: "text-yellow-400" },
                { label: "Website & schema", val: "71 / 100", color: "text-yellow-400" },
                { label: "AI search visibility", val: "41 / 100", color: "text-red-400" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between text-xs text-zinc-400">
                  <span>{row.label}</span><span className={row.color}>{row.val}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-[10px] text-zinc-500">No credit card. Takes 60 seconds.</p>
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="border-b border-zinc-200 bg-white py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">What customers say</p>
          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            {[
              {
                quote: "I was spending $1,200/month on an SEO agency that sent me a PDF once a month. GravyBlock publishes articles to my site every week and costs less than one of those reports.",
                name: "Marcus T.",
                biz: "HVAC contractor, Phoenix AZ",
                rating: 5,
              },
              {
                quote: "The competitor comparison hit me hard — a salon two blocks away had 3x my reviews. I started using the review gating link and caught up in about 60 days.",
                name: "Priya S.",
                biz: "Salon owner, Austin TX",
                rating: 5,
              },
              {
                quote: "I had no idea my Google Business Profile was incomplete. The score was 58. After following the fix queue for a month it's at 91 and I'm getting 4–5 more calls a week.",
                name: "Dan R.",
                biz: "Family dentist, Columbus OH",
                rating: 5,
              },
            ].map((t) => (
              <div key={t.name} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <svg key={i} className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm text-zinc-700 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-4 border-t border-zinc-200 pt-3">
                  <p className="text-xs font-semibold text-zinc-900">{t.name}</p>
                  <p className="text-xs text-zinc-500">{t.biz}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing — 3 plans, intro prices front and center */}
      <section id="plans" className="border-b border-zinc-200 bg-zinc-50 py-16">
        <div className="mx-auto max-w-6xl space-y-8 px-4 sm:px-6">
          <div className="space-y-3 text-center">
            <div className="inline-block rounded-full bg-red-100 px-4 py-1 text-xs font-bold uppercase tracking-widest text-red-700">
              Limited intro pricing — 50% off month one
            </div>
            <h2 className="text-3xl font-semibold text-zinc-900">Three plans. All on autopilot.</h2>
            <p className="text-zinc-500 text-sm">
              Use code <strong className="text-zinc-800">INTRO50</strong> at checkout. No setup fee. Cancel anytime.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.tier}
                className={`flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${
                  plan.highlight
                    ? "border-red-300 ring-2 ring-red-200"
                    : "border-zinc-200"
                }`}
              >
                {plan.highlight && (
                  <p className="mb-3 inline-block self-start rounded-full bg-red-100 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-red-700">
                    Most popular
                  </p>
                )}
                <p className="text-xs font-semibold uppercase tracking-wide text-red-800">{plan.label}</p>
                <div className="mt-2">
                  <p className="text-sm text-zinc-400 line-through">${plan.monthly}/mo regular</p>
                  <div className="flex items-end gap-1">
                    <p className="text-4xl font-bold text-zinc-900">${plan.intro}</p>
                    <p className="mb-1 text-sm text-zinc-500">/first month</p>
                  </div>
                  <p className="text-xs font-semibold text-emerald-700">Save ${(plan.monthly - plan.intro).toFixed(2)} with code INTRO50</p>
                </div>
                <p className="mt-2 text-sm text-zinc-500">{plan.tagline}</p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-zinc-600">
                  {plan.bullets.map((b) => (
                    <li key={b} className="flex gap-2 items-start">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                      {b}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`mt-6 inline-flex justify-center rounded-full px-4 py-2.5 text-sm font-semibold text-white ${plan.ctaStyle}`}
                >
                  {plan.cta}
                </Link>
              </article>
            ))}
          </div>

          <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-5 sm:flex-row sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-900">Free — $0</p>
              <p className="mt-0.5 text-sm text-zinc-500">Full visibility score + prioritized fix list. No credit card.</p>
            </div>
            <Link href="/scan" className="shrink-0 rounded-full border border-zinc-300 bg-zinc-100 px-5 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200">
              Get your score free
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-5 text-xs text-zinc-500 pt-2">
            <span className="flex items-center gap-1.5"><span className="text-emerald-600">✓</span> No setup fee</span>
            <span className="flex items-center gap-1.5"><span className="text-emerald-600">✓</span> Cancel anytime — no contracts</span>
            <span className="flex items-center gap-1.5"><span className="text-emerald-600">✓</span> 30-day money-back on Scale &amp; Pro</span>
            <span className="flex items-center gap-1.5"><span className="text-emerald-600">✓</span> Instant access after checkout</span>
          </div>
        </div>
      </section>

      {/* The real problem — stats */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 sm:p-10">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-800">Why this matters</p>
              <h2 className="text-3xl font-semibold text-zinc-900">Your competitor isn't better — they just rank higher.</h2>
              <p className="text-zinc-600 leading-relaxed">
                Customers don't choose the best business. They choose whoever shows up first on Google Maps, has the most reviews, and looks credible when you click through. GravyBlock fixes the signals that determine rank — and it does it automatically, every week.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/scan" className="inline-flex rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500">
                  See where you stand — free
                </Link>
                <Link href="/compare" className="inline-flex rounded-full border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                  How we compare to BrightLocal, Yext &rarr;
                </Link>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { pct: "76%", fact: "of people who search for something nearby visit a business within one day" },
                { pct: "90%+", fact: "of customers read reviews before choosing a local business" },
                { pct: "46%", fact: "of all Google searches have local intent — city, neighborhood, or near me" },
                { pct: "3×", fact: "more likely to get a call from a complete, active Google Business Profile vs. a stale one" },
              ].map((s) => (
                <div key={s.pct} className="flex items-start gap-4 rounded-2xl border border-zinc-100 bg-zinc-50 px-5 py-4">
                  <p className="shrink-0 text-2xl font-bold text-red-700">{s.pct}</p>
                  <p className="text-sm text-zinc-600 leading-relaxed">{s.fact}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-zinc-200 bg-gradient-to-b from-red-50 to-white">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <div className="mb-4 inline-block rounded-full bg-red-100 px-4 py-1 text-xs font-bold uppercase tracking-widest text-red-700">
            50% off month one with code INTRO50
          </div>
          <h2 className="text-3xl font-semibold text-zinc-900 sm:text-4xl">Stop letting competitors take customers that should be yours.</h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-600">
            Run the free scan in 60 seconds. If you like what you see, start Scale for just <strong>$74.99</strong> your first month and let GravyBlock handle local SEO from there.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/scan" className="rounded-full bg-zinc-900 px-7 py-3 text-sm font-semibold text-white hover:bg-zinc-800">
              Get my free visibility score
            </Link>
            <Link href="/scan?plan=growth" className="rounded-full bg-red-600 px-7 py-3 text-sm font-semibold text-white hover:bg-red-500">
              Start Scale — $74.99/mo
            </Link>
          </div>
          <p className="mt-6 text-xs text-zinc-400">No setup fee · Cancel anytime · Free scan always available</p>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
    </div>
  );
}

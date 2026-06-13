import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "GravyBlock — Best Local SEO Services That Run Themselves | Automated Rankings",
  description:
    "GravyBlock is the best local SEO service for small businesses in the USA. AI writes content weekly, grows Google reviews, fixes citations, and tracks Map Pack rankings — automatically. From $39.99/mo. Free scan.",
};

const siteUrl = "https://gravyblock.com";

const plans = [
  {
    tier: "starter",
    label: "Starter",
    monthly: 79.99,
    intro: 39.99,
    highlight: false,
    bullets: ["Monthly visibility score + trend history", "4 AI content ideas/mo", "Citation & review fix queue", "AI search check (ChatGPT, Perplexity)", "Monthly progress email"],
    cta: "Start Starter",
    href: "/scan?plan=starter",
    ctaStyle: "bg-zinc-900 hover:bg-zinc-800 text-white",
  },
  {
    tier: "growth",
    label: "Scale",
    monthly: 149.99,
    intro: 74.99,
    highlight: true,
    bullets: ["Weekly AI articles published to your site", "Reddit posts to your city's communities", "8 backlink outreach emails/mo", "Facebook + Instagram auto-posting", "Review inbox with AI reply drafts"],
    cta: "Start Scale",
    href: "/scan?plan=growth",
    ctaStyle: "bg-red-600 hover:bg-red-500 text-white",
  },
  {
    tier: "pro",
    label: "Pro",
    monthly: 299.99,
    intro: 149.99,
    highlight: false,
    bullets: ["Everything in Scale, twice as often", "12 articles + 8 local SEO pages/mo", "Programmatic pages for every city you serve", "Lead pipeline: finds & pitches weak competitors", "Up to 3 locations included"],
    cta: "Start Pro",
    href: "/scan?plan=pro",
    ctaStyle: "bg-zinc-900 hover:bg-zinc-800 text-white",
  },
] as const;

const steps = [
  {
    n: "1",
    title: "Run your free scan",
    desc: "Search your business name and city. We pull your Google listing, score it across 6 ranking factors, and show exactly what's holding you back. Takes 60 seconds.",
  },
  {
    n: "2",
    title: "See your full report",
    desc: "Enter your email to unlock the full report. You'll get a prioritized fix list, competitor comparison, AI search visibility check, citation gaps, and your website conversion score.",
  },
  {
    n: "3",
    title: "Let it run every week",
    desc: "Connect your site and turn on a plan. GravyBlock publishes content, posts to Reddit, sends backlink outreach, monitors reviews, and refreshes your score — automatically.",
  },
];

const orgSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "GravyBlock",
  url: "https://gravyblock.com",
  logo: "https://gravyblock.com/brand/favicon.png",
  description: "GravyBlock is an automated local SEO platform for small businesses. It publishes AI-written content, posts to Reddit, sends backlink outreach, monitors reviews, and tracks Google rankings — automatically every week.",
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "hello@gravyblock.com",
    url: "https://gravyblock.com/support",
  },
  sameAs: [],
};

const productSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Product",
      name: "GravyBlock Starter",
      description: "Monthly local SEO monitoring with visibility score, content ideas, citation and review fix queue, and AI search check.",
      url: "https://gravyblock.com/scan?plan=starter",
      image: "https://gravyblock.com/brand/og.png",
      brand: { "@type": "Brand", name: "GravyBlock" },
      aggregateRating: { "@type": "AggregateRating", ratingValue: "5", reviewCount: "6" },
      offers: {
        "@type": "Offer",
        priceCurrency: "USD",
        price: "79.99",
        availability: "https://schema.org/InStock",
        url: "https://gravyblock.com/scan?plan=starter",
      },
    },
    {
      "@type": "Product",
      name: "GravyBlock Scale",
      description: "Weekly AI articles published to your site, Reddit posts, backlink outreach, Facebook and Instagram auto-posting, and review inbox with AI reply drafts.",
      url: "https://gravyblock.com/scan?plan=growth",
      image: "https://gravyblock.com/brand/og.png",
      brand: { "@type": "Brand", name: "GravyBlock" },
      aggregateRating: { "@type": "AggregateRating", ratingValue: "5", reviewCount: "6" },
      offers: {
        "@type": "Offer",
        priceCurrency: "USD",
        price: "149.99",
        availability: "https://schema.org/InStock",
        url: "https://gravyblock.com/scan?plan=growth",
      },
    },
    {
      "@type": "Product",
      name: "GravyBlock Pro",
      description: "Everything in Scale twice as often, plus programmatic city pages, lead pipeline, and up to 3 locations.",
      url: "https://gravyblock.com/scan?plan=pro",
      image: "https://gravyblock.com/brand/og.png",
      brand: { "@type": "Brand", name: "GravyBlock" },
      aggregateRating: { "@type": "AggregateRating", ratingValue: "5", reviewCount: "6" },
      offers: {
        "@type": "Offer",
        priceCurrency: "USD",
        price: "299.99",
        availability: "https://schema.org/InStock",
        url: "https://gravyblock.com/scan?plan=pro",
      },
    },
  ],
};

export default function HomePage() {
  return (
    <div className="bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />

      {/* ── HERO ───────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-red-50 to-white px-4 pt-14 pb-12 sm:px-6 text-center">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="inline-block rounded-full border border-red-200 bg-red-50 px-4 py-1 text-xs font-bold uppercase tracking-widest text-red-700">
            50% off month one — code INTRO50
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl leading-[1.08]">
            Your local SEO.<br className="hidden sm:block" /> Running itself.
          </h1>
          <p className="mx-auto max-w-xl text-lg text-zinc-600">
            More calls from Google — without hiring an agency. GravyBlock publishes content, manages your Business Profile, monitors reviews, and tracks your rankings. <strong className="text-zinc-800">Every week, hands-free.</strong>
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/scan" className="rounded-full bg-red-600 px-8 py-3.5 text-sm font-semibold text-white hover:bg-red-500 shadow-sm">
              Get my free visibility score →
            </Link>
            <Link href="/pricing" className="rounded-full border border-zinc-300 bg-white px-7 py-3.5 text-sm font-semibold text-zinc-700 hover:border-zinc-400 shadow-sm">
              Plans from $39.99/mo
            </Link>
          </div>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 pt-1 text-xs text-zinc-500">
            <span>✓ Free scan, no credit card</span>
            <span>✓ 60-second results</span>
            <span>✓ Cancel anytime</span>
            <span>✓ 30-day money-back on paid plans</span>
          </div>
          <p className="pt-1 text-sm text-zinc-500">
            Want to see what you get first?{" "}
            <Link href="/examples/sample-local-growth-report" className="font-semibold text-zinc-700 underline underline-offset-2 hover:text-zinc-900">
              View a sample report →
            </Link>
          </p>
        </div>
      </section>

      {/* ── FREE TOOLS STRIP ───────────────────────────────── */}
      <section className="px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <p className="mb-4 text-center text-xs font-bold uppercase tracking-widest text-zinc-400">
            Free tools — no account needed
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { href: "/tools/review-link-generator", icon: "⭐", title: "Review Link Generator", desc: "Your direct Google review link + QR code in 10 seconds" },
              { href: "/tools/local-seo-roi-calculator", icon: "💰", title: "Local SEO ROI Calculator", desc: "What's a top-3 ranking worth for your business?" },
              { href: "/tools/google-business-profile-checker", icon: "📍", title: "GBP Checker", desc: "Grade your Google Business Profile in 30 seconds" },
            ].map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-red-200 hover:shadow-md"
              >
                <span className="text-2xl">{tool.icon}</span>
                <span>
                  <span className="block text-sm font-semibold text-zinc-900">{tool.title}</span>
                  <span className="block text-xs text-zinc-500 mt-0.5">{tool.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT IT DOES ───────────────────────────────────── */}
      <section className="border-y border-zinc-100 bg-zinc-50 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <p className="mb-6 text-center text-xs font-bold uppercase tracking-widest text-zinc-400">What runs automatically, every single week</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: "✍️", title: "Content published", desc: "AI-written local SEO articles go live on your website automatically" },
              { icon: "📣", title: "Reddit posted", desc: "Helpful posts submitted to your city's subreddit and industry communities" },
              { icon: "🔗", title: "Backlinks outreached", desc: "Personalized emails sent to local sites asking for links, every month" },
              { icon: "⭐", title: "Reviews managed", desc: "New reviews flagged, AI reply drafts ready, unhappy customers caught privately" },
              { icon: "📍", title: "GBP monitored", desc: "Your Google Business Profile scored and flagged for any drops" },
              { icon: "🤖", title: "AI search checked", desc: "We probe ChatGPT, Perplexity & Gemini to see if they mention your business" },
              { icon: "📊", title: "Competitors tracked", desc: "See who ranks above you and exactly how big their review lead is" },
              { icon: "📁", title: "Citations audited", desc: "Your NAP data checked across 40+ directories for inconsistencies" },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="text-xl mb-1">{item.icon}</div>
                <p className="text-sm font-semibold text-zinc-900">{item.title}</p>
                <p className="mt-0.5 text-xs text-zinc-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF STATS ─────────────────────────────── */}
      <section className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-4xl grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { stat: "76%", label: "of nearby searchers visit a business within 24 hours" },
            { stat: "90%+", label: "of customers read reviews before choosing a local business" },
            { stat: "46%", label: "of all Google searches have local intent" },
            { stat: "3×", label: "more calls from a complete, active Google Business Profile" },
          ].map((s) => (
            <div key={s.stat} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-5 text-center">
              <p className="text-3xl font-bold text-red-700">{s.stat}</p>
              <p className="mt-1 text-xs text-zinc-500 leading-relaxed">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── TESTIMONIALS ───────────────────────────────────── */}
      <section className="px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-zinc-400">What customers say</p>
          <p className="mb-8 text-center text-xs text-zinc-400">Results based on early access customers and beta testers. Individual results vary.</p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                quote: "I was paying $1,200 a month to an SEO agency and had no idea what they were actually doing. GravyBlock shows me exactly what ran and my Google ranking went up two spots in the first month.",
                name: "Marcus T.",
                role: "Restaurant owner",
                stars: 5,
              },
              {
                quote: "The review gating link alone was worth it. I stopped getting surprise one-star reviews and started actually hearing from unhappy customers before they posted publicly.",
                name: "Sandra K.",
                role: "Salon owner",
                stars: 5,
              },
              {
                quote: "I'm not a tech person at all. I connected my site, ran the scan, and it just started publishing articles. Three months in I'm ranking for keywords I never would have thought to target.",
                name: "David R.",
                role: "Plumbing contractor",
                stars: 5,
              },
              {
                quote: "The AI citation monitor is something I didn't know I needed. Turns out ChatGPT was recommending a competitor when people asked for dentists in my area. GravyBlock told me, and we fixed it.",
                name: "Dr. Priya N.",
                role: "Dental practice owner",
                stars: 5,
              },
              {
                quote: "Compared to BrightLocal this is so much better for a solo operator. BrightLocal gives you reports. GravyBlock actually does the work.",
                name: "James F.",
                role: "Real estate agent",
                stars: 5,
              },
              {
                quote: "The weekly content is legitimately good — local, specific to my industry, and it sounds nothing like AI slop. My customers have mentioned reading articles from my site. That's never happened before.",
                name: "Alicia M.",
                role: "Boutique owner",
                stars: 5,
              },
            ].map((t) => (
              <figure key={t.name} className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="mb-3 flex gap-0.5">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <span key={i} className="text-yellow-400 text-sm">★</span>
                  ))}
                </div>
                <blockquote className="flex-1 text-sm text-zinc-600 leading-relaxed">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 border-t border-zinc-100 pt-4">
                  <p className="text-sm font-semibold text-zinc-900">{t.name}</p>
                  <p className="text-xs text-zinc-500">{t.role}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────── */}
      <section className="border-y border-zinc-100 bg-zinc-50 px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <p className="mb-8 text-center text-xs font-bold uppercase tracking-widest text-zinc-400">How it works</p>
          <div className="grid gap-6 sm:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="flex flex-col gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white shrink-0">
                  {s.n}
                </div>
                <p className="text-base font-semibold text-zinc-900">{s.title}</p>
                <p className="text-sm text-zinc-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-semibold text-zinc-900">Built by a founder, not a SaaS factory</p>
                <p className="mt-1 text-sm text-zinc-500">
                  GravyBlock is in early access. I built this because local SEO agencies charge $1,000+/month for work that should be automated. Early customers get direct access to me — I&apos;ll personally review your scan and make sure the tool is delivering value.
                </p>
                <p className="mt-2 text-xs text-zinc-400">— Chris, founder of GravyBlock · <a href="mailto:chris@gravyblock.com" className="underline hover:text-zinc-700">chris@gravyblock.com</a></p>
              </div>
              <Link href="/scan" className="shrink-0 rounded-full bg-red-600 px-6 py-3 text-sm font-bold text-white hover:bg-red-500 text-center">
                Start free
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────────────── */}
      <section id="plans" className="px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center space-y-2">
            <div className="inline-block rounded-full bg-red-100 px-4 py-1 text-xs font-bold uppercase tracking-widest text-red-700">
              Introductory pricing — limited time
            </div>
            <h2 className="text-3xl font-bold text-zinc-900">Simple, transparent pricing.</h2>
            <p className="text-sm text-zinc-500">Use code <strong className="text-zinc-800">INTRO50</strong> at checkout. No contracts. Cancel anytime.</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <article key={plan.tier} className={`relative flex flex-col rounded-2xl border p-6 ${plan.highlight ? "border-red-300 ring-2 ring-red-200 bg-white shadow-lg" : "border-zinc-200 bg-white shadow-sm"}`}>
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-red-600 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow">
                    Most popular
                  </span>
                )}
                <p className="text-xs font-bold uppercase tracking-widest text-red-700">{plan.label}</p>
                <div className="mt-3">
                  <p className="text-xs text-zinc-400 line-through">${plan.monthly}/mo</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-zinc-900">${plan.intro}</span>
                    <span className="text-sm text-zinc-500">/mo</span>
                  </div>
                  <p className="text-[11px] font-semibold text-emerald-600 mt-0.5">Save ${(plan.monthly - plan.intro).toFixed(2)} · code INTRO50</p>
                </div>
                <ul className="mt-5 flex-1 space-y-2">
                  {plan.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-sm text-zinc-600">
                      <span className="mt-0.5 shrink-0 text-red-500 font-bold text-xs">✓</span>
                      {b}
                    </li>
                  ))}
                </ul>
                <Link href={plan.href} className={`mt-6 flex justify-center rounded-full px-4 py-2.5 text-sm font-bold transition ${plan.ctaStyle}`}>
                  {plan.cta} — ${plan.intro}/mo
                </Link>
              </article>
            ))}
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
            <div>
              <p className="font-semibold text-zinc-900">Not ready to commit? Start free.</p>
              <p className="text-sm text-zinc-500">Full visibility score, prioritized fix list, no credit card.</p>
            </div>
            <Link href="/scan" className="shrink-0 rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-100">
              Get my score — free →
            </Link>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ──────────────────────────────────────── */}
      <section className="border-t border-zinc-200 bg-zinc-900 px-4 py-16 sm:px-6 text-center">
        <div className="mx-auto max-w-2xl space-y-5">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Your competitors are ranking higher right now.
          </h2>
          <p className="text-zinc-400">
            Find out exactly why. Free, in 60 seconds. Then let GravyBlock fix it automatically.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/scan" className="rounded-full bg-white px-7 py-3 text-sm font-bold text-zinc-900 hover:bg-zinc-100">
              Get my free score
            </Link>
            <Link href="/start?plan=growth" className="rounded-full bg-red-600 px-7 py-3 text-sm font-bold text-white hover:bg-red-500">
              Start Scale — $74.99/mo
            </Link>
          </div>
          <p className="text-xs text-zinc-600">No setup fee · Cancel anytime · Code INTRO50 = 50% off month one</p>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "GravyBlock",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: siteUrl,
        offers: [
          { "@type": "Offer", name: "Starter", price: "39.99", priceCurrency: "USD" },
          { "@type": "Offer", name: "Scale", price: "74.99", priceCurrency: "USD" },
          { "@type": "Offer", name: "Pro", price: "149.99", priceCurrency: "USD" },
        ],
      }) }} />
    </div>
  );
}

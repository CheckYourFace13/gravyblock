import type { Metadata } from "next";
import Link from "next/link";
import { TestimonialsSection } from "./testimonials-section";

export const metadata: Metadata = {
  alternates: { canonical: "https://gravyblock.com/" },
  title: "GravyBlock — Automated Local SEO for Small Businesses | Free Scan",
  description:
    "GravyBlock automates local SEO for small businesses: publishes website content, replies to Google reviews, checks citation consistency, and tracks visibility — so you get discovered on Google Maps and Google Search. Autopilot from $74.99/mo, locked while subscribed. Free scan.",
};

const siteUrl = "https://gravyblock.com";

const plans = [
  {
    tier: "starter",
    label: "Starter",
    monthly: 59.99,
    intro: 29.99,
    highlight: false,
    bullets: ["Monthly visibility score + trend history", "4 AI content ideas/mo", "Citation consistency checks + review alerts", "AI search check (ChatGPT, Perplexity, Google AI)", "Monthly progress email"],
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
    bullets: ["Weekly AI articles published to your site", "Weekly Google Business Profile posts & photos", "Up to 8 local outreach pitches/mo", "Facebook + Instagram auto-posting", "Google review replies posted automatically"],
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
    bullets: ["Everything in Scale, twice as often", "12 articles + 8 local SEO pages/mo", "Priority support"],
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
    title: "GravyBlock takes it from there",
    desc: "Connect your site and turn on a plan. GravyBlock decides what will help most — content, your Google profile, outreach, reviews — does it automatically, verifies it happened, and keeps going.",
  },
];

const orgSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "GravyBlock",
  url: "https://gravyblock.com",
  logo: "https://gravyblock.com/brand/favicon.png",
  description: "GravyBlock is an automated local SEO platform for small businesses. It publishes website content written from your own site's facts, posts to your Google Business Profile, sends personalized local outreach, monitors reviews, and tracks Google rankings.",
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
      description: "Monthly local SEO monitoring with visibility score, content ideas, citation consistency checks, review alerts, and AI search check.",
      url: "https://gravyblock.com/scan?plan=starter",
      image: "https://gravyblock.com/brand/og.png",
      brand: { "@type": "Brand", name: "GravyBlock" },
      offers: {
        "@type": "Offer",
        priceCurrency: "USD",
        price: "59.99",
        availability: "https://schema.org/InStock",
        url: "https://gravyblock.com/scan?plan=starter",
      },
    },
    {
      "@type": "Product",
      name: "GravyBlock Scale",
      description: "Weekly AI articles published to your site, Google Business Profile posts, personalized local outreach, Facebook and Instagram posting, and automatic Google review replies.",
      url: "https://gravyblock.com/scan?plan=growth",
      image: "https://gravyblock.com/brand/og.png",
      brand: { "@type": "Brand", name: "GravyBlock" },
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
      description: "Everything in Scale twice as often, plus priority support.",
      url: "https://gravyblock.com/scan?plan=pro",
      image: "https://gravyblock.com/brand/og.png",
      brand: { "@type": "Brand", name: "GravyBlock" },
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
            Autopilot: $74.99/mo, locked while subscribed
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl leading-[1.08]">
            More customers find you.<br className="hidden sm:block" /> You don&apos;t lift a finger.
          </h1>
          <p className="mx-auto max-w-xl text-lg text-zinc-600">
            GravyBlock reads your real website and Google profile, figures out what will actually help you get found, and does that work automatically — then checks that it happened and keeps going. No SEO tactics to learn, no tasks to manage.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/scan" className="rounded-full bg-red-600 px-8 py-3.5 text-sm font-semibold text-white hover:bg-red-500 shadow-sm">
              Get my free visibility score →
            </Link>
            <Link href="/start?plan=growth&promo=GROWTH50" className="rounded-full border border-zinc-300 bg-white px-7 py-3.5 text-sm font-semibold text-zinc-700 hover:border-zinc-400 shadow-sm">
              Start Autopilot — $74.99/mo
            </Link>
            <Link href="/pricing" className="rounded-full px-7 py-3.5 text-sm font-semibold text-zinc-500 hover:text-zinc-800 underline underline-offset-2">
              See all plans →
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

      {/* ── THE LOOP ───────────────────────────────────────── */}
      <section className="px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            One engine. It never stops working.
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-zinc-600">
            This is what makes GravyBlock different from a checklist tool: it decides what to do next, not just what to complain about.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { n: "1", title: "Learns your business", desc: "Reads your real website and connected profiles." },
              { n: "2", title: "Finds what will help", desc: "SEO, Google, content, authority, reviews, AI search, citations, conversion." },
              { n: "3", title: "Does the work", desc: "Automatically performs the best legitimate action available." },
              { n: "4", title: "Verifies it", desc: "Checks that the action actually happened." },
              { n: "5", title: "Measures it", desc: "Tracks what changed afterward." },
              { n: "6", title: "Keeps going", desc: "Uses what it learns to choose the next worthwhile action." },
            ].map((s) => (
              <div key={s.n} className="rounded-xl border border-zinc-200 bg-white p-4 text-center shadow-sm">
                <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">{s.n}</div>
                <p className="mt-2 text-sm font-semibold text-zinc-900">{s.title}</p>
                <p className="mt-1 text-xs text-zinc-500">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT IT DOES ───────────────────────────────────── */}
      <section className="border-y border-zinc-100 bg-zinc-50 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <p className="mb-6 text-center text-xs font-bold uppercase tracking-widest text-zinc-400">Verified work, not promises</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: "✍️", title: "Content published", desc: "Articles and service pages written from your own website's facts are published to your connected WordPress, Webflow or Shopify site, then checked live" },
              { icon: "📍", title: "GBP posts published", desc: "A weekly Google Business Profile post and your own website images added to your profile — with your Google account connected" },
              { icon: "⭐", title: "Reviews answered", desc: "New reviews monitored from Google, Yelp & TripAdvisor — replies posted automatically to Google; Yelp and TripAdvisor replies drafted for you to paste" },
              { icon: "📈", title: "Rankings checked", desc: "Real Google Maps pack positions checked weekly, plus daily keyword data when Search Console is connected" },
              { icon: "🔗", title: "Local outreach", desc: "Personalized pitches to real published contacts of relevant local organizations, one follow-up, and a link counted only once verified live" },
              { icon: "🤖", title: "AI search checked", desc: "We probe ChatGPT, Perplexity & Gemini monthly to see if they mention your business" },
              { icon: "📊", title: "Social posts published", desc: "Posts to your connected Facebook Page and Instagram from your website's own content, with no per-post approval" },
              { icon: "📁", title: "Citations checked", desc: "Your name, phone and address compared across your website, Google, and where connected Yelp and Facebook, with alerts when they drift" },
              { icon: "🛡️", title: "Listing protected", desc: "Weekly watchdog catches Google's silent edits to your hours, phone, or name — and alerts you with exactly what changed" },
              { icon: "💬", title: "Reviews spotlighted", desc: "Your real 5-star reviews shared on your connected Facebook Page, with no per-post approval" },
              { icon: "⚡", title: "Search engines notified", desc: "New pages pinged to Bing via IndexNow; Google sitemap resubmitted on Scale+ plans with Search Console connected" },
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
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
          <p className="text-center text-xs text-zinc-400">Sources: Google Local Services Research, BrightLocal, HubSpot, Google Trends. Statistics reflect industry research, not guarantees of results for your specific business.</p>
        </div>
      </section>

      {/* ── REAL TESTIMONIALS (renders only when approved ones exist) ─ */}
      <TestimonialsSection />

      {/* ── PROOF (real artifacts, no fabricated testimonials) ─ */}
      <section className="px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-zinc-400">See it before you pay</p>
          <h2 className="mb-3 text-center text-3xl font-bold text-zinc-900">Proof, not promises</h2>
          <p className="mx-auto mb-8 max-w-2xl text-center text-sm text-zinc-500 leading-relaxed">
            Instead of stock-photo testimonials, here&apos;s the actual work. Run the free scan to see your own report, or look at a full sample first.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { href: "/examples/sample-local-growth-report", icon: "📄", title: "A real sample report", desc: "The exact visibility score, prioritized fix list, and competitor breakdown you get — no email required." },
              { href: "/scan", icon: "🔍", title: "Your own free scan", desc: "Score your business across 6 ranking factors in 60 seconds. No account, no credit card." },
              { href: "/support", icon: "🤝", title: "Personal setup help", desc: "A real person reviews your scan and helps you get connected — not a support ticket queue." },
            ].map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-red-200 hover:shadow-md"
              >
                <span className="text-2xl">{c.icon}</span>
                <span className="mt-3 text-base font-semibold text-zinc-900">{c.title}</span>
                <span className="mt-1 flex-1 text-sm text-zinc-500 leading-relaxed">{c.desc}</span>
                <span className="mt-3 text-sm font-semibold text-red-600">Open →</span>
              </Link>
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-zinc-400 leading-relaxed">
            We also run GravyBlock on{" "}
            <Link href="/proof" className="font-semibold text-zinc-600 underline underline-offset-2 hover:text-zinc-900">
              our own businesses — live numbers here
            </Link>
            . Real customer results get published the moment we have them. We&apos;d rather show you nothing than make it up.
          </p>
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
                <p className="text-sm font-semibold text-zinc-900">Personal setup, not a support ticket queue</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Local SEO agencies charge $1,000+/month for work that should be automated. When you sign up, I personally review your scan and make sure everything is connected and running correctly — you can reach me directly.
                </p>
                <p className="mt-2 text-xs text-zinc-400">— Chris · <a href="mailto:chris@gravyblock.com" className="underline hover:text-zinc-700">chris@gravyblock.com</a></p>
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
              Autopilot (Scale): $74.99/mo, locked while subscribed
            </div>
            <h2 className="text-3xl font-bold text-zinc-900">Simple, transparent pricing.</h2>
            <p className="text-sm text-zinc-500">No contracts. Cancel anytime. 30-day money-back guarantee.</p>
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
                  <p className="text-[11px] font-semibold text-emerald-600 mt-0.5">
                    {plan.tier === "growth" ? "Locked while subscribed" : `Save $${(plan.monthly - plan.intro).toFixed(2)} first month`}
                  </p>
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
            See where you stand on Google.
          </h2>
          <p className="text-zinc-400">
            Find out your visibility score and what's holding you back. Free, in 60 seconds. Then let GravyBlock help you improve.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/scan" className="rounded-full bg-white px-7 py-3 text-sm font-bold text-zinc-900 hover:bg-zinc-100">
              Get my free score
            </Link>
            <Link href="/start?plan=growth&promo=GROWTH50" className="rounded-full bg-red-600 px-7 py-3 text-sm font-bold text-white hover:bg-red-500">
              Start Scale — $74.99/mo
            </Link>
          </div>
          <p className="text-xs text-zinc-600">No setup fee · Cancel anytime · $74.99/mo locked while subscribed</p>
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
          { "@type": "Offer", name: "Starter", price: "29.99", priceCurrency: "USD" },
          { "@type": "Offer", name: "Scale", price: "74.99", priceCurrency: "USD" },
          { "@type": "Offer", name: "Pro", price: "149.99", priceCurrency: "USD" },
        ],
      }) }} />
    </div>
  );
}

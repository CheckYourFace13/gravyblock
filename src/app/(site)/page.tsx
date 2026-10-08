import type { Metadata } from "next";
import Link from "next/link";
import { TestimonialsSection } from "./testimonials-section";

export const metadata: Metadata = {
  alternates: { canonical: "https://gravyblock.com/" },
  title: { absolute: "GravyBlock — Automated Local SEO for Small Businesses | Free Scan" },
  description:
    "GravyBlock automates local SEO for small businesses: publishes website content, replies to Google reviews, checks citation consistency, and tracks visibility — so you get discovered on Google Maps and Google Search. Autopilot from $74.99/mo, locked while subscribed. Free scan.",
};

const siteUrl = "https://gravyblock.com";

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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />

      {/* ── HERO ───────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-red-50 to-white px-4 pt-14 pb-12 sm:px-6 text-center">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="inline-block rounded-full border border-red-200 bg-red-50 px-4 py-1 text-xs font-bold uppercase tracking-widest text-red-700">
            Autopilot: $74.99/mo, locked while subscribed
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl leading-[1.08]">
            Local SEO that does<br className="hidden sm:block" />{" "}the work for you.
          </h1>
          <p className="mx-auto max-w-xl text-lg text-zinc-600">
            GravyBlock finds what is stopping customers from finding your business, then automatically works on fixing it, checks that it happened, and keeps going. Connect once; there are no SEO tactics to learn and no task list to manage.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/scan" className="rounded-full bg-red-600 px-9 py-4 text-base font-bold text-white hover:bg-red-500 shadow-md">
              Scan my business free →
            </Link>
            <Link href="/start?plan=growth&promo=GROWTH50" className="rounded-full border border-zinc-300 bg-white px-8 py-4 text-base font-semibold text-zinc-800 hover:border-zinc-400 shadow-sm">
              Start GravyBlock — $74.99/mo
            </Link>
          </div>
          <p className="pt-1 text-xs font-medium text-zinc-600">
            Free scan, no credit card · $74.99/month locked while subscribed · Cancel anytime · 30-day money-back guarantee
          </p>
        </div>
      </section>

      {/* ── THE LOOP ───────────────────────────────────────── */}
      <section className="px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            One engine. It never stops working.
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-zinc-600">
            GravyBlock is built to decide what to do next and then do it, so you are not left with a to-do list.
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
              { icon: "⭐", title: "Reviews answered", desc: "New reviews monitored from Google, Yelp & TripAdvisor — replies posted automatically to Google; Yelp and TripAdvisor are monitored and flagged since their APIs don't allow automatic replies" },
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

      {/* ── EXPLAINER LINKS ────────────────────────────────── */}
      <section className="px-4 py-10 sm:px-6">
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
          <Link href="/how-it-works" className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-red-200 hover:shadow-md">
            <p className="text-base font-semibold text-zinc-900">How it works</p>
            <p className="mt-1 text-sm text-zinc-500 leading-relaxed">The seven-step loop, and why connecting once is all it takes. →</p>
          </Link>
          <Link href="/features" className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-red-200 hover:shadow-md">
            <p className="text-base font-semibold text-zinc-900">Exactly what it does</p>
            <p className="mt-1 text-sm text-zinc-500 leading-relaxed">What is automatic, what needs a connection, and what is not offered. →</p>
          </Link>
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
              { href: "/proof", icon: "✅", title: "Verified work", desc: "Work GravyBlock has completed and confirmed live on businesses we operate ourselves. Only verified work is shown." },
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
                <p className="text-sm font-semibold text-zinc-900">Connect once. GravyBlock takes it from there.</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Some work needs permission to act on your website, Google account or Facebook Page. You grant each one time, and a missing connection never stops the unrelated work. Questions along the way go to our support team.
                </p>
              </div>
              <Link href="/scan" className="shrink-0 rounded-full bg-red-600 px-6 py-3 text-sm font-bold text-white hover:bg-red-500 text-center">
                Start free
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING: one dominant offer ────────────────────── */}
      <section id="plans" className="px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-3xl rounded-3xl border-2 border-red-200 bg-gradient-to-br from-red-50 via-white to-white p-8 text-center shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-red-700">The easiest option: let GravyBlock handle it</p>
          <h2 className="mt-2 text-3xl font-bold text-zinc-900">Scale: $74.99/month</h2>
          <p className="mt-1 text-sm font-semibold text-emerald-700">Locked while subscribed (regular $149.99)</p>
          <ul className="mx-auto mt-5 grid max-w-xl gap-1.5 text-left text-sm text-zinc-700 sm:grid-cols-2">
            {[
              "Finds what is hurting your visibility",
              "Chooses what is worth fixing next",
              "Does the eligible work automatically",
              "Verifies what it completed",
              "Works on Google, reviews and social once connected",
              "Keeps monitoring and working automatically",
            ].map((v) => (
              <li key={v} className="flex gap-2">
                <span className="font-bold text-emerald-600">✓</span>
                {v}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/scan" className="rounded-full bg-red-600 px-8 py-3.5 text-base font-bold text-white hover:bg-red-500 shadow-md">
              Scan my business free →
            </Link>
            <Link href="/start?plan=growth&promo=GROWTH50" className="rounded-full border border-zinc-300 bg-white px-7 py-3.5 text-base font-semibold text-zinc-800 hover:border-zinc-400">
              Start GravyBlock — $74.99/mo
            </Link>
          </div>
          <p className="mt-3 text-xs font-medium text-zinc-600">$74.99/month locked while subscribed · Cancel anytime · 30-day money-back guarantee</p>
          <p className="mt-2 text-xs text-zinc-500">
            Other plans are on the{" "}
            <Link href="/pricing" className="underline">
              pricing page
            </Link>
            .
          </p>
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

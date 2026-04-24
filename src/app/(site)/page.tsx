import type { Metadata } from "next";
import Link from "next/link";

const faqItems = [
  {
    q: "How does GravyBlock work?",
    a: "Run a free scan, confirm your business profile, view score and top findings, then unlock the full report by email. From there, activate Base or Pro in workspace billing to keep the same business monitored over time.",
  },
  {
    q: "Who is GravyBlock for?",
    a: "Local businesses, apartment communities, clinics, attorneys, home services, gyms, salons, med spas, auto services, service-area businesses, multi-location brands, and online brands building local trust.",
  },
  {
    q: "How does the free scan work?",
    a: "The scan uses Google Places details, website crawl signals, and observational social link discovery to generate a score, verdict, and top findings. Full report sections unlock after name and email.",
  },
  {
    q: "What does Base include?",
    a: "Base adds monthly visibility refreshes, monthly listing and website re-checks, AI visibility summaries, content ideas, and trend history in workspace.",
  },
  {
    q: "What does Pro include?",
    a: "Pro includes everything in Base plus more frequent refreshes, content and publishing queues, AI visibility checks, local page and service-area queue, citation queue, review queue, and broader multi-location support where current schema supports it.",
  },
  {
    q: "Does it support multi-location businesses?",
    a: "Yes. The product supports multi-location patterns, with deeper operational support available in Pro where current workspace and schema paths support it.",
  },
  {
    q: "Does it work for service-area businesses?",
    a: "Yes. Service-area operators can run scans, use recommendations, and activate recurring monitoring.",
  },
  {
    q: "Does it work for online businesses with local intent?",
    a: "Yes. Online-first brands that still need local trust and local-intent visibility can use the same scan and workspace flow.",
  },
  {
    q: "Does GravyBlock guarantee rankings?",
    a: "No. GravyBlock does not guarantee rankings. It helps prioritize and automate work that improves visibility and conversion readiness.",
  },
  {
    q: "How do reports and ongoing monitoring work?",
    a: "Reports are generated from each scan. Base and Pro add recurring monitoring and workspace history so you can track changes over time for the same business.",
  },
  {
    q: "Where does Stripe checkout run?",
    a: "After the scan saves a business profile, open workspace billing for that business and start Base or Pro. Checkout uses Stripe with price IDs from your environment (Base supports STRIPE_PRICE_BASE_MONTHLY or legacy STRIPE_PRICE_ENTRY_MONTHLY).",
  },
] as const;

export const metadata: Metadata = {
  title: "GravyBlock - Local growth software for real businesses",
  description:
    "Scan a business, unlock a full report, then activate Base or Pro to keep that business monitored automatically.",
};

export default function HomePage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  return (
    <div>
      <section className="border-b border-zinc-200 bg-gradient-to-b from-red-50 via-white to-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:py-20">
          <div className="flex-1 space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-800">Local growth autopilot</p>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
              Turn local visibility into booked work.
            </h1>
            <p className="max-w-2xl text-lg text-zinc-600">
              GravyBlock is built for local operators who need clear priorities and repeatable execution. Run a free scan,
              unlock the full report, then turn on Base or Pro for the exact business you want to monitor.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/scan"
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Free report
              </Link>
              <Link
                href="/scan?plan=base"
                className="inline-flex items-center justify-center rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
              >
                Start Base
              </Link>
              <Link
                href="/scan?plan=pro"
                className="inline-flex items-center justify-center rounded-full bg-red-700 px-6 py-3 text-sm font-semibold text-white hover:bg-red-600"
              >
                Start Pro
              </Link>
            </div>
            <p className="text-sm text-zinc-500">
              Start with your business first. We use that context to attach the selected plan to the right profile.
            </p>
          </div>
          <div className="flex-1">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-lg">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700">What you get immediately</p>
              <ul className="mt-4 space-y-3 text-sm text-zinc-700">
                <li className="flex gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-red-500" />Score and verdict in minutes</li>
                <li className="flex gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-red-500" />Top findings before unlock</li>
                <li className="flex gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-red-500" />Full report by email after unlock</li>
                <li className="flex gap-2"><span className="mt-1 h-2 w-2 rounded-full bg-red-500" />Workspace path into Base or Pro checkout</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-zinc-800 bg-zinc-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-9 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div className="max-w-xl space-y-3 lg:flex-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-red-400">Proof, not jargon</p>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Scores owners understand in one glance
            </h2>
            <p className="text-sm leading-snug text-zinc-300 sm:text-[0.9375rem]">
              Visibility, trust, clarity, conversion, listings, mobile, and calls to action are rolled into one simple
              readiness score with a verdict you can understand fast.
            </p>
          </div>
          <div className="w-full shrink-0 rounded-2xl border border-white/10 bg-zinc-800/60 p-5 shadow-lg sm:p-6 lg:max-w-sm">
            <p className="text-center text-6xl font-semibold tabular-nums tracking-tight text-white sm:text-7xl">72</p>
            <p className="mt-2 text-center text-xs leading-snug text-zinc-400 sm:text-sm">
              Sample score only. Run your free scan for your real result.
            </p>
            <Link
              href="/scan"
              className="mt-4 flex w-full items-center justify-center rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              Get my score
            </Link>
          </div>
        </div>
      </section>

      <section id="plans" className="border-b border-zinc-200 bg-zinc-50 py-16">
        <div className="mx-auto max-w-6xl space-y-8 px-4 sm:px-6">
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold text-zinc-900">Free, Base, and Pro</h2>
            <p className="max-w-3xl text-zinc-600">
              Choose your operating mode after scan context is created. Plan checkout is real and tied to one business
              profile in workspace billing.
            </p>
          </div>
          <div className="flex flex-wrap justify-start gap-2">
            <Link
              href="/scan"
              className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Free report
            </Link>
            <Link
              href="/scan?plan=base"
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
            >
              Start Base
            </Link>
            <Link
              href="/scan?plan=pro"
              className="inline-flex items-center justify-center rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
            >
              Start Pro
            </Link>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <article className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-800">Free</p>
              <p className="mt-2 text-3xl font-semibold text-zinc-900">$0</p>
              <p className="mt-1 text-sm text-zinc-500">Score, verdict, and top findings first.</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-zinc-600">
                {[
                  "Top 3 findings visible before unlock",
                  "Full report unlock by name + email",
                  "Report emailed after unlock",
                  "Saved report and workspace path",
                ].map((b) => (
                  <li key={b} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-red-500" />{b}</li>
                ))}
              </ul>
              <Link href="/scan" className="mt-6 inline-flex justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
                Get your score free
              </Link>
            </article>
            <article className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-800">Base</p>
              <div className="mt-2">
                <p className="text-lg text-zinc-500 line-through">$29.99/month</p>
                <p className="text-3xl font-semibold text-zinc-900">$19.99/month</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Launch special</p>
              </div>
              <p className="mt-1 text-sm text-zinc-500">Monthly monitoring and summary execution layer.</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-zinc-600">
                {[
                  "Monthly visibility refresh",
                  "Monthly listing and website re-check",
                  "Monthly AI visibility summary",
                  "Monthly content ideas",
                  "Workspace trend history",
                ].map((b) => (
                  <li key={b} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-red-500" />{b}</li>
                ))}
              </ul>
              <Link href="/scan?plan=base" className="mt-6 inline-flex justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
                Start Base
              </Link>
            </article>
            <article className="flex flex-col rounded-2xl border border-red-200 bg-white p-6 shadow-md ring-1 ring-red-100">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-800">Pro</p>
              <div className="mt-2">
                <p className="text-lg text-zinc-500 line-through">$59.99/month</p>
                <p className="text-3xl font-semibold text-zinc-900">$39.99/month</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Launch special</p>
              </div>
              <p className="mt-1 text-sm text-zinc-500">Fullest automation layer currently shipped.</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-zinc-600">
                {[
                  "More frequent recurring refreshes",
                  "Content queue and publishing queue/history",
                  "Autopilot workspace with AI visibility checks",
                  "Local page/service-area queue",
                  "Citation and review queues",
                ].map((b) => (
                  <li key={b} className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-red-500" />{b}</li>
                ))}
              </ul>
              <Link href="/scan?plan=pro" className="mt-6 inline-flex justify-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500">
                Start Pro
              </Link>
            </article>
          </div>
          <p className="text-center text-xs text-zinc-500">
            Run the free scan first, then turn on Base or Pro for this business.
          </p>
        </div>
      </section>

      <section id="who-its-for" className="mx-auto max-w-6xl space-y-6 px-4 py-16 sm:px-6">
        <h2 className="text-3xl font-semibold text-zinc-900">Who GravyBlock is for</h2>
        <p className="max-w-3xl text-zinc-600">
          GravyBlock is for local teams that depend on local discovery and local trust to win revenue.{" "}
          <Link href="/industries" className="font-semibold text-red-800 hover:underline">
            Explore industries
          </Link>{" "}
          for sector-specific notes on listings, websites, reviews, and AI discovery.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            "Apartment communities",
            "Dentists, doctors, and clinics",
            "Attorneys and legal offices",
            "Home services",
            "Gyms and fitness studios",
            "Salons and med spas",
            "Auto services",
            "Multi-location brands",
            "Service-area businesses",
            "Online brands building local trust",
            "Restaurants and bars",
            "Breweries and taprooms",
          ].map((item) => (
            <div key={item} className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="border-y border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-semibold text-zinc-900">How GravyBlock works</h2>
          <ol className="grid gap-4 md:grid-cols-4">
            {[
              "Pick your business from Google Places",
              "Get score, verdict, and top findings",
              "Unlock full report and open workspace",
              "Activate Base or Pro and keep monitoring",
            ].map((step, idx) => (
              <li key={step} className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700">
                <p className="text-xs font-semibold text-red-700">0{idx + 1}</p>
                <p className="mt-2 font-semibold text-zinc-900">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="why-local-trust" className="mx-auto max-w-6xl space-y-6 px-4 py-16 sm:px-6">
        <h2 className="text-3xl font-semibold text-zinc-900">Why local trust and AI search coverage matter</h2>
        <p className="max-w-3xl text-zinc-600">
          Discovery does not end at ranking. People compare details, read trust cues, and ask assistants for options.
          Strong local trust signals improve conversion after discovery and improve how your business is summarized in
          AI-assisted search interfaces.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h3 className="text-lg font-semibold text-zinc-900">What improves conversion after discovery?</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Clear services, clear service areas, proof signals, contact clarity, and fast paths to action.
            </p>
          </article>
          <article className="rounded-2xl border border-zinc-200 bg-white p-5">
            <h3 className="text-lg font-semibold text-zinc-900">How does AI search change local discovery?</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Assistants compress options quickly. Inconsistent business facts and weak page clarity lower confidence in
              your business profile.
            </p>
          </article>
        </div>
      </section>

      <section id="guides" className="border-y border-zinc-200 bg-white py-16">
        <div className="mx-auto max-w-6xl space-y-8 px-4 sm:px-6">
          <div className="max-w-3xl space-y-3">
            <h2 className="text-3xl font-semibold text-zinc-900">Guides for local growth execution</h2>
            <p className="text-zinc-600">Use these playbooks to improve trust, visibility, and conversion quality.</p>
            <div className="flex flex-wrap gap-3 text-sm font-semibold">
              <Link href="/industries" className="text-red-800 hover:underline">
                Browse industries
              </Link>
              <Link href="/compare" className="text-red-800 hover:underline">
                Compare approaches
              </Link>
              <Link href="/examples" className="text-red-800 hover:underline">
                See sample workflows
              </Link>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { href: "/industries", title: "Industries: trades, clinics, retail, and more" },
              { href: "/guides/multi-location-local-seo", title: "Multi-location local SEO" },
              { href: "/guides/service-area-business-visibility", title: "Service-area business visibility" },
              { href: "/guides/ai-search-local-businesses", title: "AI search for local businesses" },
              { href: "/guides/social-proof-and-local-conversion", title: "Social proof and local conversion" },
              { href: "/guides/website-trust-signals", title: "Website trust signals" },
              { href: "/guides", title: "All guides" },
            ].map((g) => (
              <Link
                key={g.href}
                href={g.href}
                className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 shadow-sm transition hover:border-red-200 hover:bg-white"
              >
                <h3 className="text-lg font-semibold text-zinc-900">{g.title}</h3>
                <p className="mt-3 text-sm font-semibold text-red-800">Read guide</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-6xl space-y-6 px-4 py-16 sm:px-6">
        <h2 className="text-3xl font-semibold text-zinc-900">FAQ</h2>
        <div className="space-y-3">
          {faqItems.map((item) => (
            <details key={item.q} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-zinc-900">{item.q}</summary>
              <p className="mt-2 text-sm text-zinc-600">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 text-center sm:px-6">
        <h2 className="text-3xl font-semibold text-zinc-900">Start with your business, then activate the plan</h2>
        <p className="mx-auto mt-3 max-w-2xl text-zinc-600">
          Run scan first. Then continue to Base or Pro checkout in workspace billing for that business.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/scan" className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-800">
            Start with free scan
          </Link>
          <Link href="/scan?plan=base" className="rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500">
            Start Base
          </Link>
          <Link href="/scan?plan=pro" className="rounded-full bg-red-700 px-6 py-3 text-sm font-semibold text-white hover:bg-red-600">
            Start Pro
          </Link>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

const faqItems = [
  {
    q: "How does GravyBlock work?",
    a: "Run a free scan, confirm your business profile, view your score and top findings, then unlock the full report. From there, activate Starter, Growth, Pro, or Agency to turn on automated monitoring and execution for that business.",
  },
  {
    q: "Who is GravyBlock for?",
    a: "Primarily built for local businesses — restaurants, contractors, clinics, attorneys, home services, gyms, salons, med spas, auto services, service-area businesses, and multi-location brands. Also works for online businesses, e-commerce stores, SaaS products, and agencies managing multiple clients.",
  },
  {
    q: "How does the free scan work?",
    a: "The scan uses Google Places details (for local businesses), website crawl signals, and social link discovery to generate a score, verdict, and top findings. If you don't have a Google listing, use the website mode — just enter your URL. No Google account required. Full report sections unlock after name and email.",
  },
  {
    q: "What does Starter include?",
    a: "Starter adds monthly visibility refreshes, AI visibility checks, 4 content ideas per month, citation and review task queue, and a monthly summary email. Best for businesses just starting out with automated local growth.",
  },
  {
    q: "What does Scale include?",
    a: "Scale includes everything in Starter plus weekly visibility refreshes, AI-written articles published to your site automatically, Reddit posts submitted to relevant local communities, and backlink outreach emails sent to 8 relevant sites per month.",
  },
  {
    q: "What does Pro include?",
    a: "Pro includes everything in Growth plus twice-weekly visibility refreshes, programmatic local SEO pages for your city and industry, higher output across all content and outreach queues, and the lead pipeline engine. Comes with 1 location — add up to 2 more at $99/mo each.",
  },
  {
    q: "What does Agency include?",
    a: "Agency is built for marketing agencies managing multiple clients. Includes 10 client workspaces, unlimited output, daily refresh cadence, white-label reporting, and the full lead pipeline engine — GravyBlock identifies quality leads in your area and sends outreach on your behalf.",
  },
  {
    q: "What is the lead pipeline engine?",
    a: "The lead pipeline engine scans for businesses in your area or niche that have weak online visibility — low review counts, missing listings, outdated websites. GravyBlock then drafts and sends personalized outreach emails to those prospects on your behalf. Pro gets a limited monthly run; Agency gets unlimited.",
  },
  {
    q: "What happens with Reddit and blog content?",
    a: "On Scale and above, GravyBlock writes Reddit-style posts targeting your city and industry, then submits them automatically to the most relevant subreddit — local city boards, niche communities, and industry forums. Backlink outreach emails are sent on your behalf to relevant local sites and blogs each month.",
  },
  {
    q: "Does GravyBlock guarantee rankings?",
    a: "No. GravyBlock does not guarantee rankings. It automates the work that improves local visibility and conversion readiness over time.",
  },
  {
    q: "What is the introductory pricing?",
    a: "Introductory pricing is available now. Use code INTRO50 at checkout for 50% off your first month. Regular pricing resumes at renewal.",
  },
  {
    q: "Does it support multi-location businesses?",
    a: "Yes. Pro supports up to 3 business locations under one account. Agency supports up to 10 client workspaces for agencies managing multiple businesses.",
  },
] as const;

export const metadata: Metadata = {
  title: "GravyBlock: Local SEO Autopilot for Small Businesses",
  description:
    "GravyBlock automates local SEO for small businesses. Get a free visibility score, then activate autopilot to publish content, manage reviews, build citations, and monitor AI search presence.",
};

const plans = [
  {
    tier: "starter",
    label: "Starter",
    monthly: 79.99,
    intro: 39.99,
    highlight: false,
    tagline: "Monthly monitoring and content ideas.",
    bullets: [
      "Monthly visibility refresh + score history",
      "4 content ideas per month",
      "Citation and review task queue",
      "AI search visibility check",
      "Monthly summary email",
    ],
    cta: "Start Starter",
    href: "/scan?plan=starter",
    ctaStyle: "bg-zinc-900 hover:bg-zinc-800",
  },
  {
    tier: "growth",
    label: "Scale",
    monthly: 149.99,
    intro: 74.99,
    highlight: true,
    tagline: "AI writes and publishes content weekly — on autopilot.",
    bullets: [
      "Weekly visibility refreshes",
      "AI articles published to your site automatically",
      "Reddit posts submitted to relevant local communities",
      "Backlink outreach emails sent to 8 relevant sites monthly",
      "Review monitoring across Google, Yelp, and more",
    ],
    cta: "Start Scale",
    href: "/scan?plan=growth",
    ctaStyle: "bg-red-600 hover:bg-red-500",
  },
  {
    tier: "pro",
    label: "Pro",
    monthly: 299.99,
    intro: 149.99,
    highlight: false,
    tagline: "Higher output, faster refresh, deeper SEO coverage.",
    bullets: [
      "Twice-weekly visibility refreshes",
      "12 published articles + 8 local SEO pages per month",
      "Programmatic local SEO pages for your city and industry",
      "Lead pipeline engine: find and pitch quality prospects automatically",
      "1 location included · add up to 2 more at $99.99/mo each",
    ],
    cta: "Start Pro",
    href: "/scan?plan=pro",
    ctaStyle: "bg-zinc-900 hover:bg-zinc-800",
  },
  {
    tier: "agency",
    label: "Agency",
    monthly: 499.99,
    intro: 249.99,
    highlight: false,
    tagline: "Run up to 10 clients on full autopilot.",
    bullets: [
      "10 client workspaces, all features unlocked",
      "Unlimited content drafts and publishing",
      "Lead pipeline engine: GravyBlock finds quality leads and sends outreach on your behalf",
      "Daily refresh cadence across all clients",
      "White-label reporting · priority support",
    ],
    cta: "Start Agency",
    href: "/scan?plan=agency",
    ctaStyle: "bg-zinc-900 hover:bg-zinc-800",
  },
] as const;

const siteUrl = "https://gravyblock.com";

export default function HomePage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "GravyBlock",
    url: siteUrl,
    logo: `${siteUrl}/logo.png`,
    description: "Local SEO autopilot for small businesses. Automated content publishing, review management, citation building, backlink opportunities, and AI search presence monitoring.",
    sameAs: [],
  };

  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "GravyBlock",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: siteUrl,
    offers: [
      { "@type": "Offer", name: "Starter", price: "79.99", priceCurrency: "USD", priceSpecification: { "@type": "UnitPriceSpecification", billingDuration: "P1M" } },
      { "@type": "Offer", name: "Scale", price: "149.99", priceCurrency: "USD", priceSpecification: { "@type": "UnitPriceSpecification", billingDuration: "P1M" } },
      { "@type": "Offer", name: "Pro", price: "299.99", priceCurrency: "USD", priceSpecification: { "@type": "UnitPriceSpecification", billingDuration: "P1M" } },
      { "@type": "Offer", name: "Agency", price: "499.99", priceCurrency: "USD", priceSpecification: { "@type": "UnitPriceSpecification", billingDuration: "P1M" } },
    ],
    description: "Local SEO autopilot: free scan, visibility score, content generation, GBP optimization, and recurring automation for local businesses.",
  };

  return (
    <div>
      <section className="border-b border-zinc-200 bg-gradient-to-b from-red-50 via-white to-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:py-20">
          <div className="flex-1 space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-800">Local growth autopilot</p>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
              Your marketing on autopilot. Every day.
            </h1>
            <p className="max-w-2xl text-lg text-zinc-600">
              GravyBlock writes and publishes local SEO content, surfaces citation and review tasks, builds your backlink queue, and monitors your AI search visibility. All of it runs on a schedule. Start with a free scan.
            </p>
            <p className="max-w-xl text-sm text-zinc-500">
              Built for local businesses — restaurants, contractors, salons, clinics, and service-area businesses. Also works for online brands and agencies. No Google account required.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/scan"
                className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Free report
              </Link>
              <Link
                href="/scan?plan=starter"
                className="inline-flex items-center justify-center rounded-full bg-zinc-100 border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
              >
                Starter — $39.99/mo
              </Link>
              <Link
                href="/scan?plan=growth"
                className="inline-flex items-center justify-center rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
              >
                Scale — $74.99/mo
              </Link>
              <Link
                href="/scan?plan=pro"
                className="inline-flex items-center justify-center rounded-full bg-zinc-100 border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
              >
                Pro — $149.99/mo
              </Link>
            </div>
            <p className="text-xs text-zinc-500">
              Introductory pricing — use code <strong>INTRO50</strong> at checkout for 50% off your first month.
            </p>
          </div>
          <div className="flex-1">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-lg">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700">What runs automatically</p>
              <ul className="mt-4 space-y-3 text-sm text-zinc-700">
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">1</span>Keyword ranking sync from Google Search Console — daily</li>
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">2</span>Auto meta title + description generated for every article</li>
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">3</span>Brand voice config — every article matches your tone</li>
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">4</span>Smart internal linking — articles link to each other automatically</li>
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">5</span>Cover image fetched and attached to every article (Unsplash)</li>
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">6</span>Topic cluster map — pillar + supporting articles organized by theme</li>
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">7</span>Content calendar — visual schedule of all queued and published content</li>
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">8</span>GEO audit score — how often AI assistants mention your business</li>
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">9</span>Facebook + Instagram auto-posting (Scale and above)</li>
                <li className="flex gap-2"><span className="mt-0.5 shrink-0 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">+</span>Reddit auto-posting · backlink outreach · review management · citation audits</li>
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
              One score. Instant clarity.
            </h2>
            <p className="text-sm leading-snug text-zinc-300 sm:text-[0.9375rem]">
              Visibility, trust, listings, reviews, AI search coverage, and conversion readiness rolled into one
              score, with a prioritized action plan attached.
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-800">Pricing</p>
            <h2 className="text-3xl font-semibold text-zinc-900">Four plans. One autopilot.</h2>
            <p className="max-w-3xl text-zinc-600">
              Every plan starts with a free scan. Introductory pricing is available now. Use code{" "}
              <strong className="text-zinc-900">INTRO50</strong> at checkout for 50% off your first month.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-4">
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
                  <p className="text-sm text-zinc-400 line-through">${plan.monthly}/mo</p>
                  <p className="text-3xl font-semibold text-zinc-900">${plan.intro}<span className="text-base font-normal text-zinc-500">/mo</span></p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Introductory pricing · code INTRO50</p>
                </div>
                <p className="mt-2 text-sm text-zinc-500">{plan.tagline}</p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-zinc-600">
                  {plan.bullets.map((b) => (
                    <li key={b} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                      {b}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`mt-6 inline-flex justify-center rounded-full px-4 py-2 text-sm font-semibold text-white ${plan.ctaStyle}`}
                >
                  {plan.cta}
                </Link>
              </article>
            ))}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <p className="text-sm font-semibold text-zinc-900">Free — $0</p>
            <p className="mt-1 text-sm text-zinc-500">
              Score, verdict, and top 3 findings before unlock. Full report by email after name + email. Saved workspace
              to upgrade later.
            </p>
            <Link href="/scan" className="mt-3 inline-flex items-center rounded-full bg-zinc-100 border border-zinc-300 px-4 py-1.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-200">
              Get your score free
            </Link>
          </div>

          <p className="text-center text-xs text-zinc-500">
            All plans start with a free scan. Plan checkout is tied to one business profile in workspace billing.
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
            "Marketing agencies (Agency plan)",
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
              "Activate a plan — autopilot runs from there",
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
              your business profile — GravyBlock tracks this and works to improve it.
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
        <h2 className="text-3xl font-semibold text-zinc-900">Start free. Upgrade when ready.</h2>
        <p className="mx-auto mt-3 max-w-2xl text-zinc-600">
          Run the free scan first. Then activate the plan that fits your business from workspace billing.
          Use <strong>INTRO50</strong> for 50% off month one.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/scan" className="rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-800">
            Start with free scan
          </Link>
          <Link href="/scan?plan=growth" className="rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500">
            Start Scale — $74/mo
          </Link>
          <Link href="/scan?plan=agency" className="rounded-full bg-zinc-100 border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-200">
            Agency — $249.99/mo
          </Link>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
    </div>
  );
}

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
  title: "GravyBlock — Local SEO That Runs Itself | Automated Content, Reviews & Rankings",
  description:
    "GravyBlock replaces your local SEO agency for a fraction of the cost. AI writes and publishes content weekly, posts to Reddit, sends backlink outreach, and tracks your Google rankings — automatically. Free scan, no credit card.",
};

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
    cta: "Get started for $39.99/mo",
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
      "Review monitoring across Google, Yelp, and more",
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
      "Lead pipeline: GravyBlock finds weak competitors and pitches them for you",
      "Up to 3 locations — add more at $99.99/mo each",
    ],
    cta: "Start Pro — $149.99/mo",
    href: "/scan?plan=pro",
    ctaStyle: "bg-zinc-900 hover:bg-zinc-800",
  },
  {
    tier: "agency",
    label: "Agency",
    monthly: 499.99,
    intro: 249.99,
    highlight: false,
    tagline: "Run 10 clients. Bill them like you hired a team.",
    bullets: [
      "10 fully-automated client workspaces",
      "Unlimited content — articles, social posts, local pages",
      "Lead pipeline: find weak local businesses and pitch your services automatically",
      "Daily refresh cadence across all client accounts",
      "White-label reporting + priority support",
    ],
    cta: "Start Agency — $249.99/mo",
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
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-800">Local SEO on autopilot</p>
            <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
              Stop losing customers to businesses that rank above you.
            </h1>
            <p className="max-w-2xl text-lg text-zinc-600">
              GravyBlock writes and publishes local SEO articles, posts to Reddit, sends backlink outreach emails, tracks your Google rankings, and monitors whether AI assistants mention your business — all without you lifting a finger.
            </p>
            <p className="max-w-xl text-sm text-zinc-500">
              Costs less than one hour of agency time per month. Built for local businesses — restaurants, contractors, salons, clinics, lawyers, and service-area businesses.
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
            <p className="text-xs text-zinc-500">
              No credit card for the free scan. Use code <strong>INTRO50</strong> at checkout for 50% off month one.
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
          <div className="max-w-xl space-y-4 lg:flex-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-red-400">Free scan — results in 60 seconds</p>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Find out exactly why you're losing customers to competitors.
            </h2>
            <p className="text-sm leading-relaxed text-zinc-300 sm:text-[0.9375rem]">
              Your score shows where customers are falling off: missing Google citations, stale reviews, slow website, broken GBP data, and zero AI search coverage. Each issue is ranked by how much it's hurting you — with specific fixes attached.
            </p>
            <ul className="space-y-1.5 text-sm text-zinc-400">
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-red-500 shrink-0" />Google Business Profile completeness &amp; trust score</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-red-500 shrink-0" />Review count, recency, and response quality</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-red-500 shrink-0" />Website speed, schema, and mobile-readiness</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-red-500 shrink-0" />AI search mentions (ChatGPT, Perplexity, Gemini)</li>
              <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-red-500 shrink-0" />Citation consistency across 40+ directories</li>
            </ul>
          </div>
          <div className="w-full shrink-0 rounded-2xl border border-white/10 bg-zinc-800/60 p-5 shadow-lg sm:p-6 lg:max-w-sm">
            <p className="text-center text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-zinc-400">Sample visibility score</p>
            <p className="mt-2 text-center text-7xl font-semibold tabular-nums tracking-tight text-white">72</p>
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Google Business Profile</span><span className="text-emerald-400">88 / 100</span>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Reviews &amp; trust</span><span className="text-yellow-400">64 / 100</span>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Website &amp; schema</span><span className="text-yellow-400">71 / 100</span>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>AI search visibility</span><span className="text-red-400">41 / 100</span>
              </div>
            </div>
            <Link
              href="/scan"
              className="mt-5 flex w-full items-center justify-center rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              Get my real score — free
            </Link>
            <p className="mt-2 text-center text-[10px] text-zinc-500">No credit card. Takes 60 seconds.</p>
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

      <section id="who-its-for" className="mx-auto max-w-6xl space-y-8 px-4 py-16 sm:px-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-800">Built for you</p>
          <h2 className="text-3xl font-semibold text-zinc-900">If customers find you through Google, you need GravyBlock.</h2>
          <p className="max-w-3xl text-zinc-600">
            Any business where local search, reviews, and word-of-mouth drive new customers.{" "}
            <Link href="/industries" className="font-semibold text-red-800 hover:underline">
              See industry-specific playbooks →
            </Link>
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Restaurants & bars", note: "Win the map moment at meal time" },
            { label: "Dentists & clinics", note: "Rank when patients search for care" },
            { label: "Attorneys & law firms", note: "Build credibility before they call" },
            { label: "Home services & trades", note: "Show up first for emergency searches" },
            { label: "Salons & med spas", note: "Fill the calendar with new clients" },
            { label: "Contractors & remodelers", note: "Be in the first three results, every time" },
            { label: "Gyms & fitness studios", note: "Capture new-member searches year-round" },
            { label: "Real estate agents", note: "Rank for neighborhood searches near you" },
            { label: "Chiropractors & PTs", note: "Get found by patients searching for relief" },
            { label: "Multi-location brands", note: "Scale visibility across every location" },
            { label: "Service-area businesses", note: "Rank in every city you actually serve" },
            { label: "Marketing agencies", note: "Manage 10 clients from one dashboard" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-sm font-semibold text-zinc-900">{item.label}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{item.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="border-y border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-16 sm:px-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-800">How it works</p>
            <h2 className="text-3xl font-semibold text-zinc-900">Up and running in under five minutes.</h2>
          </div>
          <ol className="grid gap-4 md:grid-cols-4">
            {[
              { step: "01", title: "Search for your business", desc: "Type your business name. We pull it from Google Places automatically — address, phone, hours, categories, all of it." },
              { step: "02", title: "Get your score instantly", desc: "See your visibility score, a plain-English verdict, and your top three issues — no email required to get started." },
              { step: "03", title: "Unlock the full report", desc: "Enter your email to see every finding across 6 categories: listings, reviews, website, citations, AI visibility, and conversion." },
              { step: "04", title: "Activate autopilot", desc: "Choose Scale, Pro, or Agency. GravyBlock starts publishing content, posting to Reddit, and sending outreach — every week, hands-free." },
            ].map((item) => (
              <li key={item.step} className="rounded-2xl border border-zinc-200 bg-white p-5">
                <p className="text-xs font-bold text-red-700">{item.step}</p>
                <p className="mt-2 font-semibold text-zinc-900">{item.title}</p>
                <p className="mt-1 text-sm text-zinc-500 leading-relaxed">{item.desc}</p>
              </li>
            ))}
          </ol>
          <div className="text-center">
            <Link href="/scan" className="inline-flex rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-800">
              Start with your free scan
            </Link>
          </div>
        </div>
      </section>

      <section id="why-local-trust" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 sm:p-10">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-800">The real problem</p>
              <h2 className="text-3xl font-semibold text-zinc-900">Your competitor isn't better — they just rank higher.</h2>
              <p className="text-zinc-600">
                Most local business owners assume customers choose on quality. They don't. They choose whoever shows up first on Google Maps, has the most reviews, and looks credible when you click through.
              </p>
              <p className="text-zinc-600">
                GravyBlock fixes the signals that determine rank: profile completeness, review volume, content freshness, citation consistency, backlinks, and AI search mentions. It does all of this automatically — every single week.
              </p>
              <Link href="/scan" className="inline-flex rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500">
                See where you stand right now
              </Link>
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

      <section className="border-t border-zinc-200 bg-gradient-to-b from-red-50 to-white">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-800">Ready to rank?</p>
          <h2 className="mt-3 text-3xl font-semibold text-zinc-900 sm:text-4xl">Stop letting competitors take customers that should be yours.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-zinc-600">
            Run the free scan in 60 seconds. No credit card, no commitment. If you like what you see, activate Scale for $74.99/mo and let GravyBlock handle the rest.
          </p>
          <p className="mt-2 text-sm text-zinc-500">Use code <strong className="text-zinc-700">INTRO50</strong> at checkout — 50% off your first month.</p>
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

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }} />
    </div>
  );
}

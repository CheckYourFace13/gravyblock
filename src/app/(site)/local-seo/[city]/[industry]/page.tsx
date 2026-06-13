import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findCity, findIndustry, getStaticCombos, CITIES, INDUSTRIES } from "@/lib/local-seo/markets";

export const dynamicParams = true;

type Props = { params: Promise<{ city: string; industry: string }> };

export async function generateStaticParams() {
  return getStaticCombos();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: citySlug, industry: industrySlug } = await params;
  const city = findCity(citySlug);
  const industry = findIndustry(industrySlug);
  if (!city || !industry) return { title: "Not found" };

  return {
    title: `Local SEO for ${industry.plural} in ${city.name}, ${city.state} | GravyBlock`,
    description: `GravyBlock automates local SEO, content publishing, review management, and AI visibility for ${industry.plural} in ${city.name}. Free scan — no credit card.`,
    alternates: {
      canonical: `/local-seo/${citySlug}/${industrySlug}`,
    },
    openGraph: {
      title: `Local SEO for ${industry.plural} in ${city.name}`,
      description: `Automated local growth for ${industry.plural} in ${city.name}, ${city.state}.`,
    },
  };
}

export default async function LocalSeoPage({ params }: Props) {
  const { city: citySlug, industry: industrySlug } = await params;
  const city = findCity(citySlug);
  const industry = findIndustry(industrySlug);
  if (!city || !industry) notFound();

  const relatedCities = CITIES.filter((c) => c.slug !== citySlug).slice(0, 6);
  const relatedIndustries = INDUSTRIES.filter((i) => i.slug !== industrySlug).slice(0, 8);

  const ind = industry.name.toLowerCase();
  const indPlural = industry.plural.toLowerCase();

  // FAQ content — also emitted as FAQPage schema for Google rich results
  const faqs = [
    {
      q: `How do ${indPlural} in ${city.name} rank higher on Google Maps?`,
      a: `${industry.plural} rank in the ${city.name} map pack by combining a complete Google Business Profile, a steady flow of recent reviews, consistent name/address/phone across directories, and regular local content. GravyBlock automates all four — content publishing, citation audits, review requests, and GBP posts — so your ${ind} climbs the rankings without you doing the work manually.`,
    },
    {
      q: `How much does local SEO cost for a ${ind} in ${city.name}?`,
      a: `A ${city.name} SEO agency typically charges $1,000–$3,000/month and you still attend meetings. GravyBlock runs the same work automatically from $39.99/month introductory — content, Google Business Profile management, review monitoring, and citation fixes included. You can start with a free scan, no credit card.`,
    },
    {
      q: `How long until my ${ind} shows up in ${city.name} search results?`,
      a: `Most ${indPlural} see movement within 30–60 days of consistent optimization, with top-3 map pack rankings typically taking 3–6 months in competitive ${city.name} markets. GravyBlock publishes content and builds signals every week, so improvement compounds over time rather than stalling after a one-time audit.`,
    },
    {
      q: `Will my ${ind} show up when people ask ChatGPT for recommendations in ${city.name}?`,
      a: `Increasingly, customers ask ChatGPT and Perplexity "who's the best ${ind} in ${city.name}?" AI assistants pull from your Google profile, reviews, and web content. GravyBlock probes these AI engines monthly to track whether you're mentioned, and publishes the structured, citation-friendly content that gets ${indPlural} recommended.`,
    },
  ];

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: `Local SEO for ${industry.plural} in ${city.name}, ${city.state}`,
        description: `Automated local SEO and marketing for ${industry.plural} in ${city.name}.`,
        url: `${baseUrl}/local-seo/${citySlug}/${industrySlug}`,
        mainEntity: {
          "@type": "Service",
          name: "GravyBlock Local Growth Autopilot",
          areaServed: { "@type": "City", name: city.name, containedInPlace: { "@type": "State", name: city.state } },
          audience: { "@type": "Audience", audienceType: industry.plural },
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <div>
      <section className="border-b border-zinc-200 bg-gradient-to-b from-red-50 via-white to-white">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">
            {industry.category} · {city.name}, {city.state}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            Local SEO for {industry.plural} in {city.name}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600">
            GravyBlock automates content, outreach, reviews, and AI visibility for {industry.plural.toLowerCase()} in{" "}
            {city.name}, {city.state}, so you show up when customers search and when AI assistants answer.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/scan?city=${encodeURIComponent(city.name + ", " + city.state)}`}
              className="inline-flex items-center justify-center rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
            >
              Free scan for my {industry.name.toLowerCase()}
            </Link>
            <Link
              href="/#plans"
              className="inline-flex items-center justify-center rounded-full bg-zinc-100 border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-200"
            >
              See plans
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl space-y-6 px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-semibold text-zinc-900">
          Why local SEO matters for {industry.plural.toLowerCase()} in {city.name}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              title: "Customers search locally first",
              body: `When someone needs a ${industry.name.toLowerCase()} in ${city.name}, they search Google. The top 3 results capture most of the calls. Visibility in local search and map pack results is not optional.`,
            },
            {
              title: "AI assistants are the new word-of-mouth",
              body: `ChatGPT, Perplexity, and Google AI Overviews now recommend specific businesses. ${industry.plural} with consistent local signals and content show up there. Those that don't are invisible to an entire generation of searchers.`,
            },
            {
              title: "Reviews convert after discovery",
              body: `Ranking is step one. ${industry.plural} in ${city.name} with 50+ recent reviews and consistent star ratings convert dramatically better than competitors with fewer or older reviews.`,
            },
            {
              title: "Consistent citations build trust signals",
              body: `Google cross-references business name, address, and phone across hundreds of directories. ${industry.plural} with mismatched or missing listings rank lower. GravyBlock audits and queues citation fixes automatically.`,
            },
          ].map((card) => (
            <article key={card.title} className="rounded-2xl border border-zinc-200 bg-white p-5">
              <h3 className="font-semibold text-zinc-900">{card.title}</h3>
              <p className="mt-2 text-sm text-zinc-600">{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold text-zinc-900">
            What GravyBlock does for {industry.plural.toLowerCase()} in {city.name}
          </h2>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              `Scans your Google Business Profile listing for gaps and mismatches specific to ${industry.name.toLowerCase()} categories`,
              `Generates and publishes local SEO articles targeting "${industry.name.toLowerCase()} in ${city.name}" and nearby neighborhoods`,
              `Posts on Reddit, community forums, and niche blogs where ${city.name} locals ask for ${industry.category} recommendations`,
              `Monitors your AI search visibility: whether Perplexity or ChatGPT mentions your business when asked about ${industry.plural.toLowerCase()} in ${city.name}`,
              `Runs review request campaigns and drafts AI responses to new reviews to improve reply rate`,
              `Builds a backlink queue from local ${city.name} directories, community sites, and industry publications`,
            ].map((step, idx) => (
              <li key={idx} className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700">
                <p className="text-xs font-semibold text-red-700">0{idx + 1}</p>
                <p className="mt-2">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-4xl space-y-8 px-4 py-14 sm:px-6">
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-6">
          <h2 className="text-xl font-semibold text-zinc-900">
            Get a free local SEO scan for your {industry.name.toLowerCase()} in {city.name}
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Find your business on Google, get a score and top findings in under two minutes. No credit card.
            Unlock the full report and see exactly what to fix first.
          </p>
          <Link
            href={`/scan?vertical=${encodeURIComponent(industry.name)}&location=${encodeURIComponent(city.name + " " + city.state)}`}
            className="mt-4 inline-flex items-center justify-center rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
          >
            Scan my {industry.name.toLowerCase()} free →
          </Link>
        </div>

        {/* FAQ — matches FAQPage schema above for Google rich results */}
        <div>
          <h2 className="text-2xl font-semibold text-zinc-900">
            {industry.plural} in {city.name}: local SEO FAQ
          </h2>
          <div className="mt-5 space-y-3">
            {faqs.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-zinc-200 bg-white p-5">
                <summary className="cursor-pointer list-none font-semibold text-zinc-900 marker:hidden flex items-start justify-between gap-3">
                  <span>{f.q}</span>
                  <span className="shrink-0 text-zinc-400 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-zinc-600 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">
              {industry.name} local SEO in other cities
            </h3>
            <ul className="mt-3 space-y-1">
              {relatedCities.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/local-seo/${c.slug}/${industrySlug}`}
                    className="text-sm text-red-800 hover:underline"
                  >
                    {industry.plural} in {c.name}, {c.state}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">
              Other industries in {city.name}
            </h3>
            <ul className="mt-3 space-y-1">
              {relatedIndustries.map((i) => (
                <li key={i.slug}>
                  <Link
                    href={`/local-seo/${citySlug}/${i.slug}`}
                    className="text-sm text-red-800 hover:underline"
                  >
                    {i.plural} in {city.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </div>
  );
}

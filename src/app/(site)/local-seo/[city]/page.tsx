import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findCity, CITIES, INDUSTRIES } from "@/lib/local-seo/markets";

export const dynamicParams = true;

type Props = { params: Promise<{ city: string }> };

export async function generateStaticParams() {
  return CITIES.map((c) => ({ city: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: citySlug } = await params;
  const city = findCity(citySlug);
  if (!city) return { title: "Not found" };

  return {
    title: `Local SEO Services in ${city.name}, ${city.state} — GravyBlock`,
    description: `GravyBlock automates local SEO for small businesses in ${city.name}. Rank higher on Google Maps, publish content weekly, manage reviews, and track AI visibility. Free scan — no credit card.`,
    alternates: {
      canonical: `/local-seo/${citySlug}`,
    },
    openGraph: {
      title: `Local SEO Services in ${city.name}, ${city.state}`,
      description: `Automated local SEO for ${city.name} businesses — content, reviews, rankings, and AI visibility.`,
    },
  };
}

export default async function CityHubPage({ params }: Props) {
  const { city: citySlug } = await params;
  const city = findCity(citySlug);
  if (!city) notFound();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Local SEO Services in ${city.name}, ${city.state}`,
    description: `Automated local SEO for small businesses in ${city.name}. Rank higher on Google, get more reviews, and grow faster.`,
    url: `${siteUrl}/local-seo/${citySlug}`,
    mainEntity: {
      "@type": "Service",
      name: "GravyBlock Local SEO Autopilot",
      areaServed: { "@type": "City", name: city.name, containedInPlace: { "@type": "State", name: city.state } },
      provider: { "@type": "Organization", name: "GravyBlock", url: siteUrl },
    },
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: `How much does local SEO cost for a ${city.name} business?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Local SEO agencies in ${city.name} typically charge $500–$3,000/month. GravyBlock automates the same work — content publishing, citation management, review growth, and rank tracking — starting at $39.99/month. Use code INTRO50 for 50% off your first month.`,
        },
      },
      {
        "@type": "Question",
        name: `How long does it take to rank higher on Google in ${city.name}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Most businesses in ${city.name} see measurable improvement in their Google Maps rankings within 60–90 days of consistent local SEO work: optimized Google Business Profile, fresh content, growing reviews, and citation cleanup. GravyBlock runs this automatically every week.`,
        },
      },
      {
        "@type": "Question",
        name: `Do I need a local SEO agency in ${city.name}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Not anymore. GravyBlock replaces the work a local SEO agency would do — writing content, building citations, requesting reviews, posting to Google Business Profile — at a fraction of agency pricing. You get weekly automated work without managing a vendor.`,
        },
      },
    ],
  };

  const topIndustries = INDUSTRIES.slice(0, 12);

  return (
    <div>
      {/* Hero */}
      <section className="border-b border-zinc-200 bg-gradient-to-b from-red-50 via-white to-white">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">
            Local SEO · {city.name}, {city.state}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            Local SEO services in {city.name}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600">
            GravyBlock automates local SEO for small businesses in {city.name}, {city.state}. Rank higher
            on Google Maps, publish content every week, grow your reviews, and show up when AI assistants
            answer questions about your industry — all on autopilot.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/scan?location=${encodeURIComponent(city.name + " " + city.state)}`}
              className="inline-flex items-center justify-center rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
            >
              Free {city.name} SEO scan →
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              See plans
            </Link>
          </div>
          <p className="mt-3 text-xs text-zinc-500">From $39.99/mo · No agency needed · Cancel anytime</p>
        </div>
      </section>

      {/* Why local SEO matters in this city */}
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-semibold text-zinc-900">
          Why local SEO matters for {city.name} businesses
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[
            {
              title: `${city.name} customers search Google first`,
              body: `93% of local searches end with a call or visit to a business found on page one. In a competitive market like ${city.name}, showing up in the Google Maps 3-Pack is the difference between a full calendar and an empty one.`,
            },
            {
              title: "Reviews drive bookings",
              body: `Businesses with 50+ Google reviews and a 4.5+ star rating convert 3× better than competitors with fewer reviews. GravyBlock automates review request campaigns so your count grows every month.`,
            },
            {
              title: "AI assistants now recommend local businesses",
              body: `ChatGPT, Perplexity, and Google AI Overviews answer "best [service] in ${city.name}" queries with specific business names. GravyBlock tracks whether you're being mentioned — and publishes content that improves your chances.`,
            },
            {
              title: "Content = long-term rankings",
              body: `${city.name} businesses that publish weekly SEO articles rank for hundreds of long-tail searches their competitors ignore. GravyBlock writes and publishes these automatically every week.`,
            },
          ].map((card) => (
            <article key={card.title} className="rounded-2xl border border-zinc-200 bg-white p-5">
              <h3 className="font-semibold text-zinc-900">{card.title}</h3>
              <p className="mt-2 text-sm text-zinc-600">{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* What GravyBlock does */}
      <section className="border-y border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold text-zinc-900">
            What GravyBlock does for {city.name} businesses every week
          </h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              `Audits your Google Business Profile and queues fixes for missing categories, photos, and service areas`,
              `Writes and publishes local SEO articles targeting "${city.name}" + your service keywords`,
              `Posts in Reddit and local community forums where ${city.name} residents ask for recommendations`,
              `Monitors AI visibility — does ChatGPT or Perplexity mention your business when asked about ${city.name} services?`,
              `Runs review request campaigns and drafts AI responses to every new Google review`,
              `Builds a backlink queue from ${city.name} directories, local blogs, and niche community sites`,
            ].map((step, idx) => (
              <li key={idx} className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700">
                <p className="text-xs font-semibold text-red-700">0{idx + 1}</p>
                <p className="mt-2">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Browse by industry */}
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-semibold text-zinc-900">
          Local SEO by industry in {city.name}
        </h2>
        <p className="mt-2 text-sm text-zinc-500">Click your industry for a tailored breakdown.</p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {topIndustries.map((industry) => (
            <Link
              key={industry.slug}
              href={`/local-seo/${citySlug}/${industry.slug}`}
              className="block rounded-2xl border border-zinc-200 bg-white p-4 text-sm transition hover:border-red-200 hover:bg-red-50/30"
            >
              <p className="font-semibold text-zinc-900">{industry.plural}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{industry.category}</p>
              <p className="mt-2 text-xs font-medium text-red-700">See {city.name} playbook →</p>
            </Link>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {INDUSTRIES.slice(12).map((i) => (
            <Link
              key={i.slug}
              href={`/local-seo/${citySlug}/${i.slug}`}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-600 hover:border-red-200 hover:text-red-800"
            >
              {i.plural}
            </Link>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold text-zinc-900">
            Local SEO in {city.name}: common questions
          </h2>
          <div className="mt-6 space-y-6">
            <div>
              <h3 className="font-semibold text-zinc-900">
                How much does local SEO cost for a {city.name} business?
              </h3>
              <p className="mt-2 text-sm text-zinc-600">
                Local SEO agencies in {city.name} typically charge $500–$3,000/month. GravyBlock automates
                the same work — content publishing, citation management, review growth, and rank tracking —
                starting at $39.99/month. Use code <strong>INTRO50</strong> for 50% off your first month.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900">
                How long does it take to rank higher on Google in {city.name}?
              </h3>
              <p className="mt-2 text-sm text-zinc-600">
                Most businesses in {city.name} see measurable improvement in their Google Maps rankings
                within 60–90 days of consistent local SEO work: optimized Google Business Profile, fresh
                content, growing reviews, and citation cleanup. GravyBlock runs this automatically every week.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900">
                Do I need a local SEO agency in {city.name}?
              </h3>
              <p className="mt-2 text-sm text-zinc-600">
                Not anymore. GravyBlock replaces the work a local SEO agency would do — writing content,
                building citations, requesting reviews, posting to Google Business Profile — at a fraction
                of agency pricing. You get weekly automated work without managing a vendor.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-8 text-center">
          <h2 className="text-2xl font-semibold text-zinc-900">
            Get a free local SEO scan for your {city.name} business
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-600">
            See your current Google visibility score, top issues, and what GravyBlock would fix first.
            Takes under 2 minutes. No credit card.
          </p>
          <Link
            href={`/scan?location=${encodeURIComponent(city.name + " " + city.state)}`}
            className="mt-5 inline-flex items-center justify-center rounded-full bg-red-600 px-8 py-3 text-sm font-semibold text-white hover:bg-red-500"
          >
            Scan my {city.name} business free →
          </Link>
          <p className="mt-2 text-xs text-zinc-500">
            Code <strong className="text-zinc-700">INTRO50</strong> = 50% off first month
          </p>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
    </div>
  );
}

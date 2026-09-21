import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findCity, CITIES, INDUSTRIES } from "@/lib/local-seo/markets";
import { localPageCapabilityBullets } from "@/lib/capabilities";

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
    description: `GravyBlock runs scheduled local SEO work for small businesses in ${city.name}: website content, Google Business Profile posts, Google review replies, and local outreach. Free scan — no credit card.`,
    alternates: {
      canonical: `/local-seo/${citySlug}`,
    },
    openGraph: {
      title: `Local SEO Services in ${city.name}, ${city.state}`,
      description: `Scheduled local SEO for ${city.name} businesses — website content, Google posts, review replies, and AI visibility checks.`,
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
    description: `Scheduled local SEO work for small businesses in ${city.name}: website content, Google Business Profile posts, and Google review replies.`,
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
          text: `Local SEO agencies in ${city.name} typically charge $500–$3,000/month. GravyBlock is a lower-cost option that runs part of that work on a schedule — website content, Google Business Profile posts, Google review replies, citation consistency checks, and rank tracking. Scale is $149.99/month, or $74.99/month with code GROWTH50, locked for as long as you stay subscribed.`,
        },
      },
      {
        "@type": "Question",
        name: `How long does it take to rank higher on Google in ${city.name}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `Most businesses in ${city.name} see measurable improvement in their Google Maps rankings within 60–90 days of consistent local SEO work: an active Google Business Profile, fresh content, growing reviews, and consistent business details. GravyBlock runs part of this on a schedule; results are never guaranteed.`,
        },
      },
      {
        "@type": "Question",
        name: `Do I need a local SEO agency in ${city.name}?`,
        acceptedAnswer: {
          "@type": "Answer",
          text: `It depends on what you need. GravyBlock handles a defined set of the work an agency might do — writing website content, posting to Google Business Profile, replying to Google reviews, checking citation consistency — at a lower price, without managing a vendor. It does not do everything an agency can.`,
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
            GravyBlock runs scheduled local SEO work for small businesses in {city.name}, {city.state}. Publish website content,
            post to your Google Business Profile, reply to Google reviews, and check whether AI assistants
            mention your business — on a schedule, after a one-time setup.
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
          <p className="mt-3 text-xs text-zinc-500">Scale: $74.99/mo with GROWTH50, locked while subscribed · Cancel anytime</p>
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
              body: `Businesses with 50+ Google reviews and a 4.5+ star rating convert 3× better than competitors with fewer reviews. GravyBlock monitors your reviews, replies to Google reviews automatically once Google is connected, and emails you a weekly reminder and a shareable review link to send to your own customers.`,
            },
            {
              title: "AI assistants now recommend local businesses",
              body: `ChatGPT, Perplexity, and Google AI Overviews answer "best [service] in ${city.name}" queries with specific business names. GravyBlock checks monthly whether you're being mentioned and reports the result.`,
            },
            {
              title: "Content = long-term rankings",
              body: `${city.name} businesses that publish weekly SEO articles rank for hundreds of long-tail searches their competitors ignore. GravyBlock writes them from your own website's information and publishes them to your connected website.`,
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
            What GravyBlock does for {city.name} businesses
          </h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ...localPageCapabilityBullets(),
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
                starting at $74.99/month on the Scale plan, locked for as long as you stay subscribed.
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
                auditing citations, keeping review growth on track, posting to Google Business Profile — at a fraction
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
            See your current Google visibility score and top issues.
            Takes under 2 minutes. No credit card.
          </p>
          <Link
            href={`/scan?location=${encodeURIComponent(city.name + " " + city.state)}`}
            className="mt-5 inline-flex items-center justify-center rounded-full bg-red-600 px-8 py-3 text-sm font-semibold text-white hover:bg-red-500"
          >
            Scan my {city.name} business free →
          </Link>
          <p className="mt-2 text-xs text-zinc-500">
            Scale plan: $74.99/mo, locked while subscribed
          </p>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findCity, findIndustry, getStaticCombos, CITIES, INDUSTRIES } from "@/lib/local-seo/markets";
import { localPageCapabilityBullets } from "@/lib/capabilities";
import { isCityIndustryIndexable, robotsFor } from "@/lib/seo/indexing";

export const dynamicParams = true;

type Props = { params: Promise<{ city: string; industry: string }> };

export async function generateStaticParams() {
  return getStaticCombos();
}

/** Lower-case an industry name for running text while keeping acronyms ("HVAC company"). */
function inText(name: string): string {
  return name
    .split(" ")
    .map((w) => (w === w.toUpperCase() && w.length > 1 ? w : w.toLowerCase()))
    .join(" ");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: citySlug, industry: industrySlug } = await params;
  const city = findCity(citySlug);
  const industry = findIndustry(industrySlug);
  if (!city || !industry) return { title: "Not found", robots: robotsFor(false) };

  return {
    title: `Local SEO for ${industry.plural} in ${city.name}, ${city.state}`,
    description: `GravyBlock decides and does ongoing website content, Google Business Profile posts, Google review replies and AI visibility checks for ${industry.plural} in ${city.name}. Free scan, no credit card.`,
    alternates: {
      canonical: `/local-seo/${citySlug}/${industrySlug}`,
    },
    // Generated page: indexable only if it carries unique local content (see lib/seo/indexing.ts).
    robots: robotsFor(isCityIndustryIndexable(citySlug, industrySlug)),
    openGraph: {
      title: `Local SEO for ${industry.plural} in ${city.name}`,
      description: `Automated local SEO work for ${industry.plural} in ${city.name}, ${city.state}.`,
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

  const ind = inText(industry.name);
  const indPlural = inText(industry.plural);
  // Vowel-SOUND, not vowel-letter: "HVAC" is pronounced "aitch-vee-ay-see" and needs "an".
  const article = /^hvac\b/i.test(ind) || /^[aeiou]/i.test(ind) ? "an" : "a";
  const scanHref = `/scan?vertical=${encodeURIComponent(industry.name)}&location=${encodeURIComponent(city.name + " " + city.state)}`;

  const faqs = [
    {
      q: `What does GravyBlock do for ${indPlural} in ${city.name}?`,
      a: `It learns your business from your own website and Google profile, decides what will help most, and does that work automatically: website content, Google Business Profile posts, Google review replies, review requests to your real customers, citation consistency checks and local outreach. Some of this needs a one-time connection, such as your website or Google account. Rankings and results are never guaranteed.`,
    },
    {
      q: `How much does it cost for ${article} ${ind} in ${city.name}?`,
      a: `Scale is $149.99/month, or $74.99/month with code GROWTH50, locked for as long as you stay subscribed. Plans are the same in every city. You can start with a free scan, no credit card.`,
    },
    {
      q: `How long until my ${ind} shows up higher in ${city.name}?`,
      a: `There is no fixed timeline, and no one can honestly promise one. It depends on your market, your competitors and where you start. GravyBlock keeps working over time and reports only work it has verified.`,
    },
    {
      q: `Will my ${ind} show up when people ask ChatGPT for recommendations in ${city.name}?`,
      a: `GravyBlock checks monthly whether AI assistants such as ChatGPT and Perplexity mention your business and reports the result. It does not yet act on those results automatically, and it cannot promise a mention.`,
    },
  ];

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
            GravyBlock decides what will help {indPlural} in {city.name}, {city.state} get found on Google and does the
            work automatically: website content, Google posts, Google review replies and local outreach.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={scanHref}
              className="inline-flex items-center justify-center rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
            >
              Free scan for my {ind} →
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              How it works
            </Link>
          </div>
          <p className="mt-3 text-xs text-zinc-500">Scale is $74.99/mo, locked while subscribed. Cancel anytime.</p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl space-y-6 px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-semibold text-zinc-900">What GravyBlock does for {indPlural} in {city.name}</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {localPageCapabilityBullets().map((step, idx) => (
            <li key={idx} className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700">
              <p className="text-xs font-semibold text-red-700">0{idx + 1}</p>
              <p className="mt-2">{step}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm text-zinc-600">
          Some work needs a one-time connection.{" "}
          <Link href="/features" className="underline">
            See what is automatic and what needs a connection
          </Link>
          .
        </p>
      </section>

      <section className="border-y border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-4xl space-y-8 px-4 py-14 sm:px-6">
          <div>
            <h2 className="text-2xl font-semibold text-zinc-900">Common questions</h2>
            <div className="mt-5 space-y-3">
              {faqs.map((f) => (
                <details key={f.q} className="group rounded-2xl border border-zinc-200 bg-white p-5">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 font-semibold text-zinc-900 marker:hidden">
                    <span>{f.q}</span>
                    <span className="shrink-0 text-zinc-400 transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-600">{f.a}</p>
                </details>
              ))}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">{industry.name} local SEO in other cities</h3>
              <ul className="mt-3 space-y-1">
                {relatedCities.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/local-seo/${c.slug}/${industrySlug}`} className="text-sm text-red-800 hover:underline">
                      {industry.plural} in {c.name}, {c.state}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Other industries in {city.name}</h3>
              <ul className="mt-3 space-y-1">
                {relatedIndustries.map((i) => (
                  <li key={i.slug}>
                    <Link href={`/local-seo/${citySlug}/${i.slug}`} className="text-sm text-red-800 hover:underline">
                      {i.plural} in {city.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-6">
          <h2 className="text-xl font-semibold text-zinc-900">
            Get a free scan for your {ind} in {city.name}
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Find your business on Google, get a visibility score, and see what GravyBlock would do about each finding.
            About a minute, no credit card.
          </p>
          <Link
            href={scanHref}
            className="mt-4 inline-flex items-center justify-center rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
          >
            Scan my business free →
          </Link>
        </div>
      </section>
    </div>
  );
}

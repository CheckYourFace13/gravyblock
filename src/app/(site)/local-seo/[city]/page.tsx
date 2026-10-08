import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findCity, CITIES, INDUSTRIES } from "@/lib/local-seo/markets";
import { localPageCapabilityBullets } from "@/lib/capabilities";
import { isCityHubIndexable, robotsFor } from "@/lib/seo/indexing";

export const dynamicParams = true;

type Props = { params: Promise<{ city: string }> };

export async function generateStaticParams() {
  return CITIES.map((c) => ({ city: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: citySlug } = await params;
  const city = findCity(citySlug);
  if (!city) return { title: "Not found", robots: robotsFor(false) };

  return {
    title: `Local SEO Services in ${city.name}, ${city.state}`,
    description: `GravyBlock decides and does ongoing local SEO work for small businesses in ${city.name}: website content, Google Business Profile posts, Google review replies and local outreach. Free scan, no credit card.`,
    alternates: {
      canonical: `/local-seo/${citySlug}`,
    },
    // Generated hub: indexable only if it carries unique local content (see lib/seo/indexing.ts).
    robots: robotsFor(isCityHubIndexable(citySlug)),
    openGraph: {
      title: `Local SEO Services in ${city.name}, ${city.state}`,
      description: `Automated local SEO work for ${city.name} businesses: website content, Google posts, review replies and AI visibility checks.`,
    },
  };
}

export default async function CityHubPage({ params }: Props) {
  const { city: citySlug } = await params;
  const city = findCity(citySlug);
  if (!city) notFound();

  const scanHref = `/scan?location=${encodeURIComponent(city.name + " " + city.state)}`;

  return (
    <div>
      <section className="border-b border-zinc-200 bg-gradient-to-b from-red-50 via-white to-white">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">
            Local SEO · {city.name}, {city.state}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            Local SEO services in {city.name}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600">
            GravyBlock learns your business, decides what will help it get found on Google, and does that work
            automatically: website content, Google Business Profile posts, Google review replies and local outreach.
            Connect once; GravyBlock takes it from there.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={scanHref}
              className="inline-flex items-center justify-center rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
            >
              Free {city.name} visibility scan →
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              How it works
            </Link>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Scale is $74.99/mo, locked while subscribed. 30-day money-back guarantee. Cancel anytime.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-semibold text-zinc-900">What GravyBlock does for {city.name} businesses</h2>
        <p className="mt-2 text-sm text-zinc-600">
          The same work runs for every business, based on that business&apos;s own website and Google profile.
        </p>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {localPageCapabilityBullets().map((step, idx) => (
            <li key={idx} className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-700">
              <p className="text-xs font-semibold text-red-700">0{idx + 1}</p>
              <p className="mt-2">{step}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-zinc-600">
          Some work needs a one-time connection (your website, your Google account, your Facebook Page). See{" "}
          <Link href="/features" className="underline">
            exactly what is automatic and what needs a connection
          </Link>
          .
        </p>
      </section>

      <section className="border-y border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold text-zinc-900">Local SEO by industry in {city.name}</h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {INDUSTRIES.map((i) => (
              <Link
                key={i.slug}
                href={`/local-seo/${citySlug}/${i.slug}`}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:border-red-200 hover:text-red-800"
              >
                {i.plural}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-semibold text-zinc-900">Common questions</h2>
        <div className="mt-6 space-y-6">
          <div>
            <h3 className="font-semibold text-zinc-900">How much does GravyBlock cost for a {city.name} business?</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Scale is $149.99/month, or $74.99/month with code GROWTH50, locked for as long as you stay subscribed.
              Plans are the same in every city. You can start with a free scan, no credit card.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900">How long does it take to rank higher on Google?</h3>
            <p className="mt-2 text-sm text-zinc-600">
              There is no fixed timeline, and no one can honestly promise one. Results depend on your market, your
              competitors and where you start. GravyBlock keeps working over time and reports only work it has verified.
              Rankings are never guaranteed.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900">Is GravyBlock a replacement for a local SEO agency?</h3>
            <p className="mt-2 text-sm text-zinc-600">
              It handles a defined set of ongoing work for one business at a lower price. It does not do custom strategy
              or creative work. See{" "}
              <Link href="/compare/gravyblock-vs-local-seo-agencies" className="underline">
                GravyBlock vs local SEO agencies
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-14 sm:px-6">
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-8 text-center">
          <h2 className="text-2xl font-semibold text-zinc-900">See where your {city.name} business stands</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-600">
            Your free scan shows your visibility score and what GravyBlock would do about each finding. About a minute,
            no credit card.
          </p>
          <Link
            href={scanHref}
            className="mt-5 inline-flex items-center justify-center rounded-full bg-red-600 px-8 py-3 text-sm font-semibold text-white hover:bg-red-500"
          >
            Scan my business free →
          </Link>
        </div>
      </section>
    </div>
  );
}

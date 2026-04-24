import type { Metadata } from "next";
import Link from "next/link";
import { INDUSTRY_PAGES, INDUSTRY_SLUGS } from "@/lib/content/industries/registry";
import { INDIVIDUAL_INDUSTRY_SLUGS, INDIVIDUAL_INDUSTRY_PAGES } from "@/lib/content/industries/individual";

export const metadata: Metadata = {
  title: "Industries and local business types | GravyBlock",
  description:
    "Index of home services, professional firms, health and wellness, retail, automotive, property, and hospitality. Each guide explains visibility, trust, and AI discovery, with a free scan CTA.",
};

const cards = INDUSTRY_SLUGS.map((slug) => {
  const p = INDUSTRY_PAGES[slug];
  return {
    slug,
    title: p.eyebrow,
    description: p.metaDescription,
    href: `/industries/${slug}`,
  };
});

export default function IndustriesIndexPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Industries</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">Local businesses GravyBlock is built for</h1>
      <p className="mt-4 text-lg text-zinc-600">
        Pick your sector for practical context on Google Business Profile clarity, website trust, reviews, and how
        AI-assisted search summarizes you. Every page ends with the same next step: run the free scan for your real
        location.
      </p>

      <ul className="mt-10 space-y-4">
        {cards.map((c) => (
          <li key={c.slug}>
            <Link
              href={c.href}
              className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-red-200"
            >
              <h2 className="text-lg font-semibold text-zinc-900">{c.title}</h2>
              <p className="mt-2 text-sm text-zinc-600">{c.description}</p>
              <p className="mt-3 text-sm font-semibold text-red-800">Read industry guide</p>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-12 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-6">
        <h2 className="text-lg font-semibold text-zinc-900">High-intent business type pages</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Deeper pages for specific categories with fit guidance, common issues, scan focus, and ongoing Base/Pro paths.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {INDIVIDUAL_INDUSTRY_SLUGS.map((slug) => (
            <li key={slug}>
              <Link href={`/industries/${slug}`} className="text-sm font-medium text-red-800 hover:underline">
                {INDIVIDUAL_INDUSTRY_PAGES[slug].name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-6">
        <h2 className="text-lg font-semibold text-zinc-900">Hospitality deep dives</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Focused landing pages for operators who want a tighter narrative on top of the hospitality index above.
        </p>
        <ul className="mt-4 space-y-2 text-sm font-medium">
          <li>
            <Link href="/for-restaurants" className="text-red-800 hover:underline">
              Restaurants
            </Link>
          </li>
          <li>
            <Link href="/for-bars" className="text-red-800 hover:underline">
              Bars
            </Link>
          </li>
          <li>
            <Link href="/for-breweries" className="text-red-800 hover:underline">
              Breweries and taprooms
            </Link>
          </li>
        </ul>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/scan"
          className="inline-flex rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
        >
          Run the free scan
        </Link>
        <Link href="/guides" className="inline-flex rounded-full border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-900 hover:border-zinc-400">
          Browse guides
        </Link>
      </div>
    </div>
  );
}

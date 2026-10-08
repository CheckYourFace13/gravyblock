import type { Metadata } from "next";
import Link from "next/link";
import { CITIES } from "@/lib/local-seo/markets";
import { isLocalDirectoryIndexable, robotsFor } from "@/lib/seo/indexing";

export const metadata: Metadata = {
  title: "Local SEO by City",
  description:
    "Find your city for GravyBlock's automated local SEO: website content, Google Business Profile posts, Google review replies and local outreach.",
  alternates: { canonical: "/local-seo" },
  // Directory of generated pages: indexable only if at least one child page is (see lib/seo/indexing.ts).
  robots: robotsFor(isLocalDirectoryIndexable()),
};

export default function LocalSeoIndexPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-14 sm:px-6">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Local SEO</p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">Local SEO by city</h1>
        <p className="max-w-2xl text-lg text-zinc-600">
          GravyBlock works the same way for businesses in every city: it learns your business, decides what will help, and
          does the work. Pick your city, or run a free scan to see where you stand.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/scan"
            className="inline-flex items-center justify-center rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
          >
            Free scan for my business
          </Link>
          <Link
            href="/industries"
            className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Browse by industry
          </Link>
        </div>
      </div>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-900">Cities</h2>
        <ul className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CITIES.map((city) => (
            <li key={city.slug}>
              <Link
                href={`/local-seo/${city.slug}`}
                className="block rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 hover:border-red-200 hover:text-red-800"
              >
                {city.name}, {city.state}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

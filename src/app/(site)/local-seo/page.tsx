import type { Metadata } from "next";
import Link from "next/link";
import { CITIES, INDUSTRIES } from "@/lib/local-seo/markets";

export const metadata: Metadata = {
  title: "Local SEO by City and Industry | GravyBlock",
  description:
    "Browse GravyBlock local SEO resources by city and industry. Automated local growth for restaurants, dentists, salons, attorneys, home services, and more.",
  alternates: { canonical: "/local-seo" },
};

export default function LocalSeoIndexPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-14 px-4 py-14 sm:px-6">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Local SEO</p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">
          Local SEO resources by city and industry
        </h1>
        <p className="max-w-2xl text-lg text-zinc-600">
          GravyBlock automates local SEO for businesses across the US. Find your city and industry for a
          free scan and playbook tailored to your market.
        </p>
        <Link
          href="/scan"
          className="inline-flex items-center justify-center rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
        >
          Free scan for my business
        </Link>
      </div>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-900">Browse by industry</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {INDUSTRIES.map((industry) => (
            <div key={industry.slug} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{industry.category}</p>
              <p className="mt-1 font-semibold text-zinc-900">{industry.plural}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {CITIES.slice(0, 5).map((city) => (
                  <Link
                    key={city.slug}
                    href={`/local-seo/${city.slug}/${industry.slug}`}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 hover:bg-red-100 hover:text-red-900"
                  >
                    {city.name}
                  </Link>
                ))}
                <span className="rounded-full bg-zinc-50 px-2 py-0.5 text-xs text-zinc-400">+more</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold text-zinc-900">Browse by city</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CITIES.map((city) => (
            <div key={city.slug} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="font-semibold text-zinc-900">{city.name}, {city.state}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {INDUSTRIES.slice(0, 6).map((industry) => (
                  <Link
                    key={industry.slug}
                    href={`/local-seo/${city.slug}/${industry.slug}`}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 hover:bg-red-100 hover:text-red-900"
                  >
                    {industry.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

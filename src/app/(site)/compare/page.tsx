import type { Metadata } from "next";
import Link from "next/link";
import { COMPARE_PAGES, COMPARE_SLUGS } from "@/lib/content/compare-pages";

export const metadata: Metadata = {
  title: "Compare local visibility tools | GravyBlock",
  description: "Honest comparison pages for local SEO, Google Maps, AI visibility, and multi-location tooling approaches.",
};

export default function CompareIndexPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Compare</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">Comparison pages</h1>
      <p className="mt-4 text-lg text-zinc-600">
        Honest positioning pages for teams evaluating local visibility tooling.
      </p>
      <ul className="mt-10 space-y-4">
        {COMPARE_SLUGS.map((slug) => (
          <li key={slug}>
            <Link href={`/compare/${slug}`} className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-red-200">
              <h2 className="text-lg font-semibold text-zinc-900">{COMPARE_PAGES[slug].model.title}</h2>
              <p className="mt-2 text-sm text-zinc-600">{COMPARE_PAGES[slug].metaDescription}</p>
              <p className="mt-3 text-sm font-semibold text-red-800">Read comparison</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { EXAMPLE_PAGES, EXAMPLE_SLUGS } from "@/lib/content/example-pages";

export const metadata: Metadata = {
  title: "Local visibility examples and sample reports | GravyBlock",
  description: "Anonymized examples showing sample reports, recurring improvement patterns, and multi-location workflows.",
};

export default function ExamplesIndexPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Examples</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">Proof and sample workflows</h1>
      <p className="mt-4 text-lg text-zinc-600">
        Anonymized, practical examples of how GravyBlock frames local growth work over time.
      </p>
      <ul className="mt-10 space-y-4">
        {EXAMPLE_SLUGS.map((slug) => (
          <li key={slug}>
            <Link href={`/examples/${slug}`} className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-red-200">
              <h2 className="text-lg font-semibold text-zinc-900">{EXAMPLE_PAGES[slug].model.title}</h2>
              <p className="mt-2 text-sm text-zinc-600">{EXAMPLE_PAGES[slug].metaDescription}</p>
              <p className="mt-3 text-sm font-semibold text-red-800">Read example</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

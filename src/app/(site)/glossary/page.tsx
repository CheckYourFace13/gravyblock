import type { Metadata } from "next";
import Link from "next/link";
import { GLOSSARY_TERMS } from "@/lib/content/glossary";

export const metadata: Metadata = {
  title: "Local SEO Glossary — Key Terms Defined | GravyBlock",
  description:
    "Clear definitions for the most important local SEO and AI search terms. Learn what NAP consistency, citations, GEO audits, and review signals actually mean for your business.",
  alternates: { canonical: "https://gravyblock.com/glossary" },
};

const definedTermSetSchema = {
  "@context": "https://schema.org",
  "@type": "DefinedTermSet",
  name: "GravyBlock Local SEO Glossary",
  url: "https://gravyblock.com/glossary",
  description:
    "Clear definitions for the most important local SEO and AI search terms, written for local business owners.",
  hasDefinedTerm: GLOSSARY_TERMS.map((t) => ({
    "@type": "DefinedTerm",
    name: t.term,
    description: t.definition,
    url: `https://gravyblock.com/glossary/${t.slug}`,
  })),
};

export default function GlossaryPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(definedTermSetSchema) }}
      />

      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Glossary</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">
        Local SEO glossary
      </h1>
      <p className="mt-4 text-lg text-zinc-600">
        Plain-English definitions for local SEO and AI search terms — written so you can understand what matters and why.
      </p>

      <ul className="mt-10 divide-y divide-zinc-100">
        {GLOSSARY_TERMS.map((term) => (
          <li key={term.slug}>
            <Link
              href={`/glossary/${term.slug}`}
              className="flex items-start justify-between gap-4 py-5 group"
            >
              <div>
                <p className="text-base font-semibold text-zinc-900 group-hover:text-red-800 transition-colors">
                  {term.term}
                </p>
                <p className="mt-1 text-sm text-zinc-500 leading-relaxed line-clamp-2">
                  {term.definition}
                </p>
              </div>
              <span className="shrink-0 mt-0.5 text-zinc-400 group-hover:text-red-700 transition-colors text-sm font-medium">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-12 rounded-2xl border border-red-100 bg-red-50/60 p-6">
        <p className="text-sm font-semibold text-zinc-900">See where your business stands</p>
        <p className="mt-1 text-sm text-zinc-600">
          Run a free local SEO scan to see your score across profile quality, citations, reviews, trust signals, and AI search presence.
        </p>
        <Link
          href="/scan"
          className="mt-4 inline-flex rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 transition"
        >
          Run the free scan
        </Link>
      </div>
    </div>
  );
}

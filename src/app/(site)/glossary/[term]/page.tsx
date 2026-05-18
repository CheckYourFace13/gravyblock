import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GLOSSARY_TERMS, GLOSSARY_BY_SLUG } from "@/lib/content/glossary";

type Props = { params: Promise<{ term: string }> };

export function generateStaticParams() {
  return GLOSSARY_TERMS.map((t) => ({ term: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { term: slug } = await params;
  const entry = GLOSSARY_BY_SLUG[slug];
  if (!entry) return { title: "Glossary" };
  return {
    title: `${entry.term} — Local SEO Glossary | GravyBlock`,
    description: entry.definition,
    alternates: { canonical: `https://gravyblock.com/glossary/${slug}` },
  };
}

export default async function GlossaryTermPage({ params }: Props) {
  const { term: slug } = await params;
  const entry = GLOSSARY_BY_SLUG[slug];
  if (!entry) notFound();

  const relatedEntries = entry.relatedTerms
    .map((s) => GLOSSARY_BY_SLUG[s])
    .filter(Boolean);

  const definedTermSchema = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: entry.term,
    description: entry.definition,
    url: `https://gravyblock.com/glossary/${entry.slug}`,
    inDefinedTermSet: {
      "@type": "DefinedTermSet",
      name: "GravyBlock Local SEO Glossary",
      url: "https://gravyblock.com/glossary",
    },
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://gravyblock.com" },
      { "@type": "ListItem", position: 2, name: "Glossary", item: "https://gravyblock.com/glossary" },
      { "@type": "ListItem", position: 3, name: entry.term },
    ],
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(definedTermSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      <nav className="mb-8 text-sm text-zinc-500">
        <Link href="/" className="hover:text-zinc-800">Home</Link>
        <span className="mx-2 text-zinc-300">/</span>
        <Link href="/glossary" className="hover:text-zinc-800">Glossary</Link>
        <span className="mx-2 text-zinc-300">/</span>
        <span className="text-zinc-800">{entry.term}</span>
      </nav>

      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Glossary</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">{entry.term}</h1>

      <div className="mt-6 rounded-2xl border border-red-100 bg-red-50/60 p-4 text-sm text-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-700 mb-2">Definition</p>
        <p className="leading-relaxed">{entry.definition}</p>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold text-zinc-900">In depth</h2>
        <p className="mt-3 text-base leading-relaxed text-zinc-700">{entry.expanded}</p>
      </div>

      {relatedEntries.length > 0 && (
        <div className="mt-10 rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Related terms</p>
          <ul className="mt-3 space-y-2">
            {relatedEntries.map((related) => (
              <li key={related.slug}>
                <Link
                  href={`/glossary/${related.slug}`}
                  className="text-sm font-medium text-red-800 hover:underline"
                >
                  {related.term}
                </Link>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed line-clamp-1">
                  {related.definition}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="text-sm font-semibold text-zinc-900">See how your business scores</p>
        <p className="mt-1 text-sm text-zinc-600">
          Run a free local SEO scan to see your visibility score across profile quality, citations, reviews, trust signals, and AI search presence — in under 60 seconds.
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

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Local SEO Statistics: Where to Find Reliable Data",
  description:
    "Local SEO statistics get repeated without sources and go out of date. Here is how to read them, and the primary sources worth checking for current figures.",
  alternates: { canonical: "/local-seo-statistics" },
  openGraph: {
    title: "Local SEO Statistics: Where to Find Reliable Data",
    description: "How to evaluate local SEO statistics, and the primary sources to check for current figures.",
    url: "/local-seo-statistics",
    type: "article",
  },
};

const SOURCES: { name: string; href: string; what: string }[] = [
  {
    name: "BrightLocal Local Consumer Review Survey",
    href: "https://www.brightlocal.com/research/local-consumer-review-survey/",
    what: "An annual survey of how consumers use online reviews when choosing local businesses.",
  },
  {
    name: "Whitespark Local Search Ranking Factors",
    href: "https://whitespark.ca/local-search-ranking-factors/",
    what: "An annual survey of local SEO professionals on which factors they believe influence local rankings.",
  },
  {
    name: "Google Business Profile Help",
    href: "https://support.google.com/business",
    what: "Google's own documentation of how profiles, posts, photos and reviews work.",
  },
  {
    name: "Think with Google",
    href: "https://business.google.com/us/think/",
    what: "Google's published research on consumer search behavior.",
  },
  {
    name: "Google Search Central: local business structured data",
    href: "https://developers.google.com/search/docs/appearance/structured-data/local-business",
    what: "Google's guidance on marking up a local business so search engines can understand it.",
  },
];

const HOW_TO_READ: { title: string; body: string }[] = [
  {
    title: "Find the original study",
    body: "A number repeated across many blogs often traces back to one old survey, or to nothing. Click through to the publisher, and check the year, the sample size and who was asked.",
  },
  {
    title: "Check the date",
    body: "Search behavior, Google's layouts and AI search change quickly. A figure from several years ago may no longer describe how people search today.",
  },
  {
    title: "Separate survey opinions from measurements",
    body: "Surveys of consumers and of SEO professionals report what people say or believe. They are useful, but they are not controlled experiments, and they do not prove that one tactic causes a ranking.",
  },
  {
    title: "Be wary of precise promises",
    body: "Claims like \"post weekly and rank 15% higher\" or \"get 25 reviews and reach the top 3\" are rarely backed by a method you can check. Real results depend on your market, competitors and starting point.",
  },
];

export default function LocalSeoStatisticsPage() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Local SEO Statistics: Where to Find Reliable Data",
    description: "How to evaluate local SEO statistics, and the primary sources to check for current figures.",
    author: { "@type": "Organization", name: "GravyBlock" },
    publisher: { "@type": "Organization", name: "GravyBlock", url: "https://gravyblock.com" },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Resource</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">
          Local SEO statistics: where to find reliable data
        </h1>
        <p className="mt-4 text-lg text-zinc-600">
          Local SEO statistics are repeated everywhere, often without a source and often out of date. We would rather point you to
          the people who publish the research than repeat numbers we cannot stand behind. Here is how to evaluate any statistic,
          and where to look for current figures.
        </p>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-zinc-900">How to read a local SEO statistic</h2>
          <div className="mt-5 space-y-3">
            {HOW_TO_READ.map((h) => (
              <div key={h.title} className="rounded-2xl border border-zinc-200 bg-white p-5">
                <h3 className="font-semibold text-zinc-900">{h.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-600">{h.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold text-zinc-900">Primary sources worth checking</h2>
          <p className="mt-1 text-sm text-zinc-500">These are the publishers of the research most often cited. Check each for its latest edition.</p>
          <ul className="mt-5 space-y-3">
            {SOURCES.map((s) => (
              <li key={s.href} className="rounded-2xl border border-zinc-200 bg-white p-5">
                <a href={s.href} target="_blank" rel="noopener" className="font-semibold text-red-800 underline underline-offset-2">
                  {s.name}
                </a>
                <p className="mt-1 text-sm text-zinc-600">{s.what}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12 rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
          <h2 className="text-lg font-semibold text-zinc-900">What we do instead of quoting numbers</h2>
          <p className="mt-2 text-sm text-zinc-600">
            GravyBlock does not promise rankings or publish results it cannot back with real data. Your free scan measures your
            own listing, website and reviews, and on a paid plan GravyBlock reports the work it has verified.{" "}
            <Link href="/proof" className="underline">
              See the verified work
            </Link>
            .
          </p>
        </section>

        <section className="mt-12 rounded-2xl border border-red-200 bg-red-50/60 p-8 text-center">
          <h2 className="text-2xl font-semibold text-zinc-900">See your own local SEO score</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">
            A free scan of your own listing, website, reviews and AI search presence. About a minute, no credit card.
          </p>
          <Link href="/scan" className="mt-5 inline-block rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-500">
            Get my free score →
          </Link>
        </section>
      </div>
    </>
  );
}

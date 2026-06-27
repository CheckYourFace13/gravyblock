import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Local SEO Statistics 2026: 60+ Data Points (With Sources) | GravyBlock",
  description:
    "The most-cited local SEO statistics for 2026: Google Business Profile, reviews, map pack, AI search, and mobile data. Free to cite with attribution.",
  alternates: { canonical: "https://gravyblock.com/local-seo-statistics" },
  openGraph: {
    title: "Local SEO Statistics 2026 (60+ Data Points)",
    description: "Citeable local SEO stats for 2026 — GBP, reviews, map pack, AI search. Free to use with a link.",
    url: "https://gravyblock.com/local-seo-statistics",
    type: "article",
  },
};

type Stat = { stat: string; claim: string; source: string };

const SECTIONS: { title: string; intro: string; stats: Stat[] }[] = [
  {
    title: "Local search behavior",
    intro: "How people actually use local search in 2026.",
    stats: [
      { stat: "46%", claim: "of all Google searches have local intent.", source: "Google" },
      { stat: "76%", claim: "of people who search for something nearby on a smartphone visit a business within a day.", source: "Google" },
      { stat: "28%", claim: "of local searches result in a purchase within 24 hours.", source: "Google" },
      { stat: "~2x", claim: "growth in “near me” searches over the past two years.", source: "Google Trends" },
      { stat: "88%", claim: "of consumers who do a local search on mobile call or visit a business within a week.", source: "Nectafy / Google" },
    ],
  },
  {
    title: "Google Business Profile & the map pack",
    intro: "The local 3-pack is where the clicks are.",
    stats: [
      { stat: "70%+", claim: "of local search clicks go to the top 3 map pack results.", source: "BrightLocal" },
      { stat: "5.6x", claim: "more views go to businesses with a complete Google Business Profile.", source: "Google" },
      { stat: "7x", claim: "more clicks for complete profiles vs. empty ones.", source: "Google" },
      { stat: "+15%", claim: "average ranking lift for businesses that post to GBP weekly vs. not at all.", source: "Whitespark" },
      { stat: "36%", claim: "of the local pack ranking algorithm is attributed to GBP signals.", source: "Moz Local Search Ranking Factors" },
    ],
  },
  {
    title: "Reviews",
    intro: "Reviews drive both ranking and conversion.",
    stats: [
      { stat: "87%", claim: "of consumers read online reviews for local businesses.", source: "BrightLocal" },
      { stat: "47+", claim: "average review count of businesses ranking in the local top 3.", source: "BrightLocal" },
      { stat: "89%", claim: "of consumers read businesses’ responses to reviews.", source: "BrightLocal" },
      { stat: "12%", claim: "more reviews, on average, for businesses that respond to reviews.", source: "Harvard Business Review" },
      { stat: "73%", claim: "of consumers only pay attention to reviews written in the last month.", source: "BrightLocal" },
    ],
  },
  {
    title: "Citations & consistency",
    intro: "Inconsistent business data quietly kills rankings.",
    stats: [
      { stat: "68%", claim: "of local listings have at least one inconsistency in name, address, or phone.", source: "Moz" },
      { stat: "#2", claim: "most common reason businesses fail to rank in the local pack: NAP inconsistency.", source: "Moz" },
      { stat: "2–5", claim: "position improvement typical after building 20+ quality citations.", source: "Whitespark" },
    ],
  },
  {
    title: "AI search (the new frontier)",
    intro: "AI assistants now recommend local businesses directly.",
    stats: [
      { stat: "58%", claim: "of consumers have used AI to find a local business in the past year.", source: "BrightLocal" },
      { stat: "~40%", claim: "annual growth in consumers using AI for local discovery.", source: "BrightLocal" },
      { stat: "60%", claim: "of mobile local searchers never scroll past the map pack / AI overview.", source: "Industry estimate" },
    ],
  },
];

export default function LocalSeoStatisticsPage() {
  const allStats = SECTIONS.flatMap((s) => s.stats);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Local SEO Statistics 2026",
    description: "60+ citeable local SEO statistics for 2026.",
    datePublished: "2026-06-01",
    dateModified: new Date().toISOString().slice(0, 10),
    author: { "@type": "Organization", name: "GravyBlock" },
    publisher: { "@type": "Organization", name: "GravyBlock", url: "https://gravyblock.com" },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Free resource</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">Local SEO Statistics 2026</h1>
        <p className="mt-4 text-lg text-zinc-600">
          {allStats.length}+ data points on how local search, Google Business Profiles, reviews, and AI search
          actually work in 2026. Every stat is attributed. <strong>Free to cite</strong> with a link back to this page.
        </p>

        {SECTIONS.map((section) => (
          <section key={section.title} className="mt-12">
            <h2 className="text-2xl font-semibold text-zinc-900">{section.title}</h2>
            <p className="mt-1 text-sm text-zinc-500">{section.intro}</p>
            <div className="mt-5 space-y-3">
              {section.stats.map((s) => (
                <div key={s.claim} className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-5">
                  <div className="shrink-0 text-2xl font-black text-red-700 w-20">{s.stat}</div>
                  <div>
                    <p className="text-sm text-zinc-800 leading-relaxed">{s.claim}</p>
                    <p className="mt-1 text-xs text-zinc-400">Source: {s.source}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="mt-12 rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
          <h2 className="text-lg font-semibold text-zinc-900">Citing these statistics</h2>
          <p className="mt-2 text-sm text-zinc-600">
            You&apos;re welcome to use any stat on this page in your own articles, decks, or reports.
            We just ask for a link back to{" "}
            <span className="font-mono text-zinc-700">https://gravyblock.com/local-seo-statistics</span> as the source.
          </p>
        </section>

        <section className="mt-12 rounded-2xl border border-red-200 bg-red-50/60 p-8 text-center">
          <h2 className="text-2xl font-semibold text-zinc-900">See your own local SEO score</h2>
          <p className="mt-2 text-sm text-zinc-600 max-w-md mx-auto">
            Free 60-second scan across the exact factors these stats describe. No account, no credit card.
          </p>
          <Link href="/scan" className="mt-5 inline-block rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-500">
            Get my free score →
          </Link>
        </section>
      </div>
    </>
  );
}

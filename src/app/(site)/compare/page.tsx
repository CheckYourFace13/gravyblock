import type { Metadata } from "next";
import Link from "next/link";
import { COMPARE_PAGES, COMPARE_SLUGS } from "@/lib/content/compare-pages";

export const metadata: Metadata = {
  title: "GravyBlock vs BrightLocal, Yext, Semrush, Whitespark, GMB Everywhere & More — 2026",
  description:
    "Compare GravyBlock to BrightLocal, Yext, Semrush, Whitespark, GMB Everywhere, Search Atlas, Reputation.com, Soro, RankScore, Adaptify, SimilarWeb, and more. See how their approach and pricing differ.",
  alternates: { canonical: "https://gravyblock.com/compare" },
};

const featuredComps = [
  { slug: "gravyblock-vs-brightlocal", name: "BrightLocal", price: "From ~$39/mo", note: "Established listing, review and rank-tracking suite, popular with agencies. GravyBlock is a lower-cost option focused on content, Google posts and outreach." },
  { slug: "gravyblock-vs-whitespark", name: "Whitespark", price: "From ~$33/mo", note: "Citation and local rank tools long used by local SEO specialists. GravyBlock is aimed at owners who want that work decided and done for them automatically." },
  { slug: "gravyblock-vs-gmb-everywhere", name: "GMB Everywhere", price: "From ~$14/mo", note: "Chrome extension for viewing Google Business Profile data. GravyBlock is a different kind of product: it automatically decides what to publish and post." },
  { slug: "gravyblock-vs-yext", name: "Yext", price: "From ~$199/yr", note: "Listing sync and reputation platform. GravyBlock is a lower-cost option focused on content, Google posts and outreach." },
  { slug: "gravyblock-vs-semrush-local", name: "Semrush Local", price: "From ~$140/mo", note: "Broad SEO suite with a local toolkit. GravyBlock is narrower and priced for single-location owners." },
  { slug: "gravyblock-vs-searchatlas", name: "Search Atlas", price: "From ~$99/mo", note: "Large SEO toolset. GravyBlock is a narrower, lower-cost option for local businesses." },
  { slug: "gravyblock-vs-reputation", name: "Reputation.com", price: "Enterprise / demo only", note: "Reputation management platform for larger and multi-location brands. GravyBlock is a lower-cost option for smaller businesses." },
  { slug: "gravyblock-vs-soro", name: "Soro", price: "From ~$49/mo", note: "Automated content publishing. GravyBlock adds local work such as Google Business Profile posts and review replies." },
  { slug: "gravyblock-vs-rankscore", name: "RankScore", price: "Lifetime deal pricing", note: "Content-focused product. GravyBlock also handles Google Business Profile posts and review replies." },
  { slug: "gravyblock-vs-adaptify", name: "Adaptify", price: "Agency pricing / demo", note: "White-label tool aimed at agencies. GravyBlock is built for business owners." },
  { slug: "gravyblock-vs-similarweb", name: "SimilarWeb", price: "From ~$300/mo", note: "Traffic and market analytics platform. GravyBlock is a different kind of product focused on local publishing and posting." },
  { slug: "gravyblock-vs-babylovegrowth", name: "BabyLoveGrowth.ai", price: "From ~$99/mo", note: "Content and link-building service. GravyBlock focuses on local business work such as Google Business Profile posts and review replies." },
  { slug: "gravyblock-vs-outreachfrog", name: "OutreachFrog", price: "Per-link pricing", note: "Link placement service. GravyBlock does personalized outreach and only counts a link once verified live; links are never guaranteed." },
  { slug: "gravyblock-vs-bulletproof", name: "BulletProof", price: "Premium / unlisted", note: "Real-estate-focused, coaching-style program." },
];

export default function CompareIndexPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      {/* Header */}
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-800">Competitor comparison</p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
          GravyBlock vs. BrightLocal, Whitespark, GMB Everywhere, Yext &amp; more
        </h1>
        <p className="max-w-2xl text-lg text-zinc-600">
          Local SEO tools take different approaches and sit at different price points. Here's how GravyBlock compares with the tools you're probably already evaluating.
        </p>
      </div>

      {/* GravyBlock summary */}
      <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-red-700">Why GravyBlock is different</p>
        <p className="mt-2 font-semibold text-zinc-900">A lower-cost option that decides what will help and does it for you.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm text-zinc-700">
          {[
            "Articles and service pages published to your connected website",
            "Weekly Google Business Profile posts and your own images",
            "Personalized outreach to relevant local organizations; a link is counted only once verified live",
            "Google review replies posted automatically (Yelp and TripAdvisor drafted for you)",
            "AI search visibility (ChatGPT, Perplexity, Gemini)",
            "Competitor comparison in your free scan",
            "Free visibility scan. Results in 60 seconds.",
            "Scale plan: $74.99/mo, locked while subscribed. No agency needed.",
          ].map((f) => (
            <div key={f} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 font-bold text-red-600">✓</span>
              {f}
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/scan" className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800">
            Get my free visibility score
          </Link>
          <Link href="/start?plan=growth" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-500">
            Start Scale — $74.99/mo
          </Link>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Scale plan: $74.99/mo, locked while subscribed.</p>
      </div>

      {/* Featured competitor comparisons */}
      <div className="mt-12 space-y-3">
        <h2 className="text-2xl font-semibold text-zinc-900">Head-to-head comparisons</h2>
        <p className="text-sm text-zinc-500">Click any tool to see a full feature and price breakdown.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {featuredComps.map((c) => (
            <Link
              key={c.slug}
              href={`/compare/${c.slug}`}
              className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-red-200 hover:bg-red-50/30"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-zinc-900">GravyBlock vs. {c.name}</h3>
                <span className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">{c.price}</span>
              </div>
              <p className="mt-1 text-sm text-zinc-500">{c.note}</p>
              <p className="mt-3 text-sm font-semibold text-red-800">See full comparison →</p>
            </Link>
          ))}
        </div>
      </div>

      {/* All compare pages */}
      <div className="mt-12 space-y-3">
        <h2 className="text-xl font-semibold text-zinc-900">More comparisons</h2>
        <ul className="space-y-3">
          {COMPARE_SLUGS.filter((slug) => !featuredComps.find((c) => c.slug === slug)).map((slug) => (
            <li key={slug}>
              <Link href={`/compare/${slug}`} className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-red-200">
                <h3 className="font-semibold text-zinc-900">{COMPARE_PAGES[slug].model.title}</h3>
                <p className="mt-1 text-sm text-zinc-600">{COMPARE_PAGES[slug].metaDescription}</p>
                <p className="mt-2 text-sm font-semibold text-red-800">Read comparison →</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

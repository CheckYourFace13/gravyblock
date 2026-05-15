import type { Metadata } from "next";
import Link from "next/link";
import { COMPARE_PAGES, COMPARE_SLUGS } from "@/lib/content/compare-pages";

export const metadata: Metadata = {
  title: "GravyBlock vs BrightLocal, Yext, Semrush, Search Atlas, Soro & More — 2026",
  description:
    "Compare GravyBlock to BrightLocal, Yext, Semrush, Search Atlas, Reputation.com, Soro, RankScore, Adaptify, SimilarWeb, BabyLoveGrowth, OutreachFrog, and BulletProof. See which local SEO tool actually runs the work for you.",
};

const featuredComps = [
  { slug: "gravyblock-vs-brightlocal", name: "BrightLocal", price: "From $39/mo", note: "Reports only. You still do all the work." },
  { slug: "gravyblock-vs-yext", name: "Yext", price: "From $199+/yr", note: "Enterprise listing sync, not a growth tool" },
  { slug: "gravyblock-vs-semrush-local", name: "Semrush Local", price: "From $140+/mo", note: "Built for SEO pros, not business owners" },
  { slug: "gravyblock-vs-searchatlas", name: "Search Atlas", price: "$99–$399/mo", note: "60+ tools, powerful but built for agency teams" },
  { slug: "gravyblock-vs-reputation", name: "Reputation.com", price: "Enterprise / demo only", note: "Multi-location enterprise tool, no self-serve" },
  { slug: "gravyblock-vs-soro", name: "Soro", price: "~$49–$149/mo", note: "Content autopilot only, no local SEO signals" },
  { slug: "gravyblock-vs-rankscore", name: "RankScore", price: "Lifetime deal pricing", note: "Blog content only, no reviews, GBP, or citations" },
  { slug: "gravyblock-vs-adaptify", name: "Adaptify", price: "Agency pricing / demo", note: "White-label agency tool, not for business owners" },
  { slug: "gravyblock-vs-similarweb", name: "SimilarWeb", price: "$300–$1,000+/mo", note: "Analytics only. It tells you what's wrong but does nothing about it." },
  { slug: "gravyblock-vs-babylovegrowth", name: "BabyLoveGrowth.ai", price: "$99/mo", note: "Content and backlinks, but missing all local SEO signals" },
  { slug: "gravyblock-vs-outreachfrog", name: "OutreachFrog", price: "$159–$1,199/link", note: "One-off link purchases, no ongoing automation" },
  { slug: "gravyblock-vs-bulletproof", name: "BulletProof", price: "Premium / unlisted", note: "Real-estate-only, high-touch coaching model" },
];

export default function CompareIndexPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      {/* Header */}
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-800">Competitor comparison</p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
          GravyBlock vs. BrightLocal, Yext, Semrush, and more
        </h1>
        <p className="max-w-2xl text-lg text-zinc-600">
          Every other local SEO tool shows you what's wrong. GravyBlock fixes it, automatically. Here's how we stack up against the tools you're probably already evaluating.
        </p>
      </div>

      {/* GravyBlock summary */}
      <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-red-700">Why GravyBlock is different</p>
        <p className="mt-2 font-semibold text-zinc-900">The only local SEO tool that actually does the work.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm text-zinc-700">
          {[
            "Weekly AI articles published to your website",
            "Reddit posts auto-submitted to local communities",
            "Backlink outreach emails sent on your behalf",
            "Review inbox with AI-drafted reply suggestions",
            "AI search visibility (ChatGPT, Perplexity, Gemini)",
            "Competitor ranking comparison built in",
            "Free visibility scan. Results in 60 seconds.",
            "Starts at $39.99/mo intro. No agency needed.",
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
          <Link href="/scan?plan=growth" className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-500">
            Start Scale — $74.99/mo
          </Link>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Code <strong className="text-zinc-700">INTRO50</strong> = 50% off your first month.</p>
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

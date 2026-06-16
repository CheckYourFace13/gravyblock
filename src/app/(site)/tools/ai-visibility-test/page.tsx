import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Free AI Visibility Test for Local Businesses | GravyBlock",
  description: "Find out if your business shows up when people ask ChatGPT, Perplexity, or Google AI Overview for businesses like yours. Free test, instant results.",
  alternates: { canonical: "https://gravyblock.com/tools/ai-visibility-test" },
};

const aiPlatforms = [
  {
    name: "ChatGPT",
    description: "When someone asks \"find a good plumber in Austin\" or \"best Italian restaurant near me\", ChatGPT pulls from its training data and real-time web search.",
  },
  {
    name: "Google AI Overview",
    description: "Google now shows AI-generated summaries at the top of results for many local queries. Businesses mentioned in the AI overview get significant click advantage.",
  },
  {
    name: "Perplexity",
    description: "Perplexity is one of the fastest-growing AI search engines. It cites sources directly, so being mentioned in authoritative local content matters.",
  },
  {
    name: "Bing Copilot",
    description: "Microsoft Bing's AI assistant answers local search queries with business recommendations, pulling from the web and Bing's index.",
  },
];

const factors = [
  { label: "Consistent NAP data", detail: "Your name, address, and phone number must match everywhere. AI systems synthesize data from multiple sources and flag inconsistencies." },
  { label: "Review presence and volume", detail: "High review counts on Google and Yelp signal that a business is legitimate and worth recommending." },
  { label: "Local content and mentions", detail: "Blog posts, local news mentions, and directory listings all feed the sources AI systems draw from." },
  { label: "Structured data markup", detail: "LocalBusiness schema on your website makes it machine-readable and easier for AI to understand and cite your business correctly." },
  { label: "Wikipedia or Wikidata presence", detail: "Not required, but extremely helpful for larger brands. AI systems heavily weight knowledge base sources." },
  { label: "GBP completeness", detail: "A complete, regularly updated Google Business Profile is one of the strongest signals for local AI recommendations." },
];

export default function AiVisibilityTestPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <div className="mb-4">
        <Link href="/tools" className="text-sm text-zinc-500 hover:text-zinc-800">
          Free tools
        </Link>
        <span className="mx-2 text-zinc-400">/</span>
        <span className="text-sm text-zinc-700">AI Visibility Test</span>
      </div>

      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Free tool</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">
        AI Visibility Test for Local Businesses
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-zinc-600">
        30% of local search queries now go through AI assistants. Find out if your business shows up
        when customers ask ChatGPT, Perplexity, or Google AI Overview for businesses in your category.
      </p>

      <div className="mt-8">
        <Link
          href="/scan"
          className="inline-block rounded-full bg-red-600 px-8 py-4 text-base font-semibold text-white shadow-sm hover:bg-red-500"
        >
          Test my AI visibility, free
        </Link>
        <p className="mt-3 text-sm text-zinc-500">Takes 30 seconds. No account required.</p>
      </div>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold text-zinc-900">Where AI searches your business</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {aiPlatforms.map((p) => (
            <div key={p.name} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="font-semibold text-zinc-900">{p.name}</p>
              <p className="mt-2 text-sm text-zinc-500">{p.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-2xl border border-zinc-200 bg-zinc-50 p-8">
        <h2 className="text-xl font-semibold text-zinc-900">Why AI visibility is different from traditional SEO</h2>
        <div className="mt-4 space-y-4 text-sm text-zinc-600">
          <p>
            Traditional SEO optimizes for ten blue links. AI search generates a single answer that may or may not include your business.
            If the AI does not mention you, that query produces zero traffic, regardless of your Google ranking.
          </p>
          <p>
            AI systems pull from multiple sources simultaneously: Google, Yelp, local news, review sites, and your own website.
            Being strong on just one source is not enough. Consistency across all of them is what gets you recommended.
          </p>
          <p>
            GravyBlock's AI visibility check probes these systems with real queries relevant to your business category and location,
            then tells you exactly where you are and are not showing up.
          </p>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold text-zinc-900">What affects your AI visibility score</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {factors.map((f) => (
            <div key={f.label} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="font-semibold text-zinc-900">{f.label}</p>
              <p className="mt-1 text-sm text-zinc-500">{f.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold text-zinc-900">What GravyBlock does to improve AI visibility</h2>
        <ul className="mt-4 space-y-3">
          {[
            "Generates local SEO articles that cite your business in context. These become sources AI systems reference.",
            "Tracks your GBP completeness and flags gaps that hurt AI discoverability.",
            "Monitors AI search results monthly and reports whether mention frequency is improving.",
            "Builds outreach to local directories and blogs that increase your citation footprint.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-3 text-sm">
              <span className="mt-0.5 shrink-0 text-red-600">+</span>
              <span className="text-zinc-700">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-14 rounded-2xl bg-zinc-900 p-8 text-white">
        <h2 className="text-2xl font-semibold">See how visible you are to AI search right now</h2>
        <p className="mt-3 text-zinc-300">
          Our free scan checks your business against real AI queries in your category and city.
        </p>
        <div className="mt-6">
          <Link
            href="/scan"
            className="inline-block rounded-full bg-red-600 px-8 py-4 text-base font-semibold text-white hover:bg-red-500"
          >
            Run my free AI visibility test
          </Link>
        </div>
        <p className="mt-4 text-sm text-zinc-400">
          On Growth and higher plans, GravyBlock monitors AI visibility monthly and builds the content signals that improve it.{" "}
          <Link href="/#plans" className="text-zinc-300 underline">
            See plans.
          </Link>
        </p>
      </div>
    </div>
  );
}

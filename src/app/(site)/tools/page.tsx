import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Free Local SEO Tools | GravyBlock",
  description: "Free tools to check your Google Business Profile, test AI search visibility, and scan your local SEO health. No account required.",
};

const tools = [
  {
    href: "/tools/google-business-profile-checker",
    title: "Google Business Profile Checker",
    description: "See how complete and trustworthy your Google Business Profile looks to potential customers. Checks photos, categories, hours, reviews, and more.",
    cta: "Check my GBP",
    tag: "Free",
  },
  {
    href: "/tools/ai-visibility-test",
    title: "AI Visibility Test",
    description: "Find out if your business shows up when people ask ChatGPT, Perplexity, or Google AI Overview for businesses like yours in your city.",
    cta: "Test AI visibility",
    tag: "Free",
  },
  {
    href: "/scan",
    title: "Full Local SEO Scan",
    description: "Get a complete local visibility score covering GBP, website trust, review signals, citations, and AI search presence. Runs in 30 seconds.",
    cta: "Run a free scan",
    tag: "Free",
  },
];

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Free tools</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">Local SEO tools, free</h1>
      <p className="mt-4 max-w-2xl text-lg text-zinc-600">
        Run these checks on your business in under a minute. No account required for any of them.
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-red-200 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">{tool.tag}</span>
            </div>
            <h2 className="mt-4 text-lg font-semibold text-zinc-900">{tool.title}</h2>
            <p className="mt-2 flex-1 text-sm text-zinc-600">{tool.description}</p>
            <span className="mt-5 text-sm font-semibold text-red-800">{tool.cta} →</span>
          </Link>
        ))}
      </div>

      <div className="mt-16 rounded-2xl border border-zinc-200 bg-zinc-50 p-8">
        <h2 className="text-xl font-semibold text-zinc-900">What these tools check</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            { label: "Google Business Profile completeness", detail: "Photos, categories, hours, description, and Q&A coverage." },
            { label: "Review count and quality", detail: "Total reviews, rating, recency, and owner response rate." },
            { label: "AI search presence", detail: "Whether ChatGPT and Perplexity mention your business for local queries." },
            { label: "Website trust signals", detail: "HTTPS, contact info, local schema markup, and page speed indicators." },
            { label: "Citation consistency", detail: "Whether your name, address, and phone number match across directories." },
            { label: "Competitor benchmarks", detail: "How your visibility score compares to similar businesses nearby." },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-white border border-zinc-200 p-4">
              <p className="text-sm font-semibold text-zinc-900">{item.label}</p>
              <p className="mt-1 text-sm text-zinc-500">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-10 text-center">
        <p className="text-sm text-zinc-600">
          Want these checks to run automatically every month?{" "}
          <Link href="/#plans" className="font-semibold text-red-800 underline">
            See GravyBlock plans
          </Link>
        </p>
      </div>
    </div>
  );
}

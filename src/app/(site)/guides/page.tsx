import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Local SEO guides — how to rank higher on Google Maps & AI search | GravyBlock",
  description:
    "Free local SEO guides for small business owners: how to rank on Google Maps, get more reviews, show up in AI search, build backlinks, and convert local visitors into customers.",
  alternates: { canonical: "https://gravyblock.com/guides" },
};

const guides = [
  {
    href: "/guides/google-3-pack",
    title: "What is the Google 3-Pack (and how do you get in it)?",
    description: "The map pack shows three businesses at the top of local search results. Here's how Google chooses who gets in, and the exact steps to rank there.",
  },
  {
    href: "/guides/local-citation-sites-usa",
    title: "Local citation sites USA — complete list for 2026",
    description: "The top US directories to build NAP consistency: Tier 1 essentials, industry-specific sites, and how to keep them accurate automatically.",
  },
  {
    href: "/guides/multi-location-local-seo",
    title: "Multi-location local SEO",
    description: "Consistency, internal linking, and measuring each location without drowning in spreadsheets.",
  },
  {
    href: "/guides/service-area-business-visibility",
    title: "Service-area business visibility",
    description: "How SABs earn trust when they do not have a storefront on every corner.",
  },
  {
    href: "/guides/ai-search-local-businesses",
    title: "AI search visibility for local businesses",
    description: "Facts, entities, and summaries: what assistants need to describe you accurately.",
  },
  {
    href: "/guides/social-proof-and-local-conversion",
    title: "Social proof and local conversion",
    description: "Reviews, policies, and paths that turn a maps view into a visit.",
  },
  {
    href: "/guides/website-trust-signals",
    title: "Website trust signals",
    description: "Security, schema, contact clarity, and friction that quietly costs you leads.",
  },
  {
    href: "/guides/how-to-rank-higher-in-google-maps",
    title: "How to rank higher in Google Maps",
    description: "Direct, practical actions that improve map visibility without spam tactics.",
  },
  {
    href: "/guides/how-to-improve-local-trust-on-your-website",
    title: "How to improve local trust on your website",
    description: "Trust-building elements that help local visitors choose you faster.",
  },
  {
    href: "/guides/how-to-show-up-in-ai-search-for-local-businesses",
    title: "How to show up in AI search for local businesses",
    description: "Entity consistency and direct-answer content for AI-ready local visibility.",
  },
  {
    href: "/guides/how-to-get-more-calls-from-google-business-profile",
    title: "How to get more calls from Google Business Profile",
    description: "Profile and trust improvements that lift call conversion.",
  },
  {
    href: "/guides/how-to-improve-near-me-conversion",
    title: "How to improve near me conversion",
    description: "Turn local intent traffic into more calls, bookings, and qualified leads.",
  },
  {
    href: "/guides/how-to-build-better-location-pages",
    title: "How to build better location pages",
    description: "Build unique, useful local pages instead of thin duplicate content.",
  },
  {
    href: "/guides/local-seo-for-apartment-complexes",
    title: "Local SEO for apartment complexes",
    description: "Leasing-focused local visibility and conversion strategy.",
  },
  {
    href: "/guides/local-seo-for-home-services",
    title: "Local SEO for home services",
    description: "Service-area trust and profile clarity for call-first operators.",
  },
  {
    href: "/guides/local-seo-for-law-firms",
    title: "Local SEO for law firms",
    description: "Credibility and intake conversion improvements for legal teams.",
  },
  {
    href: "/guides/local-seo-for-dentists",
    title: "Local SEO for dentists",
    description: "Patient-intent visibility and booking confidence improvements.",
  },
];

export default function GuidesIndexPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Free guides</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">Local SEO guides for small business owners</h1>
      <p className="mt-4 text-lg text-zinc-600">
        Practical, no-fluff guides on how to rank higher on Google Maps, show up in AI search, build reviews, earn backlinks, and turn local search traffic into paying customers.
      </p>
      <p className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-700">
        Looking for industry-specific playbooks (restaurants, dentists, contractors, salons, lawyers)?{" "}
        <Link href="/industries" className="font-semibold text-red-800 hover:underline">
          Browse industries →
        </Link>
        .
      </p>
      <ul className="mt-10 space-y-4">
        {guides.map((g) => (
          <li key={g.href}>
            <Link href={g.href} className="block rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-red-200">
              <h2 className="text-lg font-semibold text-zinc-900">{g.title}</h2>
              <p className="mt-2 text-sm text-zinc-600">{g.description}</p>
              <p className="mt-3 text-sm font-semibold text-red-800">Read guide →</p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-12 text-sm text-zinc-600">
        Ready to see how your business scores today?{" "}
        <Link href="/scan" className="font-semibold text-red-800 hover:underline">
          Run the free scan
        </Link>
        .
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/compare" className="text-sm font-semibold text-red-800 hover:underline">
          Compare tool approaches
        </Link>
        <Link href="/examples" className="text-sm font-semibold text-red-800 hover:underline">
          Browse sample workflows
        </Link>
      </div>
    </div>
  );
}

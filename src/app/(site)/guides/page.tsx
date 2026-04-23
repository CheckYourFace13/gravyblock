import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Local growth guides — GravyBlock",
  description:
    "Evergreen explainers on multi-location SEO, service-area visibility, AI search, social proof, and website trust — structured for search and linked to GravyBlock’s automated scan model.",
};

const guides = [
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
    description: "Facts, entities, and summaries — what assistants need to describe you accurately.",
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
];

export default function GuidesIndexPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Guides</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">Local growth library</h1>
      <p className="mt-4 text-lg text-zinc-600">
        These pages are written to be useful on their own and to complement an automated scan: they describe what
        “good” looks like without promising specific rankings.
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
    </div>
  );
}

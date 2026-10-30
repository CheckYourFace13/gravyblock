import Link from "next/link";

const TOOLS = [
  { slug: "google-business-profile-checker", label: "Google Business Profile checker" },
  { slug: "ai-visibility-test", label: "AI visibility test" },
  { slug: "nap-consistency-checker", label: "NAP consistency checker" },
  { slug: "review-link-generator", label: "Google review link generator" },
  { slug: "review-reply-generator", label: "Review reply generator" },
  { slug: "local-seo-roi-calculator", label: "Local SEO ROI calculator" },
] as const;

export type ToolSlug = (typeof TOOLS)[number]["slug"];

/** One or two genuinely related reads per tool: a guide or comparison that answers the follow-up question. */
const READS: Record<ToolSlug, { href: string; label: string }[]> = {
  "google-business-profile-checker": [
    { href: "/guides/how-to-rank-higher-in-google-maps", label: "How to rank higher in Google Maps" },
    { href: "/compare/google-maps-ranking-tools", label: "Google Maps rank trackers compared" },
  ],
  "ai-visibility-test": [
    { href: "/compare/ai-search-visibility-tools", label: "AI visibility trackers compared" },
    { href: "/guides/ai-search-local-businesses", label: "AI search for local businesses" },
  ],
  "nap-consistency-checker": [
    { href: "/guides/local-citation-sites-usa", label: "Local citation sites in the USA" },
    { href: "/glossary", label: "Local SEO glossary" },
  ],
  "review-link-generator": [{ href: "/guides/google-3-pack", label: "How reviews affect the Google 3-pack" }],
  "review-reply-generator": [{ href: "/guides/google-3-pack", label: "How reviews affect the Google 3-pack" }],
  "local-seo-roi-calculator": [{ href: "/compare/local-seo-audit-tools", label: "Local SEO audit tools compared" }],
};

export function ToolNextSteps({
  current,
  scanCta = true,
  scanBody = "Run the free scan to see your visibility score, how you compare with nearby competitors, and what GravyBlock would do about each finding. About a minute, no credit card.",
}: {
  current: ToolSlug;
  /** Pages that already end with their own scan call to action pass false and only get the related links. */
  scanCta?: boolean;
  scanBody?: string;
}) {
  const others = TOOLS.filter((t) => t.slug !== current);
  return (
    <section className="mt-14">
      {scanCta ? (
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-6 text-center sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-800">The full picture</p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-900">See your whole local presence in one free scan</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-zinc-600">{scanBody}</p>
          <Link
            href="/scan"
            className="mt-5 inline-block rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-500"
          >
            Get my free visibility score →
          </Link>
        </div>
      ) : null}
      <div className="mt-8 grid gap-6 text-sm sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">More free tools</h2>
          <ul className="mt-2 space-y-1.5">
            {others.map((t) => (
              <li key={t.slug}>
                <Link href={`/tools/${t.slug}`} className="text-red-800 underline underline-offset-2">
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Related reading</h2>
          <ul className="mt-2 space-y-1.5">
            {READS[current].map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="text-red-800 underline underline-offset-2">
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

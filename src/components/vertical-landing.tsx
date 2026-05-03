import Link from "next/link";

const siteUrl = "https://gravyblock.com";

const automationFeatures = [
  "Weekly AI-written articles published to your website",
  "Reddit posts to local city and niche communities",
  "8 backlink outreach emails per month — sent automatically",
  "Facebook + Instagram auto-posting",
  "Google ranking tracking + weekly visibility refreshes",
  "AI search monitoring (ChatGPT, Perplexity, Gemini)",
];

export function VerticalLanding({
  eyebrow,
  title,
  body,
  bullets,
  ctaHref,
  ctaLabel,
}: {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  ctaHref: string;
  ctaLabel: string;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `GravyBlock for ${eyebrow}`,
    provider: {
      "@type": "Organization",
      name: "GravyBlock",
      url: siteUrl,
    },
    description: body,
    url: siteUrl,
    serviceType: "Local SEO and Marketing Automation",
    audience: {
      "@type": "Audience",
      audienceType: eyebrow,
    },
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-800">{eyebrow}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">{title}</h1>
      <p className="mt-4 text-lg text-zinc-600">{body}</p>
      <ul className="mt-8 space-y-3 text-sm text-zinc-700">
        {bullets.map((item) => (
          <li key={item} className="flex gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href={ctaHref}
          className="inline-flex rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500"
        >
          {ctaLabel}
        </Link>
        <Link href="/#plans" className="inline-flex rounded-full border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-700 hover:border-zinc-400">
          See plans &amp; pricing
        </Link>
      </div>
      <p className="mt-3 text-xs text-zinc-500">Free scan — no credit card. Use code <strong>INTRO50</strong> for 50% off month one.</p>

      <div className="mt-12 rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-800">What GravyBlock automates on Scale ($74.99/mo)</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {automationFeatures.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-zinc-700">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
              {f}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-zinc-500">
          Everything above runs automatically, every week. No logins, no instructions, no agency required.{" "}
          <Link href="/scan" className="font-semibold text-red-800 hover:underline">Start with a free scan →</Link>
        </p>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </div>
  );
}

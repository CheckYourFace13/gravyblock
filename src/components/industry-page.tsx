import Link from "next/link";
import type { ReactNode } from "react";

export type IndustryTradeBlock = {
  id: string;
  title: string;
  intro: string;
  bullets: string[];
};

export type IndustryPageModel = {
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  h1: string;
  intro: string;
  whyFit: string;
  winCustomers: string[];
  commonWeaknesses: string[];
  profileBody: string;
  websiteBody: string;
  aiBody: string;
  scanHelps: string[];
  ongoingBody: string;
  trades: IndustryTradeBlock[];
  relatedGuides: { href: string; label: string }[];
  /** Optional deep links (e.g. legacy vertical landings). */
  extraLinks?: { href: string; label: string }[];
  ctaLabel?: string;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10 border-t border-zinc-200 pt-10 first:mt-0 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h2>
      <div className="mt-3 space-y-3 text-base leading-relaxed text-zinc-700">{children}</div>
    </section>
  );
}

export function IndustryPageShell({
  model,
  ctaHref = "/scan",
}: {
  model: IndustryPageModel;
  ctaHref?: string;
}) {
  const ctaLabel = model.ctaLabel ?? "Run the free scan";
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">{model.eyebrow}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">{model.h1}</h1>
      <p className="mt-4 text-lg text-zinc-600">{model.intro}</p>

      <Section title="Why GravyBlock fits">
        <p>{model.whyFit}</p>
      </Section>

      <Section title="How you win more customers">
        <p className="text-zinc-600">Stronger discovery and trust usually move together:</p>
        <ul className="list-disc space-y-2 pl-5">
          {model.winCustomers.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Section>

      <Section title="Common weaknesses in this space">
        <ul className="list-disc space-y-2 pl-5">
          {model.commonWeaknesses.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Section>

      <Section title="Why your Google Business Profile matters here">
        <p>{model.profileBody}</p>
      </Section>

      <Section title="Why website trust and conversion matter">
        <p>{model.websiteBody}</p>
      </Section>

      <Section title="How AI-assisted search affects discovery">
        <p>{model.aiBody}</p>
      </Section>

      <Section title="What the free scan and report help uncover">
        <ul className="list-disc space-y-2 pl-5">
          {model.scanHelps.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Section>

      <Section title="What Base and Pro improve over time">
        <p>{model.ongoingBody}</p>
      </Section>

      {model.trades.length ? (
        <section className="mt-12 border-t border-zinc-200 pt-10">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">Categories in this group</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Each operator below has different urgency and proof needs, but the same core jobs: be found, be trusted, be
            easy to contact.
          </p>
          <div className="mt-8 space-y-10">
            {model.trades.map((t) => (
              <div key={t.id} id={t.id}>
                <h3 className="text-lg font-semibold text-zinc-900">{t.title}</h3>
                <p className="mt-2 text-base text-zinc-700">{t.intro}</p>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
                  {t.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          href={ctaHref}
          className="inline-flex rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
        >
          {ctaLabel}
        </Link>
        <Link href="/industries" className="inline-flex rounded-full border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-900 hover:border-zinc-400">
          All industries
        </Link>
      </div>

      <div className="mt-12 rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Related guides</p>
        <ul className="mt-3 space-y-2 text-sm font-medium text-zinc-800">
          {model.relatedGuides.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className="text-red-800 hover:underline">
                {r.label}
              </Link>
            </li>
          ))}
        </ul>
        {model.extraLinks?.length ? (
          <>
            <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">More on this vertical</p>
            <ul className="mt-2 space-y-2 text-sm font-medium text-zinc-800">
              {model.extraLinks.map((r) => (
                <li key={r.href}>
                  <Link href={r.href} className="text-red-800 hover:underline">
                    {r.label}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </article>
  );
}

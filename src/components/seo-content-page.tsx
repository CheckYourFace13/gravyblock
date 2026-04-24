import Link from "next/link";

export type SeoSection = {
  title: string;
  body: string;
  bullets?: string[];
};

export type SeoPageModel = {
  eyebrow: string;
  title: string;
  intro: string;
  meaningForBusiness: string;
  sections: SeoSection[];
  relatedLinks: { href: string; label: string }[];
  ctaLabel?: string;
};

export function SeoContentPage({ model }: { model: SeoPageModel }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">{model.eyebrow}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">{model.title}</h1>
      <p className="mt-4 text-lg text-zinc-600">{model.intro}</p>
      <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What this means for your business</p>
        <p className="mt-2 text-sm text-zinc-700">{model.meaningForBusiness}</p>
      </div>

      {model.sections.map((section) => (
        <section key={section.title} className="mt-10 border-t border-zinc-200 pt-10">
          <h2 className="text-xl font-semibold text-zinc-900">{section.title}</h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-700">{section.body}</p>
          {section.bullets?.length ? (
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-700">
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          href="/scan"
          className="inline-flex rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          {model.ctaLabel ?? "Run the free scan"}
        </Link>
        <Link
          href="/industries"
          className="inline-flex rounded-full border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
        >
          Browse industries
        </Link>
      </div>

      <div className="mt-12 rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Related reading</p>
        <ul className="mt-3 space-y-2 text-sm font-medium text-zinc-800">
          {model.relatedLinks.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="text-red-800 hover:underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

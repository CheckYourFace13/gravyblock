import Link from "next/link";

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
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-800">{eyebrow}</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">{title}</h1>
      <p className="mt-4 text-lg text-zinc-600">{body}</p>
      <ul className="mt-8 space-y-3 text-sm text-zinc-700">
        {bullets.map((item) => (
          <li key={item} className="flex gap-3">
            <span className="mt-1 h-2 w-2 rounded-full bg-red-500" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href={ctaHref}
          className="inline-flex rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
        >
          {ctaLabel}
        </Link>
        <Link href="/" className="inline-flex rounded-full border border-zinc-300 px-6 py-3 text-sm font-semibold">
          Back to home
        </Link>
      </div>
    </div>
  );
}

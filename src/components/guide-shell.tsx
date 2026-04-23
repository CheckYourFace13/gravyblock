import Link from "next/link";
import type { ReactNode } from "react";

export function GuideShell({
  title,
  intro,
  children,
  related,
}: {
  title: string;
  intro: string;
  children: ReactNode;
  related: { href: string; label: string }[];
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Guide</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">{title}</h1>
      <p className="mt-4 text-lg text-zinc-600">{intro}</p>
      <div className="mt-10 space-y-5 text-base leading-relaxed text-zinc-700 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-zinc-900 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-zinc-900 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_a]:font-medium [&_a]:text-red-800 [&_a]:hover:underline">
        {children}
      </div>
      <div className="mt-14 rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Related</p>
        <ul className="mt-3 space-y-2 text-sm font-medium text-zinc-800">
          {related.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className="text-red-800 hover:underline">
                {r.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-zinc-600">
          GravyBlock runs a free, automated local visibility scan —{" "}
          <Link href="/scan" className="font-semibold text-red-800 hover:underline">
            start a scan
          </Link>{" "}
          to see prioritized fixes for your business.
        </p>
      </div>
    </article>
  );
}

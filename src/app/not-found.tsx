import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-800">404</p>
      <h1 className="text-3xl font-semibold text-zinc-900">Page not found</h1>
      <p className="text-sm text-zinc-600">The link may be old or mistyped. These pages will get you moving again.</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/scan"
          className="inline-flex justify-center rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-500"
        >
          Get a free visibility score →
        </Link>
        <Link
          href="/pricing"
          className="inline-flex justify-center rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
        >
          Pricing
        </Link>
        <Link
          href="/tools"
          className="inline-flex justify-center rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
        >
          Free tools
        </Link>
      </div>
      <p className="text-xs text-zinc-500">Free scan · No credit card · 60-second results</p>
    </div>
  );
}

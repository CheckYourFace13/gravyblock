import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-800">404</p>
      <h1 className="text-3xl font-semibold text-zinc-900">This page drifted off the map.</h1>
      <p className="text-sm text-zinc-600">The link may be old, or the report ID may be mistyped.</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/scan"
          className="inline-flex rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-500"
        >
          Get a free visibility score →
        </Link>
        <Link
          href="/"
          className="inline-flex rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
        >
          Back to GravyBlock
        </Link>
      </div>
      <p className="text-xs text-zinc-400">Free scan · No credit card · 60-second results</p>
    </div>
  );
}

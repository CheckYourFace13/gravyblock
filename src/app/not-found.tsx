import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-800">404</p>
      <h1 className="text-3xl font-semibold text-zinc-900">This page drifted off the map.</h1>
      <p className="text-sm text-zinc-600">The link may be old, or the report ID may be mistyped.</p>
      <Link
        href="/"
        className="mt-2 inline-flex rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
      >
        Back to GravyBlock
      </Link>
    </div>
  );
}

import Link from "next/link";
import { getShowcaseBusinesses } from "@/lib/proof/get-showcase-businesses";

/** Compact real-results teaser for the checkout page — same live data as /proof. */
export async function ProofTeaser() {
  const showcased = await getShowcaseBusinesses();
  if (showcased.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
        Real results, not stock photos — same automation you&apos;re about to start
      </p>
      <div className="flex flex-wrap gap-4">
        {showcased.map((b) => (
          <div key={b.id} className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-zinc-800">{b.name}</span>
            {b.score !== null ? (
              <span className="rounded-full bg-white border border-zinc-200 px-2 py-0.5 text-xs font-bold text-zinc-700">
                {b.score}/100
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <Link href="/proof" className="mt-2 inline-block text-xs font-semibold text-red-800 underline underline-offset-2">
        See full results →
      </Link>
    </div>
  );
}

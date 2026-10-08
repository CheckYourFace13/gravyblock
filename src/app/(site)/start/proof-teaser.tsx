import Link from "next/link";
import { getShowcaseBusinesses } from "@/lib/proof/get-showcase-businesses";

/** Compact teaser for the checkout page, linking to the same live evidence as /proof. */
export async function ProofTeaser() {
  const showcased = await getShowcaseBusinesses();
  if (showcased.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        The same automation you&apos;re about to start runs on businesses we operate
      </p>
      <p className="text-sm text-zinc-700">{showcased.map((b) => b.name).join(" · ")}</p>
      <Link href="/proof" className="mt-2 inline-block text-xs font-semibold text-red-800 underline underline-offset-2">
        See the verified work →
      </Link>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getApprovedStories } from "@/lib/case-studies/public";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Real Growth Stories",
  description: "Measured results from sites GravyBlock runs itself, with what was done, what was verified, and what was only measured.",
  alternates: { canonical: "/real-growth-stories" },
};

const STAGE_LABEL: Record<string, string> = {
  DISCOVERED: "Found",
  RECOMMENDED: "Recommended",
  EXECUTED: "Done",
  VERIFIED: "Verified",
  MEASURED: "Measured",
  ATTRIBUTABLE: "Cause",
};

/**
 * Renders ONLY owner-approved claims (see lib/case-studies/public.ts). With no approval on record this page does not exist (404),
 * so nothing is public until the owner has reviewed the exact wording.
 */
export default async function RealGrowthStoriesPage() {
  const stories = await getApprovedStories();
  if (!stories.length) notFound();
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-800">Real growth stories</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">What GravyBlock did, and what actually happened.</h1>
      <p className="mt-4 max-w-2xl text-lg text-zinc-600">
        Each story keeps four things apart: what was done, what was independently verified, what was measured, and whether any result can fairly be credited to the work. Zeros are shown as zeros.
      </p>
      <div className="mt-10 space-y-8">
        {stories.map((s) => (
          <section key={s.slug} className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="text-2xl font-semibold text-zinc-900">{s.publicName}</h2>
            <p className="mt-1 text-xs text-zinc-500">{s.disclosure}</p>
            <ul className="mt-5 space-y-3">
              {s.claims.map((c) => (
                <li key={c.text} className="flex gap-3 text-sm text-zinc-700">
                  <span className="mt-0.5 h-fit shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600">{STAGE_LABEL[c.stage] ?? c.stage}</span>
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs text-zinc-400">Numbers refreshed {new Date(s.asOf).toISOString().slice(0, 10)}. Wording last reviewed {s.approvedAt.slice(0, 10)}.</p>
          </section>
        ))}
      </div>
    </div>
  );
}

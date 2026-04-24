import type { Metadata } from "next";
import Link from "next/link";
import { ScanForm } from "@/components/scan-form";

export const metadata: Metadata = {
  title: "Free visibility scan | GravyBlock",
  description:
    "Run a free scan for any local business: score and top findings first, full report by email after unlock. Base and Pro add ongoing automation from your workspace.",
};

type Props = { searchParams: Promise<{ plan?: string }> };

export default async function ScanPage({ searchParams }: Props) {
  const query = await searchParams;
  const raw = query.plan?.toLowerCase() ?? "";
  const selectedPlan = raw === "pro" ? "pro" : raw === "base" || raw === "entry" ? "base" : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-800">Scan</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">Confirm the business to scan</h1>
        <p className="mt-4 text-lg text-zinc-600">
          Works for restaurants, med spas, salons, law firms, dental practices, gyms, apartment communities, home
          services, retail, clinics, and other local businesses. Same scan path for free preview, Base, or Pro.
        </p>
      </div>

      <div className="mx-auto mt-6 flex max-w-3xl flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-left text-sm text-zinc-700">
          <p className="font-semibold text-zinc-900">Plans</p>
          <p className="mt-1 text-xs text-zinc-600">
            Free: score preview and email unlock. Base: monthly automation. Pro: full automation queues in workspace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/scan"
            className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            Free report
          </Link>
          <Link
            href="/scan?plan=base"
            className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 hover:border-zinc-400"
          >
            Start Base
          </Link>
          <Link
            href="/scan?plan=pro"
            className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500"
          >
            Start Pro
          </Link>
        </div>
      </div>

      {selectedPlan ? (
        <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-red-200 bg-red-50/70 p-4 text-sm text-zinc-900">
          <p className="font-semibold">{selectedPlan === "base" ? "Base selected" : "Pro selected"}</p>
          <p className="mt-1 text-zinc-700">
            Confirm the right Google listing so we can attach {selectedPlan === "base" ? "Base" : "Pro"} to this business
            before checkout in your workspace.
          </p>
        </div>
      ) : null}
      <div className="mt-10 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-10">
        <ScanForm selectedPlan={selectedPlan} />
      </div>
    </div>
  );
}

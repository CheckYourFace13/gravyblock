import type { Metadata } from "next";
import { ScanForm } from "@/components/scan-form";

export const metadata: Metadata = {
  title: "Free visibility scan — GravyBlock",
  description:
    "Get your score free: run an automated scan, see verdict + top findings instantly, then unlock and email the full report.",
};

type Props = { searchParams: Promise<{ plan?: string }> };

export default async function ScanPage({ searchParams }: Props) {
  const query = await searchParams;
  const selectedPlan = query.plan === "entry" || query.plan === "pro" ? query.plan : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-800">Step 1 of plan activation</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">Confirm the business you want to monitor</h1>
        <p className="mt-4 text-lg text-zinc-600">
          We support storefronts, service-area businesses, multi-location brands, and online-first brands building
          local trust. You get score, verdict, and top findings first, then unlock the full report by email.
        </p>
      </div>
      {selectedPlan ? (
        <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-red-200 bg-red-50/70 p-4 text-sm text-zinc-900">
          <p className="font-semibold">{selectedPlan === "entry" ? "Entry selected" : "Pro selected"}</p>
          <p className="mt-1 text-zinc-700">
            First, confirm the business you want to monitor. We use this to attach your selected plan to the right
            business profile. After the score preview, continue to activate {selectedPlan === "entry" ? "Entry" : "Pro"}.
          </p>
        </div>
      ) : null}
      <div className="mt-10 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-10">
        <ScanForm selectedPlan={selectedPlan} />
      </div>
    </div>
  );
}

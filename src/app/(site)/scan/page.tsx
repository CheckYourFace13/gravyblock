import type { Metadata } from "next";
import { ScanForm } from "@/components/scan-form";

export const metadata: Metadata = {
  title: "Free visibility scan — GravyBlock",
  description:
    "Kick off autopilot: scan a local business, multi-location brand, service-area operation, or online-first business to get scored findings, execution queues, and a workspace that tracks growth over time.",
};

export default function ScanPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-800">Layer 1 · Free scan</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">See how you look to local-intent demand</h1>
        <p className="mt-4 text-lg text-zinc-600">
          One flow for <span className="font-medium text-zinc-800">any local business</span> — storefront, franchise,
          service-area van routes, or online brand with a local footprint. We use your Google listing (including
          website when Google provides it), a homepage crawl, observational social links, and sampled local visibility
          checks. You get a scored report, roadmap, and workspace that remembers each run.
        </p>
      </div>
      <div className="mt-10 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-10">
        <ScanForm />
      </div>
    </div>
  );
}

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
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">See how you look to a local-intent buyer</h1>
        <p className="mt-4 text-lg text-zinc-600">
          We run a Google-backed lookup, website crawl, and local-intent visibility checks. You unlock a scored report,
          an autopilot roadmap, execution queues, and a workspace that remembers every scan.
        </p>
      </div>
      <div className="mt-10 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-10">
        <ScanForm />
      </div>
    </div>
  );
}

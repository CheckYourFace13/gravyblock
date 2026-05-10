"use client";

import { useState } from "react";

type Props = {
  referralUrl: string;
  clicks: number;
  scans: number;
  paid: number;
};

export function ReferralSection({ referralUrl, clicks, scans, paid }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the input text
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Refer a business, get a free month</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Share your link. When another business signs up through it, you both get one free month — automatically applied. No code needed.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">
          +1 month free per referral
        </span>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row items-stretch gap-2">
        <code className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700 font-mono break-all">
          {referralUrl}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className={`shrink-0 rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
            copied
              ? "bg-green-600 text-white"
              : "bg-zinc-900 text-white hover:bg-zinc-700"
          }`}
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-4 text-sm">
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-center">
          <p className="text-2xl font-semibold text-zinc-900">{clicks}</p>
          <p className="text-xs text-zinc-500 mt-0.5">link clicks</p>
        </div>
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-center">
          <p className="text-2xl font-semibold text-zinc-900">{scans}</p>
          <p className="text-xs text-zinc-500 mt-0.5">scans run</p>
        </div>
        <div className={`rounded-xl border p-3 text-center ${paid > 0 ? "border-green-200 bg-green-50" : "border-zinc-100 bg-zinc-50"}`}>
          <p className={`text-2xl font-semibold ${paid > 0 ? "text-green-700" : "text-zinc-900"}`}>{paid}</p>
          <p className="text-xs text-zinc-500 mt-0.5">converted to paid</p>
        </div>
      </div>

      {paid > 0 && (
        <p className="mt-3 text-xs text-green-700 font-medium">
          🎉 You have {paid} paid referral{paid > 1 ? "s" : ""}. Reply to any GravyBlock email to claim your free month{paid > 1 ? "s" : ""}.
        </p>
      )}

      <p className="mt-4 text-xs text-zinc-400">
        Share via text, email, or your social profiles. Anyone who runs a scan through your link and becomes a paid customer counts as a referral.
      </p>
    </section>
  );
}

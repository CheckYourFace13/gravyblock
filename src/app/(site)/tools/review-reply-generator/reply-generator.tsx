"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { generateReplyAction, type ReplyResult } from "./actions";

const SCAN_HREF = "/scan?utm_source=tool&utm_medium=review_reply&utm_campaign=free_tool";

export function ReplyGenerator() {
  const [review, setReview] = useState("");
  const [business, setBusiness] = useState("");
  const [tone, setTone] = useState("professional");
  const [result, setResult] = useState<ReplyResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setCopied(false);
    start(async () => setResult(await generateReplyAction({ review, businessName: business, tone })));
  }

  return (
    <div>
      <form onSubmit={submit} className="space-y-3">
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          required
          maxLength={1200}
          rows={5}
          placeholder="Paste the customer's review here"
          className="w-full rounded-2xl border border-zinc-300 px-5 py-4 text-sm outline-none focus:ring-4 focus:ring-red-500/20"
        />
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input value={business} onChange={(e) => setBusiness(e.target.value)} maxLength={80} placeholder="Your business name (optional)" className="rounded-full border border-zinc-300 px-5 py-3 text-sm outline-none focus:ring-4 focus:ring-red-500/20" />
          <select value={tone} onChange={(e) => setTone(e.target.value)} className="rounded-full border border-zinc-300 bg-white px-4 py-3 text-sm">
            <option value="professional">Professional</option>
            <option value="warm">Warm</option>
            <option value="brief">Brief</option>
          </select>
          <button type="submit" disabled={pending} className="rounded-full bg-red-600 px-6 py-3 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-60">
            {pending ? "Writing…" : "Write my reply"}
          </button>
        </div>
      </form>
      {result && !result.ok ? <p className="mt-4 text-sm text-red-700">{result.error}</p> : null}
      {result && result.ok ? (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Suggested reply</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-900">{result.reply}</p>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(result.reply);
                setCopied(true);
              } catch {
                /* clipboard unavailable */
              }
            }}
            className="mt-3 rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-semibold text-zinc-800 hover:border-zinc-400"
          >
            {copied ? "Copied" : "Copy reply"}
          </button>
        </div>
      ) : null}
      <div className="mt-8 rounded-2xl border border-red-200 bg-red-50/60 p-6">
        <p className="text-lg font-semibold text-zinc-900">Don&apos;t want to do this for every review?</p>
        <p className="mt-1 text-sm text-zinc-700">
          GravyBlock can monitor your Google reviews and automatically post replies after you connect Google once.
        </p>
        <div className="mt-4">
          <Link href={SCAN_HREF} className="inline-block rounded-full bg-red-600 px-7 py-3 text-sm font-bold text-white hover:bg-red-500">
            Scan my business free
          </Link>
        </div>
      </div>
    </div>
  );
}

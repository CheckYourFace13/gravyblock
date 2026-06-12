"use client";

import { useActionState, useState } from "react";
import { captureToolLead, type ToolLeadResult } from "../tool-lead-actions";

type PlaceCandidate = {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  rating?: number;
  reviewCount: number;
};

export function ReviewLinkTool() {
  const [query, setQuery] = useState("");
  const [locationHint, setLocationHint] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [selected, setSelected] = useState<PlaceCandidate | null>(null);
  const [copied, setCopied] = useState(false);
  const [leadState, leadAction, leadPending] = useActionState<ToolLeadResult | null, FormData>(captureToolLead, null);

  async function search() {
    if (query.trim().length < 2) return;
    setSearching(true);
    setError(null);
    setCandidates([]);
    setSelected(null);
    try {
      const res = await fetch("/api/google/places/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, locationHint }),
      });
      const json = (await res.json()) as { candidates?: PlaceCandidate[]; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Search failed — try again.");
        return;
      }
      const found = json.candidates ?? [];
      setCandidates(found);
      if (found.length === 1) setSelected(found[0]);
      if (!found.length) setError("No matches found. Try adding your city after the business name.");
    } catch {
      setError("Search failed — try again.");
    } finally {
      setSearching(false);
    }
  }

  const reviewLink = selected
    ? `https://search.google.com/local/writereview?placeid=${selected.placeId}`
    : null;
  const qrUrl = reviewLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(reviewLink)}`
    : null;

  async function copyLink() {
    if (!reviewLink) return;
    try {
      await navigator.clipboard.writeText(reviewLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
      {/* Search */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Your business name"
          className="rounded-xl border border-zinc-200 px-4 py-3 text-sm shadow-sm outline-none ring-red-500/30 focus:ring-4"
        />
        <input
          value={locationHint}
          onChange={(e) => setLocationHint(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="City (optional)"
          className="rounded-xl border border-zinc-200 px-4 py-3 text-sm shadow-sm outline-none ring-red-500/30 focus:ring-4 sm:w-44"
        />
        <button
          type="button"
          onClick={search}
          disabled={searching || query.trim().length < 2}
          className="rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
        >
          {searching ? "Searching…" : "Find my business"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* Candidates */}
      {candidates.length > 1 && !selected && (
        <div className="mt-5 space-y-2">
          <p className="text-sm font-medium text-zinc-700">Select your business:</p>
          {candidates.slice(0, 5).map((c) => (
            <button
              key={c.placeId}
              type="button"
              onClick={() => setSelected(c)}
              className="flex w-full items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left hover:border-red-300 hover:bg-red-50/40"
            >
              <span>
                <span className="block text-sm font-semibold text-zinc-900">{c.displayName}</span>
                <span className="block text-xs text-zinc-500">{c.formattedAddress}</span>
              </span>
              {c.rating != null && (
                <span className="shrink-0 text-xs text-zinc-500">★ {c.rating} ({c.reviewCount})</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Result */}
      {selected && reviewLink && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
          <p className="text-sm font-semibold text-zinc-900">{selected.displayName}</p>
          <p className="text-xs text-zinc-500">{selected.formattedAddress}</p>

          <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
                Your direct review link
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-xs text-zinc-700">
                  {reviewLink}
                </code>
                <button
                  type="button"
                  onClick={copyLink}
                  className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800"
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </div>
              <a
                href={reviewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs font-medium text-red-700 underline underline-offset-2 hover:text-red-800"
              >
                Test the link →
              </a>

              {/* Email capture */}
              <div className="mt-5 border-t border-emerald-200 pt-4">
                {leadState?.ok ? (
                  <p className="text-sm font-medium text-emerald-700">
                    ✓ Sent! Check your inbox for your link and QR code.
                  </p>
                ) : (
                  <form action={leadAction} className="space-y-2">
                    <p className="text-xs font-medium text-zinc-600">
                      Email me this link + QR code (and a free visibility report for {selected.displayName}):
                    </p>
                    <input type="hidden" name="toolName" value="review_link_generator" />
                    <input type="hidden" name="businessName" value={selected.displayName} />
                    <input type="hidden" name="placeId" value={selected.placeId} />
                    <div className="flex gap-2">
                      <input
                        type="email"
                        name="email"
                        required
                        placeholder="you@business.com"
                        className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-2"
                      />
                      <button
                        type="submit"
                        disabled={leadPending}
                        className="shrink-0 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                      >
                        {leadPending ? "Sending…" : "Send it"}
                      </button>
                    </div>
                    {leadState && !leadState.ok && (
                      <p className="text-xs text-red-600">{leadState.error}</p>
                    )}
                  </form>
                )}
              </div>
            </div>

            {/* QR code */}
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">QR code</p>
              {qrUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrUrl}
                  alt={`QR code for ${selected.displayName} Google review link`}
                  width={140}
                  height={140}
                  className="rounded-xl border border-zinc-200 bg-white p-2"
                />
              )}
              {qrUrl && (
                <a
                  href={qrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 block text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-700"
                >
                  Open full size
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

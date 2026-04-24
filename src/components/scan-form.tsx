"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { generateReportAction, type ReportActionState } from "@/app/actions/report";

const initialState: ReportActionState = { status: "idle" };

type PlaceCandidate = {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  rating?: number;
  reviewCount: number;
  types: string[];
  mapsUri: string;
  confidence: number;
};

export function ScanForm({ selectedPlan }: { selectedPlan?: "base" | "pro" | null }) {
  const [state, formAction, pending] = useActionState(generateReportAction, initialState);
  const [query, setQuery] = useState("");
  const [locationHint, setLocationHint] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>("");
  const [selectedConfidence, setSelectedConfidence] = useState<number>(0);

  const selected = useMemo(
    () => candidates.find((c) => c.placeId === selectedPlaceId) ?? null,
    [candidates, selectedPlaceId],
  );

  async function searchPlaces() {
    setSearching(true);
    setSearchError(null);
    setCandidates([]);
    setSelectedPlaceId("");
    try {
      const res = await fetch("/api/google/places/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, locationHint }),
      });
      const json = (await res.json()) as { candidates?: PlaceCandidate[]; error?: string };
      if (!res.ok) {
        setSearchError(json.error ?? "Search failed");
        return;
      }
      const found = json.candidates ?? [];
      setCandidates(found);
      if (found[0]) {
        setSelectedPlaceId(found[0].placeId);
        setSelectedConfidence(found[0].confidence);
      }
      if (!found.length) {
        setSearchError("No Google Places matches found. Try another spelling or nearby city.");
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  return (
    <form action={formAction} className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">
          {selectedPlan ? "Step 1 · Identify the listing" : "Step 1 · Find your business"}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-medium text-zinc-800">Business name</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-red-500/30 focus:ring-4"
              placeholder="e.g. Bright Smile Dental"
            />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-medium text-zinc-800">City or address hint</span>
            <input
              value={locationHint}
              onChange={(e) => setLocationHint(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-red-500/30 focus:ring-4"
              placeholder="e.g. Austin TX"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={searchPlaces}
          disabled={searching || !query.trim() || !locationHint.trim()}
          className="mt-4 inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {searching ? "Searching Google Places..." : "Find business on Google"}
        </button>
        {searchError ? <p className="mt-3 text-sm text-red-700">{searchError}</p> : null}
      </div>

      {candidates.length ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">Step 2 · Confirm match</p>
          <div className="mt-3 space-y-2">
            {candidates.map((candidate) => (
              <label
                key={candidate.placeId}
                className={`block cursor-pointer rounded-xl border px-3 py-3 ${
                  selectedPlaceId === candidate.placeId ? "border-red-400 bg-red-50" : "border-zinc-200 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="place-choice"
                  className="sr-only"
                  checked={selectedPlaceId === candidate.placeId}
                  onChange={() => {
                    setSelectedPlaceId(candidate.placeId);
                    setSelectedConfidence(candidate.confidence);
                  }}
                />
                <p className="font-semibold text-zinc-900">{candidate.displayName}</p>
                <p className="text-sm text-zinc-600">{candidate.formattedAddress}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  Confidence {candidate.confidence}% · Rating {candidate.rating ?? "n/a"} · Reviews{" "}
                  {candidate.reviewCount ?? "n/a"}
                </p>
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Confidence is based on name and location matching over Google Places results.
          </p>
        </div>
      ) : null}

      <input type="hidden" name="query" value={query} />
      <input type="hidden" name="locationHint" value={locationHint} />
      <input type="hidden" name="placeId" value={selectedPlaceId} />
      <input type="hidden" name="candidateConfidence" value={selectedConfidence || 0} />
      <input type="hidden" name="planIntent" value={selectedPlan ?? ""} />

      {state.status === "error" && state.formError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.formError}</p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="submit"
          disabled={pending || !selected}
          className="inline-flex w-full items-center justify-center rounded-full bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
        >
          {pending
            ? "Running scan..."
            : selectedPlan
              ? `Continue (${selectedPlan === "base" ? "Base" : "Pro"})`
              : "Get free score preview"}
        </button>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {!selectedPlan ? (
            <>
              <Link href="/scan?plan=base" className="rounded-full border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:border-zinc-400">
                Start Base
              </Link>
              <Link href="/scan?plan=pro" className="rounded-full bg-red-600 px-3 py-2 text-white hover:bg-red-500">
                Start Pro
              </Link>
            </>
          ) : selectedPlan === "base" ? (
            <Link href="/scan?plan=pro" className="rounded-full bg-red-600 px-3 py-2 text-white hover:bg-red-500">
              Prefer Pro instead?
            </Link>
          ) : (
            <Link href="/scan?plan=base" className="rounded-full border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:border-zinc-400">
              Choose Base instead
            </Link>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        You see score, verdict, and top findings first. Unlock sends the full report to your inbox.
      </p>
      <p className="text-xs text-zinc-500">
        Sources: Google Places, homepage crawl, public social links from that page (when found), and sampled local rank
        estimates. Website URL comes from the listing when Google provides it.
      </p>
    </form>
  );
}

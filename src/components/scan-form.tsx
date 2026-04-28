"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { generateReportAction, type ReportActionState } from "@/app/actions/report";
import type { FocusArea } from "@/lib/validation/scan";

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

type ScanMode = "places" | "website";

const FOCUS_AREA_OPTIONS: { value: FocusArea; label: string; sublabel: string }[] = [
  { value: "local", label: "Local", sublabel: "My city or area" },
  { value: "regional", label: "Regional", sublabel: "My state or region" },
  { value: "national", label: "National", sublabel: "Entire country" },
  { value: "online", label: "Online / Worldwide", sublabel: "No specific location" },
];

function FocusAreaPicker({
  value,
  onChange,
}: {
  value: FocusArea;
  onChange: (v: FocusArea) => void;
}) {
  return (
    <div>
      <span className="text-sm font-medium text-zinc-800">Who are you trying to reach?</span>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FOCUS_AREA_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-xl border px-3 py-2.5 text-left transition ${
              value === opt.value
                ? "border-red-400 bg-red-50 ring-1 ring-red-300"
                : "border-zinc-200 bg-white hover:border-zinc-300"
            }`}
          >
            <p className="text-xs font-semibold text-zinc-900">{opt.label}</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">{opt.sublabel}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function ScopeInput({
  focusArea,
  value,
  onChange,
  defaultCity,
}: {
  focusArea: FocusArea;
  value: string;
  onChange: (v: string) => void;
  defaultCity?: string;
}) {
  if (focusArea === "online") return null;

  const config = {
    local: { label: "Your city", placeholder: defaultCity || "e.g. Austin, TX" },
    regional: { label: "Your state or region", placeholder: "e.g. Texas" },
    national: { label: "Your country", placeholder: "e.g. United States" },
  }[focusArea];

  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-zinc-800">{config.label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-red-500/30 focus:ring-4"
        placeholder={config.placeholder}
      />
    </label>
  );
}

export function ScanForm({
  selectedPlan,
  promoCode,
}: {
  selectedPlan?: "starter" | "growth" | "pro" | "agency" | null;
  promoCode?: "ILoveYouFree" | "ILikeYou50" | null;
}) {
  const [state, formAction, pending] = useActionState(generateReportAction, initialState);

  // Mode toggle
  const [scanMode, setScanMode] = useState<ScanMode>("places");

  // Places mode state
  const [query, setQuery] = useState("");
  const [locationHint, setLocationHint] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>("");
  const [selectedConfidence, setSelectedConfidence] = useState<number>(0);

  // Website mode state
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [businessName, setBusinessName] = useState("");

  // Shared focus area state
  const [focusArea, setFocusArea] = useState<FocusArea>("local");
  const [targetScope, setTargetScope] = useState("");

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
        // Auto-fill location hint into targetScope
        if (!targetScope) setTargetScope(locationHint);
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

  // When mode switches, reset focus area default
  function handleModeSwitch(mode: ScanMode) {
    setScanMode(mode);
    setCandidates([]);
    setSelectedPlaceId("");
    setSearchError(null);
    setFocusArea(mode === "website" ? "online" : "local");
    setTargetScope("");
  }

  const canSubmitPlaces = Boolean(selected);
  const canSubmitWebsite = Boolean(websiteUrl.trim()) && Boolean(businessName.trim());
  const canSubmit = scanMode === "places" ? canSubmitPlaces : canSubmitWebsite;

  return (
    <form action={formAction} className="mx-auto max-w-2xl space-y-6">
      {/* Mode toggle */}
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">Step 1 · How do you want to identify your business?</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleModeSwitch("places")}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              scanMode === "places"
                ? "border-red-400 bg-red-50 ring-1 ring-red-300"
                : "border-zinc-200 bg-white hover:border-zinc-300"
            }`}
          >
            <p className="text-sm font-semibold text-zinc-900">Local business</p>
            <p className="mt-0.5 text-xs text-zinc-500">Find your Google listing — restaurants, contractors, dentists, salons, home services, and more.</p>
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch("website")}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              scanMode === "website"
                ? "border-red-400 bg-red-50 ring-1 ring-red-300"
                : "border-zinc-200 bg-white hover:border-zinc-300"
            }`}
          >
            <p className="text-sm font-semibold text-zinc-900">Website / online business</p>
            <p className="mt-0.5 text-xs text-zinc-500">No Google listing? Enter your URL — e-commerce, SaaS, agencies, or any online brand.</p>
          </button>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          No Google Business Profile, or not sure if you have one?{" "}
          <button type="button" onClick={() => handleModeSwitch("website")} className="font-semibold text-red-800 underline hover:text-red-900">
            Use the website tab instead — no Google account needed.
          </button>
        </p>
      </div>

      {/* Places mode */}
      {scanMode === "places" && (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">
            {selectedPlan ? "Step 2 · Identify the listing" : "Step 2 · Find your Google listing"}
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
      )}

      {/* Places candidates */}
      {scanMode === "places" && candidates.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">Step 3 · Confirm match</p>
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
      )}

      {/* Website mode */}
      {scanMode === "website" && (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">Step 2 · Enter your website</p>
          <div className="mt-3 space-y-3">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-800">Website URL</span>
              <input
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                type="url"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-red-500/30 focus:ring-4"
                placeholder="https://yourwebsite.com"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-zinc-800">Business or brand name</span>
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-red-500/30 focus:ring-4"
                placeholder="e.g. Acme Marketing Co."
              />
            </label>
          </div>
        </div>
      )}

      {/* Focus area — shown after a listing is confirmed (places) or always (website) */}
      {(scanMode === "website" || candidates.length > 0) && (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">
            {scanMode === "places" ? "Step 4" : "Step 3"} · Focus area
          </p>
          <FocusAreaPicker value={focusArea} onChange={setFocusArea} />
          <ScopeInput
            focusArea={focusArea}
            value={targetScope}
            onChange={setTargetScope}
            defaultCity={locationHint}
          />
          {focusArea === "online" && (
            <p className="text-xs text-zinc-500">
              Online / worldwide mode generates niche-focused content without city references.
            </p>
          )}
        </div>
      )}

      {/* Hidden fields */}
      <input type="hidden" name="scanMode" value={scanMode} />
      {scanMode === "places" ? (
        <>
          <input type="hidden" name="query" value={query} />
          <input type="hidden" name="locationHint" value={locationHint} />
          <input type="hidden" name="placeId" value={selectedPlaceId} />
          <input type="hidden" name="candidateConfidence" value={selectedConfidence || 0} />
        </>
      ) : (
        <>
          <input type="hidden" name="websiteUrl" value={websiteUrl} />
          <input type="hidden" name="businessName" value={businessName} />
        </>
      )}
      <input type="hidden" name="focusArea" value={focusArea} />
      <input type="hidden" name="targetScope" value={targetScope} />
      <input type="hidden" name="planIntent" value={selectedPlan ?? ""} />
      <input type="hidden" name="promoCodeIntent" value={promoCode ?? ""} />

      {state.status === "error" && state.formError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.formError}</p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="submit"
          disabled={pending || !canSubmit}
          className="inline-flex w-full items-center justify-center rounded-full bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
        >
          {pending
            ? "Running scan..."
            : selectedPlan
              ? `Continue (${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)})`
              : "Get free score preview"}
        </button>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {!selectedPlan ? (
            <>
              <Link
                href={promoCode ? `/scan?plan=starter&promo=${encodeURIComponent(promoCode)}` : "/scan?plan=starter"}
                className="rounded-full border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:border-zinc-400"
              >
                Start Starter
              </Link>
              <Link
                href={promoCode ? `/scan?plan=growth&promo=${encodeURIComponent(promoCode)}` : "/scan?plan=growth"}
                className="rounded-full bg-red-600 px-3 py-2 text-white hover:bg-red-500"
              >
                Start Growth
              </Link>
            </>
          ) : selectedPlan === "starter" ? (
            <Link
              href={promoCode ? `/scan?plan=growth&promo=${encodeURIComponent(promoCode)}` : "/scan?plan=growth"}
              className="rounded-full bg-red-600 px-3 py-2 text-white hover:bg-red-500"
            >
              Prefer Growth instead?
            </Link>
          ) : (
            <Link
              href={promoCode ? `/scan?plan=starter&promo=${encodeURIComponent(promoCode)}` : "/scan?plan=starter"}
              className="rounded-full border border-zinc-300 bg-white px-3 py-2 text-zinc-900 hover:border-zinc-400"
            >
              Choose Starter instead
            </Link>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        You see score, verdict, and top findings first. Unlock sends the full report to your inbox.
      </p>
      <p className="text-xs text-zinc-500">
        Local mode: Google Places, homepage crawl, public social links, and sampled local rank estimates.
        Website mode: homepage crawl, social links, and Search Console (if connected).
      </p>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { addLocation, removeLocation, type LocationRow } from "./location-actions";

type Props = {
  businessId: string;
  initialLocations: LocationRow[];
  maxLocations: number;
  planLabel: string;
};

export function LocationsSection({ businessId, initialLocations, maxLocations, planLabel }: Props) {
  const [locs, setLocs] = useState<LocationRow[]>(initialLocations);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    stateRegion: "",
    website: "",
  });

  function handleAdd() {
    if (!form.name.trim()) {
      setError("Location name is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addLocation(businessId, {
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        stateRegion: form.stateRegion.trim() || undefined,
        website: form.website.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Failed to add location.");
        return;
      }
      // Refresh from server by reloading — simpler than re-fetching client-side
      window.location.reload();
    });
  }

  function handleRemove(locationId: string) {
    startTransition(async () => {
      const result = await removeLocation(businessId, locationId);
      if (!result.ok) {
        setError(result.error ?? "Failed to remove location.");
        return;
      }
      setLocs((prev) => prev.filter((l) => l.id !== locationId));
    });
  }

  const atLimit = locs.length >= maxLocations;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Locations</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {planLabel} plan: up to {maxLocations} location{maxLocations === 1 ? "" : "s"}. Each location gets its own
            visibility tracking and automation queue.
          </p>
        </div>
        {!atLimit && !showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="shrink-0 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
          >
            Add location
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {showForm ? (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-zinc-900">New location</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-zinc-700">Business name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Acme Plumbing — Westside"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-700">Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="123 Main St"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-700">City</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="Austin"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-700">State</label>
              <input
                type="text"
                value={form.stateRegion}
                onChange={(e) => setForm((f) => ({ ...f, stateRegion: e.target.value }))}
                placeholder="TX"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-red-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-zinc-700">Website</label>
              <input
                type="url"
                value={form.website}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                placeholder="https://example.com"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-red-500"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAdd}
              disabled={isPending}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Add location"}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(null); }}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-400"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <ul className="mt-4 space-y-2">
        {locs.map((loc) => (
          <li key={loc.id} className="flex items-start justify-between gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-zinc-900">{loc.name}</p>
              {(loc.city || loc.stateRegion) ? (
                <p className="text-xs text-zinc-500">
                  {[loc.address, loc.city, loc.stateRegion].filter(Boolean).join(", ")}
                </p>
              ) : null}
              {loc.website ? (
                <a href={loc.website} target="_blank" rel="noreferrer" className="text-xs text-red-800 underline">
                  {loc.website}
                </a>
              ) : null}
            </div>
            <button
              onClick={() => handleRemove(loc.id)}
              disabled={isPending}
              className="shrink-0 rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:border-red-300 hover:text-red-700 disabled:opacity-50"
            >
              Remove
            </button>
          </li>
        ))}
        {!locs.length ? (
          <li className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
            No additional locations added yet. Add locations to track their visibility separately.
          </li>
        ) : null}
      </ul>

      {atLimit ? (
        <p className="mt-3 text-xs text-zinc-500">
          You&apos;ve reached the {maxLocations}-location limit for {planLabel}. Upgrade to add more.
        </p>
      ) : null}
    </div>
  );
}

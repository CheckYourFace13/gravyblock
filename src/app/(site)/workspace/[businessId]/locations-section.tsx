"use client";

import { useState, useTransition } from "react";
import { addLocation, removeLocation, type LocationRow } from "./location-actions";

type Props = {
  businessId: string;
  initialLocations: LocationRow[];
  maxLocations: number;
  planLabel: string;
};

const MAX_ADDON_LOCATIONS = 2;

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

  const includedFree = locs.length === 0 || (locs.length >= 1 && !locs[0]?.isAddon);
  const addonCount = locs.filter((l) => l.isAddon).length;
  const atAddonLimit = addonCount >= MAX_ADDON_LOCATIONS;
  const nextWillBeAddon = locs.length >= 1;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Locations</h2>
          <p className="mt-1 text-sm text-zinc-600">
            1 location included with Pro. Add up to {MAX_ADDON_LOCATIONS} more at $99.99/mo each — billed automatically to your card on file.
          </p>
        </div>
        {!atAddonLimit && !showForm ? (
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
          <div>
            <p className="text-sm font-semibold text-zinc-900">New location</p>
            {nextWillBeAddon ? (
              <p className="mt-0.5 text-xs text-zinc-500">
                This is an add-on location — <span className="font-semibold text-zinc-700">$99.99/mo</span> will be added to your subscription immediately (prorated for the current period).
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-zinc-500">First location is included free with your Pro plan.</p>
            )}
          </div>
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
              {isPending ? "Adding..." : nextWillBeAddon ? "Add location — $99.99/mo" : "Add location"}
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
              <div className="flex items-center gap-2">
                <p className="font-semibold text-zinc-900">{loc.name}</p>
                {loc.isAddon ? (
                  <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">+$99.99/mo</span>
                ) : (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">Included</span>
                )}
              </div>
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
            {loc.isAddon ? (
              <button
                onClick={() => handleRemove(loc.id)}
                disabled={isPending}
                className="shrink-0 rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:border-red-300 hover:text-red-700 disabled:opacity-50"
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
        {!locs.length ? (
          <li className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
            No locations added yet. Your first location is included free.
          </li>
        ) : null}
      </ul>

      {atAddonLimit ? (
        <p className="mt-3 text-xs text-zinc-500">
          You&apos;ve added the maximum {MAX_ADDON_LOCATIONS} extra locations for Pro. Need more? Contact us about Agency.
        </p>
      ) : null}
    </div>
  );
}

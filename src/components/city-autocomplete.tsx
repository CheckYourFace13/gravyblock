"use client";

import { useState, useRef, useEffect, useCallback } from "react";

type CitySuggestion = { label: string; city: string; placeId: string };

/**
 * Verified city picker. The hidden input (name) only receives a value when the
 * user selects a real city from Google's results — free-typed text never
 * submits, so downstream data is always a real place.
 */
export function CityAutocomplete({
  name,
  defaultValue = "",
  placeholder = "Start typing your city…",
  required,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [query, setQuery] = useState(defaultValue);
  const [confirmed, setConfirmed] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/google/places/city-autocomplete?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { results?: CitySuggestion[] };
      setSuggestions(data.results ?? []);
      setOpen((data.results?.length ?? 0) > 0);
    } catch { setSuggestions([]); } finally { setLoading(false); }
  }, []);

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    setConfirmed(""); // invalidate until a real pick
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void fetchSuggestions(q), 300);
  }

  function pick(s: CitySuggestion) {
    setQuery(s.city);
    setConfirmed(s.city);
    setOpen(false);
    setSuggestions([]);
  }

  const border = confirmed ? "border-emerald-400 ring-1 ring-emerald-200" : query ? "border-amber-300" : "border-zinc-200";

  return (
    <div ref={wrap} className="relative">
      <input type="hidden" name={name} value={confirmed} required={required} />
      <div className="relative">
        <input
          type="text" value={query} onChange={onInput} placeholder={placeholder} autoComplete="off"
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          className={`w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-4 pr-8 ${border}`}
        />
        {loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 animate-pulse">…</span>}
        {confirmed && !loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">✓</span>}
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button type="button" onMouseDown={() => pick(s)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-zinc-50">
                <span className="text-zinc-400">📍</span><span className="font-medium text-zinc-900">{s.city}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query && !confirmed && !open && query.length > 2 && (
        <p className="mt-1 text-xs text-amber-600">Pick a city from the list so we target a real location.</p>
      )}
    </div>
  );
}

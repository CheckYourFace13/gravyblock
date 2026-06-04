"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { saveBusinessProfile, generateBusinessProfile, type BusinessProfileData, type DiscoveredSocial } from "./business-profile-actions";

// ── Address autocomplete ─────────────────────────────────────────────────────

type AddressSuggestion = { label: string; address: string; city: string; state: string; country: string; placeId: string };

function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Start typing your address…",
}: {
  value: string;
  onChange: (address: string, city: string, state: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(Boolean(value));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value && value !== query) { setQuery(value); setConfirmed(true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 3) { setSuggestions([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/google/places/address-autocomplete?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { results?: AddressSuggestion[] };
      setSuggestions(data.results ?? []);
      setOpen((data.results?.length ?? 0) > 0);
    } catch { setSuggestions([]); } finally { setLoading(false); }
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    setConfirmed(false);
    onChange(q, "", ""); // keep raw text until confirmed
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchSuggestions(q), 300);
  }

  function handleSelect(s: AddressSuggestion) {
    setQuery(s.address);
    setConfirmed(true);
    setOpen(false);
    setSuggestions([]);
    onChange(s.address, s.city, s.state);
  }

  const borderClass = confirmed
    ? "border-emerald-400 ring-1 ring-emerald-200"
    : query && !confirmed ? "border-amber-300" : "border-zinc-200";

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full rounded-xl border px-3 py-2.5 text-sm bg-white focus:outline-none transition-colors pr-8 ${borderClass}`}
        />
        {loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs animate-pulse">…</span>}
        {confirmed && !loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">✓</span>}
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button type="button" onMouseDown={() => handleSelect(s)}
                className="w-full px-3 py-2.5 text-left text-sm hover:bg-zinc-50 flex items-start gap-2">
                <span className="text-zinc-400 shrink-0 mt-0.5">📍</span>
                <span>
                  <span className="font-medium text-zinc-900">{s.address}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Region autocomplete (for countries without a built-in state list) ────────

function RegionAutocomplete({
  value,
  country,
  onChange,
}: {
  value: string;
  country: string;
  onChange: (region: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value && value !== query) { setQuery(value); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchRegions = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/google/places/city-autocomplete?q=${encodeURIComponent(q + " " + country)}&type=region`);
      const data = (await res.json()) as { results?: Array<{ city: string }> };
      const regions = (data.results ?? []).map((r) => r.city.split(",")[0]?.trim() ?? r.city).filter(Boolean);
      setSuggestions([...new Set(regions)].slice(0, 8));
      setOpen(regions.length > 0);
    } catch { setSuggestions([]); } finally { setLoading(false); }
  }, [country]);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    onChange(""); // clear until confirmed
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchRegions(q), 300);
  }

  function handleSelect(region: string) {
    setQuery(region);
    onChange(region);
    setOpen(false);
    setSuggestions([]);
  }

  const isConfirmed = Boolean(value && value === query);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Type to search regions…"
          autoComplete="off"
          className={`w-full rounded-xl border px-3 py-2.5 text-sm bg-white focus:outline-none pr-8 transition-colors ${
            isConfirmed ? "border-emerald-400" : query && !isConfirmed ? "border-amber-300" : "border-zinc-200"
          }`}
        />
        {loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs animate-pulse">…</span>}
        {isConfirmed && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">✓</span>}
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden">
          {suggestions.map((region) => (
            <li key={region}>
              <button type="button" onMouseDown={() => handleSelect(region)}
                className="w-full px-3 py-2.5 text-left text-sm hover:bg-zinc-50 font-medium text-zinc-900">
                📍 {region}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query && !isConfirmed && !open && query.length > 2 && (
        <p className="mt-1 text-xs text-amber-600">Select a region from the list to confirm it.</p>
      )}
    </div>
  );
}

// ── Radius slider ─────────────────────────────────────────────────────────────

function RadiusSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const pct = ((value - 2) / (500 - 2)) * 100;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-zinc-600">Serve customers within</label>
        <span className="text-sm font-semibold text-zinc-900 tabular-nums">
          {value} <span className="text-zinc-500 font-normal">miles</span>
        </span>
      </div>
      <input
        type="range"
        min={2}
        max={500}
        step={1}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer accent-red-600"
        style={{
          background: `linear-gradient(to right, #dc2626 ${pct}%, #e4e4e7 ${pct}%)`,
        }}
      />
      <div className="flex justify-between mt-1 text-[10px] text-zinc-400">
        <span>2 mi</span>
        <span>25</span>
        <span>50</span>
        <span>100</span>
        <span>250</span>
        <span>500 mi</span>
      </div>
    </div>
  );
}

// ── Regions by country ────────────────────────────────────────────────────────

const REGIONS_BY_COUNTRY: Record<string, string[]> = {
  "United States": [
    "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
    "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
    "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
    "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
    "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
    "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
    "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
    "Wisconsin","Wyoming","District of Columbia",
  ],
  "Canada": [
    "Alberta","British Columbia","Manitoba","New Brunswick",
    "Newfoundland and Labrador","Northwest Territories","Nova Scotia","Nunavut",
    "Ontario","Prince Edward Island","Quebec","Saskatchewan","Yukon",
  ],
  "United Kingdom": [
    "England","Scotland","Wales","Northern Ireland",
    "Greater London","South East","South West","East of England","West Midlands",
    "East Midlands","Yorkshire and the Humber","North West","North East",
  ],
  "Australia": [
    "New South Wales","Victoria","Queensland","Western Australia",
    "South Australia","Tasmania","Australian Capital Territory","Northern Territory",
  ],
  "Germany": [
    "Baden-Württemberg","Bavaria","Berlin","Brandenburg","Bremen","Hamburg",
    "Hesse","Lower Saxony","Mecklenburg-Vorpommern","North Rhine-Westphalia",
    "Rhineland-Palatinate","Saarland","Saxony","Saxony-Anhalt",
    "Schleswig-Holstein","Thuringia",
  ],
  "Mexico": [
    "Aguascalientes","Baja California","Baja California Sur","Campeche","Chiapas",
    "Chihuahua","Coahuila","Colima","Durango","Guanajuato","Guerrero","Hidalgo",
    "Jalisco","Mexico City","México","Michoacán","Morelos","Nayarit","Nuevo León",
    "Oaxaca","Puebla","Querétaro","Quintana Roo","San Luis Potosí","Sinaloa",
    "Sonora","Tabasco","Tamaulipas","Tlaxcala","Veracruz","Yucatán","Zacatecas",
  ],
  "India": [
    "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa",
    "Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala",
    "Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland",
    "Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura",
    "Uttar Pradesh","Uttarakhand","West Bengal","Delhi",
  ],
  "Brazil": [
    "Acre","Alagoas","Amapá","Amazonas","Bahia","Ceará","Distrito Federal",
    "Espírito Santo","Goiás","Maranhão","Mato Grosso","Mato Grosso do Sul",
    "Minas Gerais","Pará","Paraíba","Paraná","Pernambuco","Piauí",
    "Rio de Janeiro","Rio Grande do Norte","Rio Grande do Sul","Rondônia",
    "Roraima","Santa Catarina","São Paulo","Sergipe","Tocantins",
  ],
};

const COUNTRIES = [
  "United States","Canada","United Kingdom","Australia","Germany","France",
  "Spain","Italy","Netherlands","Brazil","Mexico","India","Japan","South Korea",
  "Singapore","New Zealand","Ireland","South Africa","Nigeria","UAE",
];

// ── Location section ──────────────────────────────────────────────────────────

type Scope = "global" | "national" | "regional" | "local";

const SCOPE_OPTIONS: { value: Scope; label: string; icon: string; desc: string }[] = [
  { value: "global",   icon: "🌍", label: "Global",   desc: "Worldwide audience — no location in content" },
  { value: "national", icon: "🗺️",  label: "National", desc: "Country-level — e.g. 'across the US'" },
  { value: "regional", icon: "📍", label: "Regional",  desc: "State or multi-city — e.g. 'across Texas'" },
  { value: "local",    icon: "🏪", label: "Local",     desc: "Single city or neighborhood — most specific" },
];

/** Derives the targetScope text used in AI content prompts */
function deriveTargetScope(scope: Scope, country: string, state: string, address: string): string {
  if (scope === "global") return "worldwide";
  if (scope === "national") return country;
  if (scope === "regional") return state ? `${state}, ${country}` : country;
  // local — extract city from address
  if (address) {
    const parts = address.split(",").map((s) => s.trim());
    if (parts.length >= 2) {
      const city = parts[parts.length - 3] ?? parts[0];
      const statePart = parts[parts.length - 2]?.replace(/\d+/g, "").trim();
      return statePart ? `${city}, ${statePart}` : city;
    }
    return address.split(",")[0]?.trim() ?? address;
  }
  return state ? `${state}, ${country}` : country;
}

function LocationSection({
  scope, country, state, address, radius, businessAddress,
  onScopeChange, onCountryChange, onStateChange, onAddressChange, onRadiusChange,
}: {
  scope: Scope;
  country: string;
  state: string;
  address: string;
  radius: number;
  businessAddress: string | null;
  onScopeChange: (s: Scope) => void;
  onCountryChange: (c: string) => void;
  onStateChange: (s: string) => void;
  onAddressChange: (addr: string, city: string, st: string) => void;
  onRadiusChange: (r: number) => void;
}) {
  const targetScope = deriveTargetScope(scope, country, state, address);

  return (
    <div className="md:col-span-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 space-y-5">
      <div>
        <p className="text-sm font-semibold text-zinc-900 mb-0.5">Market scope</p>
        <p className="text-xs text-zinc-500 mb-4">
          This is the foundation of everything GravyBlock does for you — every article, post, and page
          targets this location. Start broad, then drill down.
        </p>

        {/* Scope selector */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SCOPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onScopeChange(opt.value)}
              className={`flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-3 text-center transition-all ${
                scope === opt.value
                  ? "border-red-500 bg-red-50 text-red-800"
                  : "border-zinc-200 bg-white hover:border-zinc-300 text-zinc-700"
              }`}
            >
              <span className="text-xl">{opt.icon}</span>
              <span className="text-xs font-semibold">{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Description of selected scope */}
        <p className="mt-2 text-xs text-zinc-500">
          {SCOPE_OPTIONS.find((o) => o.value === scope)?.desc}
        </p>
      </div>

      {/* GLOBAL — no further input needed */}
      {scope === "global" && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-sm font-medium text-blue-800">
            ✓ Content will be written for a worldwide audience — no country or city references.
          </p>
          <p className="text-xs text-blue-600 mt-1">GBP posts and local city pages are skipped for global businesses.</p>
        </div>
      )}

      {/* NATIONAL — country only */}
      {scope === "national" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1.5">Country</label>
            <select
              value={country}
              onChange={(e) => onCountryChange(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-zinc-400"
            >
              {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
            <p className="text-xs font-medium text-emerald-800">
              ✓ Content will say things like "across {country}" and "serving customers throughout {country}"
            </p>
          </div>
        </div>
      )}

      {/* REGIONAL — country + state + address + radius */}
      {scope === "regional" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1.5">Country</label>
              <select
                value={country}
                onChange={(e) => onCountryChange(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-zinc-400"
              >
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1.5">
                State / Province
              </label>
              {REGIONS_BY_COUNTRY[country] ? (
                <select
                  value={state}
                  onChange={(e) => onStateChange(e.target.value)}
                  className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-zinc-400 ${
                    state ? "border-emerald-400" : "border-zinc-200"
                  }`}
                >
                  <option value="">Select region…</option>
                  {REGIONS_BY_COUNTRY[country]!.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                // For countries without a built-in list, use Google Places region autocomplete
                <RegionAutocomplete
                  value={state}
                  country={country}
                  onChange={onStateChange}
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1.5">
              Your business address
              <span className="ml-1 font-normal text-zinc-400">(your base within the region)</span>
            </label>
            <AddressAutocomplete
              value={address || businessAddress || ""}
              onChange={onAddressChange}
              placeholder="123 Main St, Austin, TX 78701"
            />
            <p className="mt-1 text-xs text-zinc-400">Pre-filled from your website or Google listing. Edit to correct.</p>
          </div>

          <RadiusSlider value={radius} onChange={onRadiusChange} />

          {state && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
              <p className="text-xs font-medium text-emerald-800">
                ✓ Content will target customers in <strong>{state}</strong> within <strong>{radius} miles</strong> of your location
              </p>
            </div>
          )}
        </div>
      )}

      {/* LOCAL — address + radius (city auto-derived) */}
      {scope === "local" && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1.5">
              Your business address
            </label>
            <AddressAutocomplete
              value={address || businessAddress || ""}
              onChange={onAddressChange}
              placeholder="123 Main St, Houston, TX 77001"
            />
            <p className="mt-1 text-xs text-zinc-400">
              Pre-filled from your website or Google listing. Edit to correct — this exact address is used in every article, GBP post, and page.
            </p>
          </div>

          <RadiusSlider value={radius} onChange={onRadiusChange} />

          {targetScope && targetScope !== "worldwide" && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
              <p className="text-xs font-medium text-emerald-800">
                ✓ Content will target customers in <strong>{targetScope}</strong> within <strong>{radius} miles</strong> of your location
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TONE_OPTIONS = ["professional", "friendly", "authoritative", "casual"];

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  twitter: "Twitter / X",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
};

type SourceInfo = { websiteScraped: boolean; socialFound: string[]; websiteUrl: string | null };

const EMPTY: BusinessProfileData = {
  serviceDescription: "",
  uniqueSellingPoints: "",
  tone: "professional",
  brandVoice: "",
  targetKeywords: "",
  targetCities: "",
  competitorNames: "",
  additionalContext: "",
  focusArea: "local",
  targetScope: "",
  serviceAddress: "",
  serviceCountry: "United States",
  serviceState: "",
  serviceRadius: 25,
  instagramHandle: "",
  facebookUrl: "",
};

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  businessId: string;
  businessName: string;
  initialConfig: BusinessProfileData | null;
  discoveredSocials: DiscoveredSocial[];
  /** Business address from Google Places — used to pre-fill if no config saved yet */
  businessAddress: string | null;
};

export function BusinessProfileSection({
  businessId,
  businessName,
  initialConfig,
  discoveredSocials,
  businessAddress,
}: Props) {
  const [form, setForm] = useState<BusinessProfileData>(initialConfig ?? EMPTY);
  const [scope, setScope] = useState<Scope>((initialConfig?.focusArea as Scope) ?? "local");
  const [country, setCountry] = useState(initialConfig?.serviceCountry ?? "United States");
  const [stateVal, setStateVal] = useState(initialConfig?.serviceState ?? "");
  const [address, setAddress] = useState(
    initialConfig?.serviceAddress ?? businessAddress ?? ""
  );
  const [radius, setRadius] = useState(initialConfig?.serviceRadius ?? 25);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [sources, setSources] = useState<SourceInfo | null>(null);
  const [isPending, startTransition] = useTransition();

  function field(key: keyof BusinessProfileData) {
    return {
      value: String(form[key] ?? ""),
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  function buildSavePayload(): BusinessProfileData {
    const targetScope = deriveTargetScope(scope, country, stateVal, address);
    return {
      ...form,
      focusArea: scope,
      targetScope,
      serviceAddress: address,
      serviceCountry: country,
      serviceState: stateVal,
      serviceRadius: radius,
      targetCities: address, // keep in sync for legacy reads
    };
  }

  function handleGenerate() {
    setStatus(null);
    setSources(null);
    startTransition(async () => {
      const result = await generateBusinessProfile(businessId);
      if (result.ok && result.profile) {
        const p = result.profile;
        setForm(p);
        if (p.focusArea) setScope(p.focusArea as Scope);
        if (p.serviceCountry) setCountry(p.serviceCountry);
        if (p.serviceState) setStateVal(p.serviceState);
        if (p.serviceAddress) setAddress(p.serviceAddress);
        else if (p.targetScope) setAddress(p.targetScope);
        if (p.serviceRadius) setRadius(p.serviceRadius);
        setSources(result.sources ?? null);
        setStatus({ ok: true, message: "Profile pulled from your website and business data. Review each field and save." });
      } else {
        setStatus({ ok: false, message: result.error ?? "Generation failed." });
      }
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const toSave = buildSavePayload();
    startTransition(async () => {
      const result = await saveBusinessProfile(businessId, toSave);
      if (result.ok) {
        setForm(toSave);
        setStatus({ ok: true, message: "Saved. All content will now use this location and scope." });
      } else {
        setStatus({ ok: false, message: result.error ?? "Save failed." });
      }
    });
  }

  const hasSocials = discoveredSocials.length > 0;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Business profile</h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-600">
            Every article, post, and campaign is built from this profile.{" "}
            <strong className="text-zinc-800">Click "Pull from website" first</strong> — we'll scrape your site and pre-fill everything automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isPending}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 shrink-0"
        >
          {isPending ? "Pulling…" : initialConfig ? "Re-pull from website" : "Pull from website ✦"}
        </button>
      </div>

      {!status && !initialConfig && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>Profile not set up yet.</strong> Click <strong>"Pull from website"</strong> — we'll read your website, Google listing, and social profiles, then pre-fill everything below.
        </div>
      )}

      {status && (
        <div className={`mt-4 rounded-lg px-3 py-2 text-sm font-medium ${status.ok ? "bg-green-50 text-green-800 border border-green-100" : "bg-red-50 text-red-800 border border-red-100"}`}>
          {status.message}
        </div>
      )}

      {sources && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${sources.websiteScraped ? "bg-green-50 text-green-800 border border-green-200" : "bg-zinc-100 text-zinc-500"}`}>
            {sources.websiteScraped ? "✓" : "✗"} Website scraped
            {sources.websiteUrl ? ` (${sources.websiteUrl.replace(/^https?:\/\//, "").split("/")[0]})` : ""}
          </span>
          {sources.socialFound.map((platform) => (
            <span key={platform} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 border border-blue-200">
              ✓ {PLATFORM_LABELS[platform] ?? platform} found
            </span>
          ))}
        </div>
      )}

      {hasSocials && !sources && (
        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
          <p className="text-xs font-semibold text-blue-800 mb-1">Found on your website at scan time:</p>
          <div className="flex flex-wrap gap-2">
            {discoveredSocials.map((s) => (
              <a key={s.platform} href={s.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-white border border-blue-200 px-2.5 py-0.5 text-xs text-blue-700 hover:bg-blue-100">
                {PLATFORM_LABELS[s.platform] ?? s.platform}{s.handle ? ` @${s.handle}` : ""} ↗
              </a>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="mt-5 space-y-5">
        <div className="grid gap-5 md:grid-cols-2">

          {/* ── LOCATION SECTION (top of form — foundation of everything) ── */}
          <LocationSection
            scope={scope}
            country={country}
            state={stateVal}
            address={address}
            radius={radius}
            businessAddress={businessAddress}
            onScopeChange={(s) => { setScope(s); setForm((p) => ({ ...p, focusArea: s })); }}
            onCountryChange={(c) => { setCountry(c); setStateVal(""); }}
            onStateChange={setStateVal}
            onAddressChange={(addr, city, st) => {
              setAddress(addr);
              if (st) setStateVal(st);
            }}
            onRadiusChange={setRadius}
          />

          {/* ── SERVICE DESCRIPTION ── */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              What does {businessName} do?
              <span className="ml-2 font-normal normal-case text-zinc-400">Pulled from your website</span>
            </label>
            <textarea
              {...field("serviceDescription")}
              rows={3}
              placeholder="Describe your services, who you serve, and what makes you reliable."
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>

          {/* ── UNIQUE SELLING POINTS ── */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              What sets you apart?
              <span className="ml-2 font-normal normal-case text-zinc-400">Pulled from your website</span>
            </label>
            <textarea
              {...field("uniqueSellingPoints")}
              rows={3}
              placeholder="e.g. 20 years experience, same-day service, family owned, only certified provider in the area..."
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>

          {/* ── TARGET KEYWORDS ── */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Target keywords <span className="font-normal text-zinc-400">(comma-separated)</span>
            </label>
            <input
              type="text"
              {...field("targetKeywords")}
              placeholder="plumber Austin TX, emergency plumbing, water heater repair..."
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>

          {/* ── TONE ── */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Content tone
            </label>
            <select
              {...field("tone")}
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none bg-white"
            >
              {TONE_OPTIONS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>

          {/* ── BRAND VOICE ── */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Brand voice <span className="font-normal text-zinc-400">(writing style, pulled from your site)</span>
            </label>
            <textarea
              {...field("brandVoice")}
              rows={2}
              placeholder="e.g. 'Conversational and warm, like a trusted neighbor. Simple language, no jargon, always ends with a clear local call-to-action.'"
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>

          {/* ── SOCIAL ── */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Instagram handle
              {discoveredSocials.find(s => s.platform === "instagram") && (
                <span className="ml-2 font-normal normal-case text-blue-600">found on your website ✓</span>
              )}
            </label>
            <input type="text" {...field("instagramHandle")} placeholder="@yourbusiness"
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Facebook page URL
              {discoveredSocials.find(s => s.platform === "facebook") && (
                <span className="ml-2 font-normal normal-case text-blue-600">found on your website ✓</span>
              )}
            </label>
            <input type="url" {...field("facebookUrl")} placeholder="https://facebook.com/yourbusiness"
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none" />
          </div>

          {/* ── COMPETITORS ── */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Competitors <span className="font-normal text-zinc-400">(names, comma-separated)</span>
            </label>
            <input type="text" {...field("competitorNames")} placeholder="ABC Plumbing, XYZ Services..."
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none" />
          </div>

          {/* ── ADDITIONAL CONTEXT ── */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Anything else AI should know <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <textarea
              {...field("additionalContext")}
              rows={2}
              placeholder="e.g. We're the only NATE-certified HVAC company in Travis County. We don't do commercial. We're closed Sundays."
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-zinc-100 pt-4">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save profile"}
          </button>
          <p className="text-xs text-zinc-500">
            Saved profiles are used immediately for all new content generation.
          </p>
        </div>
      </form>
    </section>
  );
}

"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { saveBusinessProfile, generateBusinessProfile, type BusinessProfileData, type DiscoveredSocial } from "./business-profile-actions";

// ── City autocomplete component ──────────────────────────────────────────────

type CitySuggestion = { label: string; city: string; placeId: string };

function CityAutocomplete({
  value,
  onChange,
  placeholder = "Houston, TX",
}: {
  value: string;
  onChange: (city: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(Boolean(value));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync external value changes (e.g. when "Pull from website" sets a city)
  useEffect(() => {
    if (value && value !== query) {
      setQuery(value);
      setConfirmed(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/google/places/city-autocomplete?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { results?: CitySuggestion[] };
      setSuggestions(data.results ?? []);
      setOpen((data.results?.length ?? 0) > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    setConfirmed(false);
    onChange(""); // clear confirmed value until they pick
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchSuggestions(q), 300);
  }

  function handleSelect(suggestion: CitySuggestion) {
    setQuery(suggestion.city);
    setConfirmed(true);
    setOpen(false);
    setSuggestions([]);
    onChange(suggestion.city);
  }

  const borderColor = confirmed ? "border-emerald-400 ring-1 ring-emerald-200" : query && !confirmed ? "border-amber-400" : "border-zinc-200";

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
          className={`w-full rounded-xl border px-3 py-2 text-sm bg-white focus:outline-none transition-colors pr-8 ${borderColor}`}
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs animate-pulse">…</span>
        )}
        {confirmed && !loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 text-sm">✓</span>
        )}
        {query && !confirmed && !loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500 text-xs">?</span>
        )}
      </div>

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onMouseDown={() => handleSelect(s)}
                className="w-full px-3 py-2.5 text-left text-sm hover:bg-zinc-50 flex items-center gap-2"
              >
                <span className="text-zinc-400 text-xs shrink-0">📍</span>
                <span>
                  <span className="font-medium text-zinc-900">{s.city}</span>
                  {s.label !== s.city && (
                    <span className="ml-1 text-zinc-400 text-xs">{s.label.replace(s.city, "").replace(/^,\s*/, "")}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Warning if user typed something but didn't pick */}
      {query && !confirmed && !open && query.length > 2 && (
        <p className="mt-1 text-xs text-amber-600">
          Select a city from the dropdown — free-text entries won&apos;t be matched to real location data.
        </p>
      )}
    </div>
  );
}

const TONE_OPTIONS = ["professional", "friendly", "authoritative", "casual"];
const FOCUS_OPTIONS = [
  {
    value: "local",
    label: "Local — one city or neighborhood",
    hint: "Articles say "in [your city]". Best for service businesses serving a single market.",
  },
  {
    value: "regional",
    label: "Regional — multi-city or statewide",
    hint: "Articles reference your state or metro area. Good for businesses serving a wide radius.",
  },
  {
    value: "national",
    label: "National — no city references",
    hint: "Articles never mention a specific city. Use this for e-commerce or nationwide services.",
  },
  {
    value: "online",
    label: "Online only — no physical location",
    hint: "Skips location pages and GBP posts. Use this for fully digital businesses.",
  },
];

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
  instagramHandle: "",
  facebookUrl: "",
};

/** Parse "Austin, TX (within 25 miles)" → { city: "Austin, TX", radius: 25 } */
function parseServiceArea(raw: string): { city: string; radius: number } {
  const m = raw.match(/^(.+?)\s*\(within\s+(\d+)\s+miles?\)/i);
  if (m) return { city: m[1].trim(), radius: parseInt(m[2], 10) };
  return { city: raw.trim(), radius: 25 };
}

/** Encode city + radius back into the stored format */
function encodeServiceArea(city: string, radius: number): string {
  if (!city.trim()) return "";
  return `${city.trim()} (within ${radius} miles)`;
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  twitter: "Twitter / X",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
};

type SourceInfo = {
  websiteScraped: boolean;
  socialFound: string[];
  websiteUrl: string | null;
};

type Props = {
  businessId: string;
  businessName: string;
  initialConfig: BusinessProfileData | null;
  discoveredSocials: DiscoveredSocial[];
};

export function BusinessProfileSection({ businessId, businessName, initialConfig, discoveredSocials }: Props) {
  const parsed = parseServiceArea(initialConfig?.targetCities ?? "");
  const [form, setForm] = useState<BusinessProfileData>(initialConfig ?? EMPTY);
  const [serviceCity, setServiceCity] = useState(
    initialConfig?.targetScope || parsed.city || ""
  );
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [sources, setSources] = useState<SourceInfo | null>(null);
  const [isPending, startTransition] = useTransition();

  function field(key: keyof BusinessProfileData) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm((prev) => ({ ...prev, [key]: e.target.value })),
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
        // Parse service area from the generated targetCities
        const sa = parseServiceArea(p.targetCities);
        setServiceCity(p.targetScope || sa.city);
        setSources(result.sources ?? null);
        setStatus({ ok: true, message: "Profile generated from your website and business data. Review each field and save." });
      } else {
        setStatus({ ok: false, message: result.error ?? "Generation failed." });
      }
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const toSave: BusinessProfileData = {
      ...form,
      targetScope: serviceCity,
      targetCities: serviceCity, // keep targetCities in sync for legacy reads
    };
    startTransition(async () => {
      const result = await saveBusinessProfile(businessId, toSave);
      if (result.ok) {
        setForm(toSave);
        setStatus({ ok: true, message: "Profile saved. All AI content will now use these details." });
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
            Every article, post, and campaign we generate is grounded in this profile.{" "}
            <strong className="text-zinc-800">Click "Pull from website" first.</strong> We'll scrape your site and pre-fill everything automatically. Then review, correct anything wrong, and save.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isPending}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {isPending ? "Pulling from website…" : initialConfig ? "Re-pull from website" : "Pull from website ✦"}
        </button>
      </div>

      {/* No profile warning */}
      {!status && !initialConfig && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>Profile not set up yet.</strong> Click <strong>"Pull from website"</strong> and we'll read your website, Google listing, and any social profiles we found, then pre-fill everything below. Content will be generic until this is saved.
        </div>
      )}

      {/* Status message */}
      {status && (
        <div className={`mt-4 rounded-lg px-3 py-2 text-sm font-medium ${status.ok ? "bg-green-50 text-green-800 border border-green-100" : "bg-red-50 text-red-800 border border-red-100"}`}>
          {status.message}
        </div>
      )}

      {/* Source indicators — shown after generate */}
      {sources && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${sources.websiteScraped ? "bg-green-50 text-green-800 border border-green-200" : "bg-zinc-100 text-zinc-500"}`}>
            {sources.websiteScraped ? "✓" : "✗"} Website scraped
            {sources.websiteUrl ? ` (${sources.websiteUrl.replace(/^https?:\/\//, "").split("/")[0]})` : ""}
          </span>
          {sources.socialFound.map((platform) => (
            <span key={platform} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 border border-blue-200">
              ✓ {PLATFORM_LABELS[platform] ?? platform} found on site
            </span>
          ))}
          {sources.socialFound.length === 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-500">
              No social links found on website. Add them manually below.
            </span>
          )}
        </div>
      )}

      {/* Discovered socials banner — always shown if found at scan time */}
      {hasSocials && !sources && (
        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
          <p className="text-xs font-semibold text-blue-800 mb-1">Found on your website at scan time:</p>
          <div className="flex flex-wrap gap-2">
            {discoveredSocials.map((s) => (
              <a
                key={s.platform}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-white border border-blue-200 px-2.5 py-0.5 text-xs text-blue-700 hover:bg-blue-100"
              >
                {PLATFORM_LABELS[s.platform] ?? s.platform}
                {s.handle ? ` @${s.handle}` : ""}
                <span className="text-blue-400">↗</span>
              </a>
            ))}
          </div>
          <p className="mt-1 text-xs text-blue-600">These will be pre-filled when you click "Pull from website".</p>
        </div>
      )}

      <form onSubmit={handleSave} className="mt-5 space-y-5">
        <div className="grid gap-5 md:grid-cols-2">

          {/* Service description */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              What does {businessName} do?
              <span className="ml-2 font-normal normal-case text-zinc-400">Pulled from your website</span>
            </label>
            <textarea
              {...field("serviceDescription")}
              rows={3}
              placeholder="We'll pull this from your website. Describe your services, who you serve, and what makes you reliable."
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>

          {/* Unique selling points */}
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

          {/* Location + content scope — merged single section */}
          <div className="md:col-span-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-0.5">
                Where do you operate?
              </p>
              <p className="text-xs text-zinc-400 mb-3">
                These two settings control all location references in your content.
              </p>

              {/* City autocomplete — hidden when national/online */}
              {form.focusArea !== "national" && form.focusArea !== "online" && (
                <div className="mb-3">
                  <label className="block text-xs text-zinc-600 font-medium mb-1">
                    Your primary city
                  </label>
                  <CityAutocomplete
                    value={serviceCity}
                    onChange={setServiceCity}
                    placeholder="Start typing a city…"
                  />
                  <p className="mt-1 text-xs text-zinc-400">
                    This city name appears in every article, GBP post, and page we generate.
                  </p>
                </div>
              )}

              {/* Scope dropdown */}
              <div>
                <label className="block text-xs text-zinc-600 font-medium mb-1">
                  Content scope — who are you writing for?
                </label>
                <select
                  {...field("focusArea")}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                >
                  {FOCUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {/* Contextual hint for selected option */}
                {(() => {
                  const opt = FOCUS_OPTIONS.find((o) => o.value === form.focusArea);
                  return opt ? (
                    <p className="mt-1.5 text-xs text-zinc-500">{opt.hint}</p>
                  ) : null;
                })()}
              </div>

              {/* Preview of what will be generated */}
              {(form.focusArea === "local" || form.focusArea === "regional") && serviceCity && (
                <p className="mt-2 text-xs font-medium text-emerald-700">
                  ✓ Content will reference &ldquo;{serviceCity}&rdquo; throughout
                </p>
              )}
              {form.focusArea === "national" && (
                <p className="mt-2 text-xs font-medium text-blue-700">
                  ✓ Content will be written for a nationwide audience — no city name will be used
                </p>
              )}
              {form.focusArea === "online" && (
                <p className="mt-2 text-xs font-medium text-blue-700">
                  ✓ GBP posts and local city pages will be skipped — content targets your online audience
                </p>
              )}
            </div>
          </div>

          {/* Target keywords */}
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

          {/* Tone */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Content tone
            </label>
            <select
              {...field("tone")}
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none bg-white"
            >
              {TONE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Brand voice */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Brand voice <span className="font-normal text-zinc-400">(injected into every article, pulled from your site&apos;s writing style)</span>
            </label>
            <textarea
              {...field("brandVoice")}
              rows={2}
              placeholder="e.g. 'Conversational and warm, like a trusted neighbor. Simple language, no jargon, always ends with a clear local call-to-action.'"
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>

          {/* Social — Instagram */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Instagram handle
              {discoveredSocials.find(s => s.platform === "instagram") && (
                <span className="ml-2 font-normal normal-case text-blue-600">found on your website ✓</span>
              )}
            </label>
            <input
              type="text"
              {...field("instagramHandle")}
              placeholder="@yourbusiness"
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>

          {/* Social — Facebook */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Facebook page URL
              {discoveredSocials.find(s => s.platform === "facebook") && (
                <span className="ml-2 font-normal normal-case text-blue-600">found on your website ✓</span>
              )}
            </label>
            <input
              type="url"
              {...field("facebookUrl")}
              placeholder="https://facebook.com/yourbusiness"
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>

          {/* Competitors */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Competitors <span className="font-normal text-zinc-400">(names, comma-separated)</span>
            </label>
            <input
              type="text"
              {...field("competitorNames")}
              placeholder="ABC Plumbing, XYZ Services..."
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>

          {/* Additional context */}
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

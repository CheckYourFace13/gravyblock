"use client";

import { useState, useTransition } from "react";
import { saveBusinessProfile, generateBusinessProfile, type BusinessProfileData } from "./business-profile-actions";

const TONE_OPTIONS = ["professional", "friendly", "authoritative", "casual"];
const FOCUS_OPTIONS = [
  { value: "local", label: "Local (one city / neighborhood)" },
  { value: "regional", label: "Regional (multi-city / state)" },
  { value: "national", label: "National" },
  { value: "online", label: "Online only" },
];

const EMPTY: BusinessProfileData = {
  serviceDescription: "",
  uniqueSellingPoints: "",
  tone: "professional",
  targetKeywords: "",
  targetCities: "",
  competitorNames: "",
  additionalContext: "",
  focusArea: "local",
  targetScope: "",
  instagramHandle: "",
  facebookUrl: "",
};

type Props = {
  businessId: string;
  businessName: string;
  initialConfig: BusinessProfileData | null;
};

export function BusinessProfileSection({ businessId, businessName, initialConfig }: Props) {
  const [form, setForm] = useState<BusinessProfileData>(initialConfig ?? EMPTY);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
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
    startTransition(async () => {
      const result = await generateBusinessProfile(businessId);
      if (result.ok && result.profile) {
        setForm(result.profile);
        setStatus({ ok: true, message: "Profile generated from your business data — review and save." });
      } else {
        setStatus({ ok: false, message: result.error ?? "Generation failed." });
      }
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const result = await saveBusinessProfile(businessId, form);
      if (result.ok) {
        setStatus({ ok: true, message: "Profile saved. All AI content will now use these details." });
      } else {
        setStatus({ ok: false, message: result.error ?? "Save failed." });
      }
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Business profile</h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-600">
            Every article, post, and campaign we generate is grounded in this profile. Review it, correct anything wrong, and save — then all AI output will be accurate to your actual business.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isPending}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {isPending ? "Generating…" : initialConfig ? "Regenerate from AI" : "Generate from my data"}
        </button>
      </div>

      {status ? (
        <div className={`mt-4 rounded-lg px-3 py-2 text-sm font-medium ${status.ok ? "bg-green-50 text-green-800 border border-green-100" : "bg-red-50 text-red-800 border border-red-100"}`}>
          {status.message}
        </div>
      ) : !initialConfig ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>No profile yet.</strong> Click "Generate from my data" to build one from your scan results, or fill it in manually below. Content will be generic until this is saved.
        </div>
      ) : null}

      <form onSubmit={handleSave} className="mt-5 space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          {/* Service description */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              What does {businessName} do? (service description)
            </label>
            <textarea
              {...field("serviceDescription")}
              rows={3}
              placeholder="Describe your services, who you serve, and what makes you reliable. This is the foundation of every piece of content."
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>

          {/* Unique selling points */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              What sets you apart? (unique selling points)
            </label>
            <textarea
              {...field("uniqueSellingPoints")}
              rows={3}
              placeholder="e.g. 20 years experience, same-day service, family owned, only certified provider in the area..."
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
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

          {/* Target cities */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Cities / areas you serve <span className="font-normal text-zinc-400">(comma-separated)</span>
            </label>
            <input
              type="text"
              {...field("targetCities")}
              placeholder="Austin, Round Rock, Cedar Park..."
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>

          {/* Focus area */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Geographic focus
            </label>
            <select
              {...field("focusArea")}
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none bg-white"
            >
              {FOCUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Target scope */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Primary market <span className="font-normal text-zinc-400">(city, state, or region)</span>
            </label>
            <input
              type="text"
              {...field("targetScope")}
              placeholder="Austin, TX"
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

          {/* Instagram */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Instagram handle <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <input
              type="text"
              {...field("instagramHandle")}
              placeholder="@yourbusiness"
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>

          {/* Facebook */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Facebook page URL <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <input
              type="url"
              {...field("facebookUrl")}
              placeholder="https://facebook.com/yourbusiness"
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

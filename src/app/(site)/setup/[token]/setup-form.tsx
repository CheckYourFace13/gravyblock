"use client";

import { useActionState } from "react";
import { submitSetupAction, type SetupActionState } from "./actions";

const initialState: SetupActionState = { status: "idle" };

export function SetupForm({ token, businessName }: { token: string; businessName: string }) {
  const [state, formAction, pending] = useActionState(submitSetupAction, initialState);

  if (state.status === "success") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <p className="text-2xl font-semibold text-zinc-900">You&apos;re all set</p>
        <p className="mt-3 text-zinc-600">
          GravyBlock is now calibrated for <strong>{state.businessName}</strong>. The autopilot will use
          everything you shared to write content, run outreach, and monitor your visibility. You&apos;ll
          see results in your next weekly summary email.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="businessName" value={businessName} />

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-sm font-semibold text-zinc-900">What do you want to rank for?</span>
          <p className="text-xs text-zinc-500">Keywords, services, or phrases customers search for</p>
          <textarea
            name="targetKeywords"
            rows={2}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-4"
            placeholder="e.g. emergency plumber Austin, water heater repair, drain cleaning"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-semibold text-zinc-900">Cities and areas you serve</span>
          <textarea
            name="targetCities"
            rows={2}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-4"
            placeholder="e.g. Austin, Round Rock, Cedar Park, Georgetown"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-semibold text-zinc-900">Main competitors</span>
          <textarea
            name="competitorNames"
            rows={2}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-4"
            placeholder="e.g. ABC Plumbing, City Drain Co"
          />
        </label>

        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-sm font-semibold text-zinc-900">Describe what you do</span>
          <p className="text-xs text-zinc-500">Services, who you help, what makes you different</p>
          <textarea
            name="serviceDescription"
            rows={3}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-4"
            placeholder="e.g. We're a family-owned plumbing company serving Austin since 2008. We specialize in residential emergencies and always offer same-day service."
          />
        </label>

        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-sm font-semibold text-zinc-900">What sets you apart?</span>
          <textarea
            name="uniqueSellingPoints"
            rows={2}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-4"
            placeholder="e.g. 24/7 availability, upfront pricing, licensed master plumber on every job, 500+ 5-star reviews"
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-semibold text-zinc-900">Writing tone</span>
          <select
            name="tone"
            defaultValue="professional"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none ring-red-500/30 focus:ring-4"
          >
            <option value="professional">Professional</option>
            <option value="friendly">Friendly and approachable</option>
            <option value="casual">Casual</option>
            <option value="authoritative">Authoritative / expert</option>
            <option value="conversational">Conversational</option>
          </select>
        </label>

        <div className="space-y-1.5">
          <span className="text-sm font-semibold text-zinc-900">Social handles (optional)</span>
          <input
            name="instagramHandle"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-4"
            placeholder="Instagram handle (e.g. @austinplumber)"
          />
          <input
            name="tiktokHandle"
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-4"
            placeholder="TikTok handle"
          />
          <input
            name="facebookUrl"
            className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-4"
            placeholder="Facebook page URL"
          />
        </div>

        <label className="space-y-1.5 sm:col-span-2">
          <span className="text-sm font-semibold text-zinc-900">Anything else we should know?</span>
          <textarea
            name="additionalContext"
            rows={3}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-4"
            placeholder="Seasonal patterns, local events you sponsor, awards, certifications, recent expansions, anything the AI should keep in mind..."
          />
        </label>
      </div>

      {state.status === "error" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.message}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
      >
        {pending ? "Saving..." : "Save and activate autopilot"}
      </button>
      <p className="text-xs text-zinc-500">
        You can reply to your setup email anytime to update this. Nothing is permanent.
      </p>
    </form>
  );
}

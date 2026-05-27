"use client";

import { useActionState, useOptimistic } from "react";
import { saveOutreachSettings, type OutreachSettings } from "./actions";

const initial: { ok: boolean; error?: string } = { ok: false };

export function OutreachSettingsForm({ current }: { current: OutreachSettings }) {
  const [state, formAction, pending] = useActionState(saveOutreachSettings, initial);

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Emails per batch */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
            Emails per batch
          </label>
          <input
            type="number"
            name="emailsPerBatch"
            defaultValue={current.emailsPerBatch}
            min={1}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          />
          <p className="mt-1 text-xs text-zinc-400">4 windows/day on weekdays → 4× this number per day</p>
        </div>

        {/* Paused toggle */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
            Outreach status
          </label>
          <select
            name="paused"
            defaultValue={current.paused ? "true" : "false"}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          >
            <option value="false">▶ Running</option>
            <option value="true">⏸ Paused</option>
          </select>
          <p className="mt-1 text-xs text-zinc-400">Pause stops all cold outreach immediately</p>
        </div>

        {/* Weekday toggle */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
            Weekday batches
          </label>
          <select
            name="weekdayEnabled"
            defaultValue={current.weekdayEnabled ? "true" : "false"}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          >
            <option value="true">✓ Enabled</option>
            <option value="false">Disabled</option>
          </select>
          <p className="mt-1 text-xs text-zinc-400">Mon–Fri · 9am, 12pm, 3pm UTC</p>
        </div>

        {/* Weekend restaurants toggle */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
            Weekend (restaurants)
          </label>
          <select
            name="weekendRestaurantsEnabled"
            defaultValue={current.weekendRestaurantsEnabled ? "true" : "false"}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          >
            <option value="true">✓ Enabled</option>
            <option value="false">Disabled</option>
          </select>
          <p className="mt-1 text-xs text-zinc-400">Sat/Sun · 9am & 1pm UTC · restaurants only</p>
        </div>
      </div>

      <div className="flex items-center gap-4 border-t border-zinc-100 pt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
        {state.ok && (
          <span className="text-sm font-medium text-emerald-700">✓ Saved — takes effect within 15 min</span>
        )}
        {state.error && (
          <span className="text-sm text-red-700">{state.error}</span>
        )}
      </div>
    </form>
  );
}

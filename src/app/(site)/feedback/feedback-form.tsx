"use client";

import { useActionState, useState } from "react";
import { submitTestimonial, type FeedbackResult } from "./actions";

const initial: FeedbackResult | null = null;

export function FeedbackForm({ businessId }: { businessId?: string }) {
  const [state, action, pending] = useActionState(submitTestimonial, initial);
  const [rating, setRating] = useState(5);

  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <p className="text-2xl">🙏</p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-900">Thank you!</h2>
        <p className="mt-1 text-sm text-zinc-600">
          We really appreciate you taking the time. Your words mean a lot to a small team.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {businessId && <input type="hidden" name="businessId" value={businessId} />}
      <input type="hidden" name="rating" value={rating} />

      {/* Star rating */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
          Your rating
        </label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={`text-3xl leading-none transition ${n <= rating ? "text-yellow-400" : "text-zinc-200"} hover:scale-110`}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
            Your name <span className="text-red-500">*</span>
          </label>
          <input
            type="text" name="authorName" required placeholder="Jane Smith"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none focus:border-red-400 focus:ring-4 focus:ring-red-500/10"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
            Business name
          </label>
          <input
            type="text" name="businessName" placeholder="Smith Plumbing"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none focus:border-red-400 focus:ring-4 focus:ring-red-500/10"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
            Your role
          </label>
          <input
            type="text" name="role" placeholder="Owner"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none focus:border-red-400 focus:ring-4 focus:ring-red-500/10"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
            City
          </label>
          <input
            type="text" name="city" placeholder="Austin, TX"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none focus:border-red-400 focus:ring-4 focus:ring-red-500/10"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
          Your experience with GravyBlock <span className="text-red-500">*</span>
        </label>
        <textarea
          name="quote" required rows={4}
          placeholder="What's GravyBlock done for your business? Be as specific as you like — rankings, reviews, time saved, anything."
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none focus:border-red-400 focus:ring-4 focus:ring-red-500/10"
        />
      </div>

      {state && !state.ok && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</div>
      )}

      <button
        type="submit" disabled={pending}
        className="w-full rounded-full bg-red-600 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-500 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Share my experience"}
      </button>
      <p className="text-center text-xs text-zinc-400">
        We may feature your words on our site. Thanks for supporting a small team.
      </p>
    </form>
  );
}

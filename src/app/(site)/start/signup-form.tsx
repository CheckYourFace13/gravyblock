"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { directSignupAction, type DirectSignupResult } from "./actions";

type Props = {
  plan: string;
  promoCode: string | null;
  isAnnual: boolean;
  priceLabel: string;
  /** Set when the visitor comes from their own report: only the email is still needed. */
  prefill?: { reportPublicId: string; businessName: string; website: string; city: string } | null;
};

const initialState: DirectSignupResult | null = null;

export function SignupForm({ plan, promoCode, isAnnual, priceLabel, prefill }: Props) {
  const [state, formAction, pending] = useActionState(directSignupAction, initialState);
  const redirected = useRef(false);
  const [code, setCode] = useState(promoCode ?? "");
  const [editingCode, setEditingCode] = useState(false);

  useEffect(() => {
    if (state?.ok && state.checkoutUrl && !redirected.current) {
      redirected.current = true;
      window.location.href = state.checkoutUrl;
    }
  }, [state]);

  const isRedirecting = state?.ok && !redirected.current;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="interval" value={isAnnual ? "annual" : "monthly"} />
      {prefill ? (
        <>
          <input type="hidden" name="reportPublicId" value={prefill.reportPublicId} />
          <input type="hidden" name="businessName" value={prefill.businessName} />
          <input type="hidden" name="website" value={prefill.website} />
          <input type="hidden" name="city" value={prefill.city} />
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            Setting up GravyBlock for <span className="font-semibold text-zinc-900">{prefill.businessName}</span>
            {prefill.website ? <span className="text-zinc-500"> · {prefill.website.replace(/^https?:\/\//, "")}</span> : null}
          </div>
        </>
      ) : null}

      {/* Promo code — editable and removable, not forced */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
          Promo code
        </label>
        {editingCode || !code ? (
          <input
            type="text"
            name="promoCode"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. INTRO50"
            autoComplete="off"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-500/10 transition"
          />
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <input type="hidden" name="promoCode" value={code} />
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-emerald-800">{code}</span>
              <span className="text-xs text-emerald-600">applied</span>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setEditingCode(true)}
                className="text-zinc-500 hover:text-zinc-800"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setCode("");
                  setEditingCode(true);
                }}
                className="text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        )}
        <p className="mt-1 text-xs text-zinc-400">
          Leave blank to enter a code at checkout instead, or pay full price.
        </p>
      </div>

      {/* Business name */}
      <div className={prefill ? "hidden" : undefined}>
        <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
          Business name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name={prefill ? undefined : "businessName"}
          required={!prefill}
          placeholder="e.g. Houston Plumbing Pros"
          autoComplete="organization"
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-500/10 transition"
        />
      </div>

      {/* Email */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
          Your email <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          name="email"
          required
          placeholder="you@yourbusiness.com"
          autoComplete="email"
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-500/10 transition"
        />
        <p className="mt-1 text-xs text-zinc-400">We&apos;ll send your workspace access link here.</p>
      </div>

      {/* Website + City in a row */}
      <div className={prefill ? "hidden" : "grid grid-cols-2 gap-3"}>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
            Website
          </label>
          <input
            type="text"
            name={prefill ? undefined : "website"}
            placeholder="yourbusiness.com"
            autoComplete="url"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-500/10 transition"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
            City
          </label>
          <input
            type="text"
            name={prefill ? undefined : "city"}
            placeholder="Houston, TX"
            autoComplete="address-level2"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-500/10 transition"
          />
        </div>
      </div>

      {/* Error */}
      {state && !state.ok && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={pending || Boolean(isRedirecting)}
        className="w-full rounded-full bg-red-600 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending || isRedirecting
          ? <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Taking you to checkout…
            </span>
          : `Continue to secure checkout — ${priceLabel}`
        }
      </button>

      <p className="text-center text-xs text-zinc-400">
        Secured by Stripe · No charge until you complete checkout
      </p>
      <p className="text-center text-xs font-medium text-zinc-600">
        Cancel anytime · 30-day money-back guarantee{promoCode === "GROWTH50" ? " · $74.99/month locked while subscribed" : ""}
      </p>
    </form>
  );
}

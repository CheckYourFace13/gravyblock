"use client";

import { useActionState, useEffect, useRef } from "react";
import { directSignupAction, type DirectSignupResult } from "./actions";

type Props = {
  priceLabel: string;
  /** Set when the visitor comes from their own report: only the email is still needed. */
  prefill?: { reportPublicId: string; businessName: string; website: string; city: string } | null;
};

const initialState: DirectSignupResult | null = null;
const inputCls =
  "w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-red-400 focus:ring-4 focus:ring-red-500/10 transition";
const labelCls = "block text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5";

export function SignupForm({ priceLabel, prefill }: Props) {
  const [state, formAction, pending] = useActionState(directSignupAction, initialState);
  const redirected = useRef(false);

  useEffect(() => {
    if (state?.ok && state.checkoutUrl && !redirected.current) {
      redirected.current = true;
      window.location.href = state.checkoutUrl;
    }
  }, [state]);

  const isRedirecting = state?.ok && !redirected.current;

  return (
    <form action={formAction} className="space-y-4">
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
      ) : (
        <>
          <div>
            <label className={labelCls}>
              Business name <span className="text-red-500">*</span>
            </label>
            <input type="text" name="businessName" required placeholder="e.g. Houston Plumbing Pros" autoComplete="organization" className={inputCls} />
          </div>
        </>
      )}

      <div>
        <label className={labelCls}>
          Your email <span className="text-red-500">*</span>
        </label>
        <input type="email" name="email" required placeholder="you@yourbusiness.com" autoComplete="email" className={inputCls} />
        <p className="mt-1 text-xs text-zinc-500">We&apos;ll send your workspace access link here.</p>
      </div>

      {prefill ? null : (
        <div>
          <label className={labelCls}>Website</label>
          <input type="text" name="website" placeholder="yourbusiness.com" autoComplete="url" className={inputCls} />
        </div>
      )}

      {state && !state.ok && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</div>
      )}

      <button
        type="submit"
        disabled={pending || Boolean(isRedirecting)}
        className="w-full rounded-full bg-red-600 px-6 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending || isRedirecting ? "Taking you to secure checkout…" : `Continue to secure checkout — ${priceLabel}`}
      </button>

      <p className="text-center text-xs text-zinc-500">Secured by Stripe · No charge until you complete checkout</p>
      <p className="text-center text-xs font-medium text-zinc-600">Cancel anytime · 30-day money-back guarantee</p>
    </form>
  );
}

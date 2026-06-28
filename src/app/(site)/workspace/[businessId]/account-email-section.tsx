"use client";

import { useActionState } from "react";
import { updateAccountEmail, type AccountEmailResult } from "./account-actions";

const initial: AccountEmailResult | null = null;

export function AccountEmailSection({
  businessId,
  currentEmail,
  verified,
}: {
  businessId: string;
  currentEmail: string | null;
  verified: boolean;
}) {
  const [state, action, pending] = useActionState(updateAccountEmail, initial);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Account email</h2>
          <p className="mt-0.5 text-sm text-zinc-500">Where we send login links and account notices. Separate from billing.</p>
        </div>
        {currentEmail ? (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {verified ? "✓ Verified" : "Unverified"}
          </span>
        ) : null}
      </div>

      <form action={action} className="mt-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="businessId" value={businessId} />
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-medium text-zinc-500 mb-1">Email address</label>
          <input
            type="email"
            name="accountEmail"
            defaultValue={currentEmail ?? ""}
            placeholder="you@yourbusiness.com"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Update & verify"}
        </button>
      </form>

      {state && (
        <p className={`mt-2 text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>
      )}
    </section>
  );
}

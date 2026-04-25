"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { requestCustomerMagicLinkAction, type CustomerLoginState } from "@/app/actions/customer-login";

const initialState: CustomerLoginState = { status: "idle" };

export function CustomerLoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, pending] = useActionState(requestCustomerMagicLinkAction, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      router.push(state.nextPath);
    }
  }, [router, state]);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <input type="hidden" name="redirectTo" value={nextPath} />
      <label className="block space-y-2 text-sm">
        <span className="font-medium text-zinc-800">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none ring-red-500/25 focus:border-red-400 focus:ring-4"
        />
      </label>
      {state.status === "error" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{state.message}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? "Sending link..." : "Email me a secure sign-in link"}
      </button>
    </form>
  );
}


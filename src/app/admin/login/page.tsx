"use client";

import { useActionState } from "react";
import { adminLoginAction, type AdminLoginState } from "@/app/actions/admin-login";
import { BrandMark } from "@/components/brand-mark";

const initial: AdminLoginState = { status: "idle" };

export default function AdminLoginPage() {
  const [state, formAction, pending] = useActionState(adminLoginAction, initial);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl">
        <BrandMark compact />
        <h1 className="mt-3 text-2xl font-semibold text-zinc-900">Admin sign-in</h1>
        <p className="mt-2 text-sm text-zinc-600">Use the password configured in ADMIN_PASSWORD.</p>
        <form action={formAction} className="mt-6 space-y-4">
          <label className="block space-y-2 text-sm">
            <span className="text-zinc-700">Password</span>
            <input
              type="password"
              name="password"
              required
              className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-red-300/40 focus:ring-4"
            />
          </label>
          {state.status === "error" ? (
            <p className="rounded-xl border border-red-500/40 bg-red-50 px-3 py-2 text-sm text-red-800">
              {state.message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex w-full items-center justify-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

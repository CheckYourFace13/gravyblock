"use client";

import Link from "next/link";
import { useActionState } from "react";
import { adminLoginAction, type AdminLoginState } from "@/app/actions/admin-login";
import { BrandMark } from "@/components/brand-mark";

const initial: AdminLoginState = { status: "idle" };

export default function AdminLoginPage() {
  const [state, formAction, pending] = useActionState(adminLoginAction, initial);

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-zinc-100 to-white px-4 py-10">
      <div className="mx-auto mb-6 w-full max-w-md">
        <Link href="/" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
          ← Back to marketing site
        </Link>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl shadow-zinc-200/80">
          <BrandMark compact href="/" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-900">Operator sign-in</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            Enter the password from <span className="font-mono text-xs text-zinc-800">ADMIN_PASSWORD</span> in your
            server environment. After sign-in you land on the dashboard with full navigation.
          </p>
          <form action={formAction} className="mt-8 space-y-4">
            <label className="block space-y-2 text-sm">
              <span className="font-medium text-zinc-800">Password</span>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
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
              {pending ? "Signing in…" : "Sign in to dashboard"}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-zinc-500">
          <Link href="/admin" className="underline-offset-2 hover:text-zinc-700 hover:underline">
            Dashboard
          </Link>{" "}
          requires a valid session.
        </p>
      </div>
    </div>
  );
}

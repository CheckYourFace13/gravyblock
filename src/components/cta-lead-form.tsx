"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitLeadAction, type LeadActionState } from "@/app/actions/lead";

const initial: LeadActionState = { status: "idle" };

export function CtaLeadForm({
  source,
  title,
  subtitle,
  buttonLabel,
  className,
}: {
  source: "contact_form" | "support_inquiry";
  title: string;
  subtitle: string;
  buttonLabel: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(submitLeadAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status]);

  return (
    <div className={className ?? "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700">{title}</p>
      <p className="mt-2 text-sm text-zinc-600">{subtitle}</p>
      {state.status === "success" ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Thanks — we received your message.
        </p>
      ) : null}
      <form ref={formRef} action={formAction} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="source" value={source} />
        <label className="space-y-1 sm:col-span-1">
          <span className="text-xs font-medium text-zinc-700">Name</span>
          <input
            name="name"
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-4"
          />
        </label>
        <label className="space-y-1 sm:col-span-1">
          <span className="text-xs font-medium text-zinc-700">Email</span>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-4"
          />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-zinc-700">Message (optional)</span>
          <textarea
            name="message"
            rows={3}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-4"
          />
        </label>
        {state.status === "error" && state.formError ? (
          <p className="sm:col-span-2 text-sm text-red-700">{state.formError}</p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="sm:col-span-2 inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
        >
          {pending ? "Sending..." : buttonLabel}
        </button>
      </form>
    </div>
  );
}

"use client";
import type { PromoCode } from "@/lib/stripe/promo-codes";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { unlockReportAction, type ReportUnlockActionState } from "@/app/actions/report-unlock";

const initialState: ReportUnlockActionState = { status: "idle" };

export function ReportUnlockCard({
  publicId,
  onUnlocked,
  selectedPlan,
  businessId,
  promoCode,
}: {
  publicId: string;
  onUnlocked: () => void;
  selectedPlan?: "starter" | "growth" | "pro" | "agency" | null;
  businessId?: string;
  promoCode?: PromoCode | null;
}) {
  const [state, formAction, pending] = useActionState(unlockReportAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      onUnlocked();
      const unlockPath = state.unlockUrl.replace(/^https?:\/\/[^/]+/i, "");
      const url = new URL(unlockPath, window.location.origin);
      if (selectedPlan && !url.searchParams.get("plan")) {
        url.searchParams.set("plan", selectedPlan);
      }
      if (promoCode && !url.searchParams.get("promo")) {
        url.searchParams.set("promo", promoCode);
      }
      router.replace(`${url.pathname}${url.search}${url.hash}`);
    }
  }, [onUnlocked, promoCode, router, selectedPlan, state]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-zinc-900">Want the complete report?</h2>
      <p className="mt-1 text-sm text-zinc-600">Enter your email to see every finding. We&apos;ll also email you a copy. No account or password.</p>
      <form ref={formRef} action={formAction} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input type="hidden" name="publicId" value={publicId} />
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@yourbusiness.com"
          className="min-w-0 flex-1 rounded-full border border-zinc-300 px-5 py-3 text-sm outline-none ring-red-500/30 focus:ring-4"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {pending ? "Unlocking..." : "Show my full report"}
        </button>
      </form>
      <FieldError messages={state.status === "error" ? state.fieldErrors?.email : undefined} />
      {state.status === "error" && state.formError ? <p className="mt-2 text-sm text-red-700">{state.formError}</p> : null}
    </div>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-xs text-red-700">{messages.join(" ")}</p>;
}


"use client";

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
}: {
  publicId: string;
  onUnlocked: () => void;
  selectedPlan?: "base" | "pro" | null;
  businessId?: string;
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
      router.replace(`${url.pathname}${url.search}${url.hash}`);
    }
  }, [onUnlocked, router, selectedPlan, state]);

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-700">Unlock full report</p>
      <h2 className="mt-2 text-xl font-semibold text-zinc-900">Enter name + email to unlock every section</h2>
      <p className="mt-2 text-sm text-zinc-600">
        We will email the full report and unlock it in your current session.
      </p>
      <form ref={formRef} action={formAction} className="mt-4 grid gap-3">
        <input type="hidden" name="publicId" value={publicId} />
        <label className="space-y-1">
          <span className="text-xs font-medium text-zinc-700">Name</span>
          <input
            name="name"
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-4"
          />
          <FieldError messages={state.status === "error" ? state.fieldErrors?.name : undefined} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-zinc-700">Email</span>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none ring-red-500/30 focus:ring-4"
          />
          <FieldError messages={state.status === "error" ? state.fieldErrors?.email : undefined} />
        </label>
        {state.status === "error" && state.formError ? <p className="text-sm text-red-700">{state.formError}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
        >
          {pending ? "Unlocking..." : "Email and unlock full report"}
        </button>
      </form>
      {businessId ? (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-700">
          <p className="font-semibold text-zinc-900">Want ongoing automation?</p>
          <p className="mt-1">After unlock, open your workspace and start Base or Pro checkout for this business.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href={`/workspace/${businessId}?plan=base#billing`}
              className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 font-semibold text-zinc-900 hover:border-zinc-400"
            >
              Upgrade to Base
            </Link>
            <Link
              href={`/workspace/${businessId}?plan=pro#billing`}
              className="rounded-full bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-500"
            >
              Upgrade to Pro
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-xs text-red-700">{messages.join(" ")}</p>;
}


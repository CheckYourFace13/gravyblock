"use client";

import { useActionState, useEffect, useRef } from "react";
import { unlockReportAction, type ReportUnlockActionState } from "@/app/actions/report-unlock";

const initialState: ReportUnlockActionState = { status: "idle" };

/**
 * Optional "send me a copy" form. The full report is already visible; this only emails the visitor a copy and
 * records the lead through the same action the old unlock form used, so reporting stays continuous.
 */
export function ReportSaveCard({ publicId }: { publicId: string }) {
  const [state, formAction, pending] = useActionState(unlockReportAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <div id="save" className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Send me a copy of this report</h2>
      <p className="mt-1 text-sm text-zinc-600">Optional. We&apos;ll email you a link so you can come back to it. No account or password.</p>
      {state.status === "success" ? (
        <p className="mt-4 text-sm font-medium text-emerald-700">Sent. Check your inbox for the link.</p>
      ) : (
        <form ref={formRef} action={formAction} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input type="hidden" name="publicId" value={publicId} />
          <input
            id="save-email"
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
            {pending ? "Sending..." : "Send this report"}
          </button>
        </form>
      )}
      {state.status === "error" && state.fieldErrors?.email?.length ? <p className="mt-2 text-xs text-red-700">{state.fieldErrors.email.join(" ")}</p> : null}
      {state.status === "error" && state.formError ? <p className="mt-2 text-sm text-red-700">{state.formError}</p> : null}
    </div>
  );
}

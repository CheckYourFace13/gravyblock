"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitLeadAction, type LeadActionState } from "@/app/actions/lead";

const initial: LeadActionState = { status: "idle" };

export function LeadCaptureCard({
  publicId,
  businessId,
  website,
  placeId,
}: {
  publicId: string;
  businessId?: string;
  website?: string;
  placeId?: string;
}) {
  const [state, formAction, pending] = useActionState(submitLeadAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status]);

  return (
    <div className="rounded-2xl border border-black bg-black p-6 text-white shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-300">Next step</p>
      <h2 className="mt-2 text-xl font-semibold">Get an execution plan for this business</h2>
      <p className="mt-2 text-sm text-zinc-200">
        Tell us who should own rollout. We will follow up with practical next steps for listings, site fixes, content,
        authority, and recurring visibility — tuned to how you operate (single location, multi-location, or
        service-area).
      </p>

      {state.status === "success" ? (
        <p className="mt-4 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100">
          Received. We will reach out shortly with practical next steps.
        </p>
      ) : null}

      <form ref={formRef} action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="reportPublicId" value={publicId} />
        <input type="hidden" name="source" value="report_form" />
        {businessId ? <input type="hidden" name="businessId" value={businessId} /> : null}
        {website ? <input type="hidden" name="website" value={website} /> : null}
        {placeId ? <input type="hidden" name="placeId" value={placeId} /> : null}
        <label className="block space-y-1 text-sm">
          <span className="text-zinc-200">Name</span>
          <input
            name="name"
            required
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-red-300/40 focus:ring-4"
          />
          <FieldError messages={state.status === "error" ? state.fieldErrors?.name : undefined} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-zinc-200">Email</span>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-red-300/40 focus:ring-4"
          />
          <FieldError messages={state.status === "error" ? state.fieldErrors?.email : undefined} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-zinc-200">Phone (optional)</span>
          <input
            name="phone"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-red-300/40 focus:ring-4"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-zinc-200">What should we know? (optional)</span>
          <textarea
            name="message"
            rows={3}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none ring-red-300/40 focus:ring-4"
            placeholder="Goals, timelines, or what feels broken today."
          />
        </label>
        {state.status === "error" && state.formError ? (
          <p className="text-sm text-rose-200">{state.formError}</p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? "Sending..." : "Activate autopilot consult"}
        </button>
      </form>
    </div>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-xs text-rose-200">{messages.join(" ")}</p>;
}

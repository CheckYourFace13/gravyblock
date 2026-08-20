"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updateLeadPipelineStatus } from "../outreach/actions";

type FollowUpLead = {
  id: string;
  name: string;
  email: string;
  businessId: string | null;
  source: string;
  sources: string[];
  reportPublicId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  daysWaiting: number;
};

export function FollowUpQueue({ leads }: { leads: FollowUpLead[] }) {
  if (!leads.length) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-sm font-semibold text-emerald-900">✓ No real leads waiting on follow-up right now.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
      <h2 className="text-base font-semibold text-red-900 mb-1">⚠ Real leads needing follow-up ({leads.length})</h2>
      <p className="text-sm text-red-800 mb-4">
        Real (non-internal) leads still marked &quot;new&quot; more than 24h after their last activity. Nobody sends
        anything automatically from here — mark a row contacted once you've personally followed up.
      </p>
      <div className="space-y-2">
        {leads.map((lead) => (
          <LeadRow key={lead.id} lead={lead} />
        ))}
      </div>
    </section>
  );
}

function LeadRow({ lead }: { lead: FollowUpLead }) {
  const [state, formAction, pending] = useActionState(updateLeadPipelineStatus, null);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-white p-3">
      <div>
        <p className="font-semibold text-zinc-900">
          {lead.name} <span className="font-normal text-zinc-500">· {lead.email}</span>
        </p>
        <p className="text-xs text-zinc-500">
          {lead.sources.join(", ")} · first seen {new Date(lead.firstSeenAt).toLocaleDateString()} · last activity{" "}
          {new Date(lead.lastSeenAt).toLocaleDateString()} ·{" "}
          <span className="font-semibold text-red-700">{lead.daysWaiting}d waiting</span>
          {lead.businessId ? (
            <>
              {" "}
              ·{" "}
              <Link href={`/admin/businesses/${lead.businessId}`} className="text-red-700 hover:underline">
                view business
              </Link>
            </>
          ) : null}
        </p>
      </div>
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="leadId" value={lead.id} />
        <input type="hidden" name="status" value="contacted" />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-200 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Mark contacted"}
        </button>
      </form>
      {state?.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </div>
  );
}

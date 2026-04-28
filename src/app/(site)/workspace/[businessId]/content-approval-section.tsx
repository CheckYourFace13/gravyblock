"use client";

import { useState, useTransition } from "react";
import { approveQueuedDraft, dismissQueuedDraft, type QueuedDraft } from "./content-approval-actions";

const KIND_LABELS: Record<string, string> = {
  article: "SEO Article",
  gbp_post: "GBP Post",
  reddit_post: "Reddit Post",
  location_page: "Location Page",
};

type Props = {
  businessId: string;
  initialDrafts: QueuedDraft[];
};

export function ContentApprovalSection({ businessId, initialDrafts }: Props) {
  const [drafts, setDrafts] = useState<QueuedDraft[]>(initialDrafts);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleApprove(id: string) {
    startTransition(async () => {
      await approveQueuedDraft(businessId, id);
      setDrafts((prev) => prev.map((d) => d.id === id ? { ...d, status: "approved" } : d));
    });
  }

  function handleDismiss(id: string) {
    startTransition(async () => {
      await dismissQueuedDraft(businessId, id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    });
  }

  const pending = drafts.filter((d) => d.status === "queued");
  const approved = drafts.filter((d) => d.status === "approved");

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Content approval queue</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Review AI-generated drafts before they publish. Approve to prioritize, or dismiss to skip.
          </p>
        </div>
        {pending.length > 0 ? (
          <span className="shrink-0 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
            {pending.length} pending
          </span>
        ) : null}
      </div>

      {pending.length === 0 && approved.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">
          No content drafts queued yet. GravyBlock generates new drafts automatically each week on paid plans.
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {[...pending, ...approved].map((draft) => {
          const isExpanded = expanded === draft.id;
          const isApproved = draft.status === "approved";

          return (
            <li
              key={draft.id}
              className={`rounded-xl border px-4 py-3 ${isApproved ? "border-green-200 bg-green-50/50" : "border-zinc-200 bg-zinc-50"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                      {KIND_LABELS[draft.kind] ?? draft.kind}
                    </span>
                    {isApproved ? (
                      <span className="rounded-full bg-green-200 px-2 py-0.5 text-xs font-semibold text-green-800">
                        Approved
                      </span>
                    ) : null}
                    {draft.targetKeyword ? (
                      <span className="text-xs text-zinc-400">keyword: {draft.targetKeyword}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 font-semibold text-zinc-900 text-sm">{draft.title}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {draft.outline ? (
                    <button
                      onClick={() => setExpanded(isExpanded ? null : draft.id)}
                      className="text-xs font-medium text-zinc-500 hover:text-zinc-800"
                    >
                      {isExpanded ? "Hide" : "Preview"}
                    </button>
                  ) : null}
                  {!isApproved ? (
                    <>
                      <button
                        onClick={() => handleApprove(draft.id)}
                        disabled={isPending}
                        className="rounded-full bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-500 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleDismiss(draft.id)}
                        disabled={isPending}
                        className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-600 hover:border-red-300 hover:text-red-700 disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {isExpanded && draft.outline ? (
                <div className="mt-3 max-h-64 overflow-y-auto rounded-lg bg-white border border-zinc-200 p-3">
                  <pre className="whitespace-pre-wrap text-xs text-zinc-700 font-sans leading-relaxed">
                    {draft.outline}
                  </pre>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

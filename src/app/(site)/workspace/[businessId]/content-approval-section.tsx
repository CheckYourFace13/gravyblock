"use client";

import { useState, useTransition } from "react";
import { approveQueuedDraft, dismissQueuedDraft, type QueuedDraft } from "./content-approval-actions";

const KIND_LABELS: Record<string, string> = {
  article: "SEO Article",
  gbp_post: "GBP Post",
  reddit_post: "Reddit Post",
  location_page: "Location Page",
  facebook_post: "Facebook Post",
  instagram_caption: "Instagram Caption",
};

const PLATFORM_STYLES: Record<string, { badge: string; dot: string }> = {
  facebook_post:     { badge: "bg-blue-100 text-blue-800",   dot: "bg-blue-500" },
  instagram_caption: { badge: "bg-pink-100 text-pink-800",   dot: "bg-pink-500" },
};

const SOCIAL_KINDS = new Set(["facebook_post", "instagram_caption"]);

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
      setDrafts((prev) =>
        prev.map((d) => d.id === id ? { ...d, status: "approved" } : d),
      );
    });
  }

  function handleDismiss(id: string) {
    startTransition(async () => {
      await dismissQueuedDraft(businessId, id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    });
  }

  const pending = drafts.filter((d) => d.status === "queued" || d.status === "pending_approval");
  const approved = drafts.filter((d) => d.status === "approved");

  // Social posts needing approval
  const pendingSocial = pending.filter((d) => SOCIAL_KINDS.has(d.kind));

  const allVisible = [...pending, ...approved];

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Content approval queue</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Review AI-generated drafts before they publish. Approve to publish, or dismiss to skip.
          </p>
        </div>
        {pending.length > 0 ? (
          <span className="shrink-0 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
            {pending.length} pending
          </span>
        ) : null}
      </div>

      {/* Social posts need approval banner */}
      {pendingSocial.length > 0 ? (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <span className="font-semibold">{pendingSocial.length} social post{pendingSocial.length > 1 ? "s" : ""} ready for review.</span>
          {" "}Approve to publish to Facebook/Instagram, or dismiss to skip.
        </div>
      ) : null}

      {allVisible.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">
          No content drafts queued yet. GravyBlock generates new drafts automatically each week on paid plans.
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {allVisible.map((draft) => {
          const isExpanded = expanded === draft.id;
          const isApproved = draft.status === "approved";
          const isSocial = SOCIAL_KINDS.has(draft.kind);
          const platformStyle = PLATFORM_STYLES[draft.kind];
          const isPendingApproval = draft.status === "pending_approval";

          return (
            <li
              key={draft.id}
              className={`rounded-xl border px-4 py-3 ${
                isApproved
                  ? "border-green-200 bg-green-50/50"
                  : isPendingApproval
                  ? "border-blue-200 bg-blue-50/40"
                  : "border-zinc-200 bg-zinc-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        platformStyle
                          ? platformStyle.badge
                          : "bg-zinc-200 text-zinc-700"
                      }`}
                    >
                      {KIND_LABELS[draft.kind] ?? draft.kind}
                    </span>
                    {isApproved ? (
                      <span className="rounded-full bg-green-200 px-2 py-0.5 text-xs font-semibold text-green-800">
                        Approved — queued to post
                      </span>
                    ) : isPendingApproval ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                        Needs your approval
                      </span>
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
                        {isSocial ? "Approve & post" : "Approve"}
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
                  {isSocial ? (
                    // Social posts are plain text — render as readable paragraphs
                    <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">
                      {draft.outline}
                    </p>
                  ) : (
                    <pre className="whitespace-pre-wrap text-xs text-zinc-700 font-sans leading-relaxed">
                      {draft.outline}
                    </pre>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

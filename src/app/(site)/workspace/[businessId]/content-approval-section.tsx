"use client";

import { useState, useTransition } from "react";
import { dismissQueuedDraft, type QueuedDraft } from "./content-approval-actions";

const KIND_LABELS: Record<string, string> = {
  article: "SEO Article",
  gbp_post: "GBP Post",
  location_page: "Location Page",
  facebook_post: "Facebook Post",
  instagram_caption: "Instagram Caption",
};

const PLATFORM_STYLES: Record<string, { badge: string; dot: string }> = {
  facebook_post:     { badge: "bg-blue-100 text-blue-800",   dot: "bg-blue-500" },
  instagram_caption: { badge: "bg-pink-100 text-pink-800",   dot: "bg-pink-500" },
};

type Props = {
  businessId: string;
  initialDrafts: QueuedDraft[];
};

export function ContentApprovalSection({ businessId, initialDrafts }: Props) {
  const [drafts, setDrafts] = useState<QueuedDraft[]>(initialDrafts);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDismiss(id: string) {
    startTransition(async () => {
      await dismissQueuedDraft(businessId, id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    });
  }

  const queued = drafts.filter((d) => d.status === "queued");
  const published = drafts.filter((d) => d.status === "published");
  const allVisible = [...queued, ...published];

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Content GravyBlock is publishing</h2>
          <p className="mt-1 text-sm text-zinc-600">
            No approval needed — these publish automatically to your connected site or social pages. Skip anything you'd rather not run.
          </p>
        </div>
        {queued.length > 0 ? (
          <span className="shrink-0 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
            {queued.length} publishing soon
          </span>
        ) : null}
      </div>

      {allVisible.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">
          Nothing queued right now. GravyBlock generates new drafts automatically on paid plans and publishes them without any action from you.
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {allVisible.map((draft) => {
          const isExpanded = expanded === draft.id;
          const isPublished = draft.status === "published";
          const platformStyle = PLATFORM_STYLES[draft.kind];

          return (
            <li
              key={draft.id}
              className={`rounded-xl border px-4 py-3 ${
                isPublished ? "border-green-200 bg-green-50/50" : "border-zinc-200 bg-zinc-50"
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
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        isPublished ? "bg-green-200 text-green-800" : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {isPublished ? "Published" : "Publishing soon"}
                    </span>
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
                  {!isPublished ? (
                    <button
                      onClick={() => handleDismiss(draft.id)}
                      disabled={isPending}
                      className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-600 hover:border-red-300 hover:text-red-700 disabled:opacity-50"
                    >
                      Skip
                    </button>
                  ) : null}
                </div>
              </div>

              {isExpanded && draft.outline ? (
                <div className="mt-3 max-h-64 overflow-y-auto rounded-lg bg-white border border-zinc-200 p-3">
                  {draft.kind === "facebook_post" || draft.kind === "instagram_caption" ? (
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

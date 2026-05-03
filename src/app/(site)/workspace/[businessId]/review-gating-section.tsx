"use client";

import { useState, useTransition } from "react";
import type { ReviewGatingData } from "./review-gating-actions";
import { createReviewGatingLink, deactivateReviewGatingLink } from "./review-gating-actions";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} className={`h-3 w-3 ${i < rating ? "text-yellow-400" : "text-zinc-200"}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

export function ReviewGatingSection({
  businessId,
  initialData,
}: {
  businessId: string;
  initialData: ReviewGatingData;
}) {
  const [data, setData] = useState(initialData);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const shareUrl = data.link?.active && data.link.token
    ? `${siteUrl}/r/${data.link.token}`
    : null;

  function handleCopy() {
    if (!shareUrl) return;
    void navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCreate() {
    startTransition(async () => {
      const result = await createReviewGatingLink(businessId);
      if (result.ok && result.token) {
        // Refresh the data
        const fresh = await import("./review-gating-actions").then((m) => m.getReviewGatingData(businessId));
        setData(fresh);
      }
    });
  }

  function handleDeactivate() {
    startTransition(async () => {
      await deactivateReviewGatingLink(businessId);
      const fresh = await import("./review-gating-actions").then((m) => m.getReviewGatingData(businessId));
      setData(fresh);
    });
  }

  const negativeResponses = data.responses.filter((r) => r.rating < 4);
  const positiveResponses = data.responses.filter((r) => r.rating >= 4);
  const avgRating = data.responses.length > 0
    ? data.responses.reduce((sum, r) => sum + r.rating, 0) / data.responses.length
    : null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Review gating</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Share this link with customers. Happy ones (4–5 ★) get sent to Google. Unhappy ones submit private feedback instead.
          </p>
        </div>
        {data.responses.length > 0 && (
          <div className="shrink-0 text-right">
            <p className="text-xl font-semibold text-zinc-900">{data.responses.length}</p>
            <p className="text-xs text-zinc-500">responses</p>
          </div>
        )}
      </div>

      {/* Stats row */}
      {data.responses.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-center">
            <p className="text-xl font-semibold text-zinc-900">{avgRating?.toFixed(1)}</p>
            <p className="text-xs text-zinc-500">avg rating</p>
          </div>
          <div className="rounded-xl border border-green-100 bg-green-50 p-3 text-center">
            <p className="text-xl font-semibold text-green-800">{positiveResponses.length}</p>
            <p className="text-xs text-green-700">sent to Google</p>
          </div>
          <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center">
            <p className="text-xl font-semibold text-red-800">{negativeResponses.length}</p>
            <p className="text-xs text-red-700">private feedback</p>
          </div>
        </div>
      )}

      {/* Link card */}
      <div className="mt-4">
        {shareUrl ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="flex items-center gap-2">
              <span className="mr-1 h-2 w-2 shrink-0 rounded-full bg-green-500" />
              <p className="flex-1 truncate font-mono text-xs text-zinc-700">{shareUrl}</p>
              <button
                onClick={handleCopy}
                className="shrink-0 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:border-zinc-400"
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Share via text, email, receipt, or QR code. Happy customers (4+ stars) are redirected to Google.{" "}
              {data.reviewUrl && (
                <a href={data.reviewUrl} target="_blank" rel="noopener" className="font-medium text-red-700 hover:underline">
                  View your Google review page →
                </a>
              )}
            </p>
            <button
              onClick={handleDeactivate}
              disabled={isPending}
              className="mt-2 text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50"
            >
              Deactivate link
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center">
            <p className="text-sm text-zinc-600">No active review gating link yet.</p>
            <button
              onClick={handleCreate}
              disabled={isPending}
              className="mt-3 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {isPending ? "Creating…" : "Create review link"}
            </button>
            {data.reviewUrl && (
              <p className="mt-2 text-xs text-zinc-500">
                Will automatically route 4+ star customers to{" "}
                <a href={data.reviewUrl} target="_blank" rel="noopener" className="font-medium text-red-700 hover:underline">
                  your Google review page
                </a>
                .
              </p>
            )}
          </div>
        )}
      </div>

      {/* Private negative feedback */}
      {negativeResponses.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-800">
            Private feedback ({negativeResponses.length})
          </p>
          <ul className="mt-2 space-y-2">
            {negativeResponses.map((r) => (
              <li key={r.id} className="rounded-xl border border-red-100 bg-red-50 p-3">
                <div className="flex items-center gap-2">
                  <StarDisplay rating={r.rating} />
                  <span className="text-xs text-zinc-500">
                    {new Date(r.submittedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                {r.feedback ? (
                  <p className="mt-1.5 text-sm text-zinc-700 leading-relaxed">{r.feedback}</p>
                ) : (
                  <p className="mt-1.5 text-xs italic text-zinc-400">No written feedback.</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tip if no responses yet */}
      {data.responses.length === 0 && shareUrl && (
        <p className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-500">
          💡 <strong>Tip:</strong> Add this link to your Google Business Profile as a booking/website button, print it as a QR code on receipts, or text it after each appointment.
        </p>
      )}
    </section>
  );
}

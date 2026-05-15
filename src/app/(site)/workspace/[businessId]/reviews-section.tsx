"use client";

import { useState, useTransition } from "react";
import { markReviewReplied, markReviewNew } from "./mark-replied-action";

type Review = {
  id: string;
  authorName: string | null;
  rating: number;
  text: string | null;
  publishTime: Date | null;
  suggestedReply: string | null;
  status: string;
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          className={`h-3.5 w-3.5 ${i < rating ? "text-yellow-400" : "text-zinc-200"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  );
}

function ReviewCard({ review, onStatusChange }: { review: Review; onStatusChange: (id: string, status: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleCopy() {
    if (!review.suggestedReply) return;
    void navigator.clipboard.writeText(review.suggestedReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleToggleReplied() {
    startTransition(async () => {
      if (review.status === "replied") {
        await markReviewNew(review.id);
        onStatusChange(review.id, "new");
      } else {
        await markReviewReplied(review.id);
        onStatusChange(review.id, "replied");
      }
    });
  }

  const isReplied = review.status === "replied";
  const ratingColor = isReplied
    ? "bg-zinc-50 border-zinc-200 opacity-75"
    : review.rating >= 4
    ? "bg-green-50 border-green-100"
    : review.rating === 3
    ? "bg-yellow-50 border-yellow-100"
    : "bg-red-50 border-red-100";

  return (
    <li className={`rounded-xl border p-4 transition-opacity ${ratingColor}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Stars rating={review.rating} />
            <span className="text-xs font-semibold text-zinc-700">{review.authorName ?? "Anonymous"}</span>
            {review.publishTime ? (
              <span className="text-xs text-zinc-400">
                {new Date(review.publishTime).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
            ) : null}
            {isReplied && (
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">Replied</span>
            )}
          </div>
          {review.text ? (
            <p className="mt-2 text-sm text-zinc-700 leading-relaxed">{review.text}</p>
          ) : (
            <p className="mt-2 text-sm italic text-zinc-400">No review text.</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
          review.rating >= 4 ? "bg-green-100 text-green-800" : review.rating === 3 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"
        }`}>
          {review.rating}★
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-zinc-200/60 pt-3">
        {review.suggestedReply ? (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
            >
              <span>{expanded ? "Hide" : "Show"} AI reply draft</span>
              <svg className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <span className="text-zinc-200">|</span>
          </>
        ) : null}
        <button
          onClick={handleToggleReplied}
          disabled={isPending}
          className={`text-xs font-semibold transition ${
            isReplied ? "text-zinc-400 hover:text-zinc-600" : "text-green-700 hover:text-green-800"
          } disabled:opacity-50`}
        >
          {isPending ? "…" : isReplied ? "↩ Mark as new" : "✓ Mark replied"}
        </button>
      </div>

      {expanded && review.suggestedReply ? (
        <div className="mt-2">
          <p className="rounded-lg bg-white/70 px-3 py-2 text-sm text-zinc-700 italic border border-zinc-200">
            {review.suggestedReply}
          </p>
          <button
            onClick={handleCopy}
            className="mt-2 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:border-zinc-400 transition"
          >
            {copied ? "Copied!" : "Copy reply"}
          </button>
          <p className="mt-1 text-[10px] text-zinc-400">Copy and paste into Google Maps to reply, then mark replied above.</p>
        </div>
      ) : null}
    </li>
  );
}

export function ReviewsSection({ reviews: initialReviews }: { reviews: Review[] }) {
  const [reviews, setReviews] = useState(initialReviews);
  const [filter, setFilter] = useState<"all" | "needs_reply" | "replied">("all");

  function handleStatusChange(id: string, status: string) {
    setReviews((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
  }

  const avgRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;
  const needsReplyCount = reviews.filter((r) => r.status !== "replied").length;
  const repliedCount = reviews.filter((r) => r.status === "replied").length;

  const displayed = reviews.filter((r) => {
    if (filter === "needs_reply") return r.status !== "replied";
    if (filter === "replied") return r.status === "replied";
    return true;
  });

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Review inbox</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Latest reviews from Google. AI-drafted replies ready to copy and paste.
          </p>
        </div>
        {avgRating !== null ? (
          <div className="shrink-0 text-right">
            <p className="text-2xl font-semibold text-zinc-900">{avgRating.toFixed(1)}</p>
            <Stars rating={Math.round(avgRating)} />
            <p className="mt-0.5 text-xs text-zinc-500">{reviews.length} synced</p>
          </div>
        ) : null}
      </div>

      {/* Filter tabs */}
      {reviews.length > 0 && (
        <div className="mt-3 flex gap-1">
          {(["all", "needs_reply", "replied"] as const).map((f) => {
            const label = f === "all" ? `All (${reviews.length})` : f === "needs_reply" ? `Needs reply (${needsReplyCount})` : `Replied (${repliedCount})`;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  filter === f
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-200 text-zinc-600 hover:border-zinc-300"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {needsReplyCount > 0 && filter !== "replied" ? (
        <div className="mt-3 rounded-lg bg-yellow-50 border border-yellow-100 px-3 py-2 text-sm font-medium text-yellow-800">
          {needsReplyCount} review{needsReplyCount === 1 ? "" : "s"} waiting for a reply
        </div>
      ) : null}

      <ul className="mt-4 space-y-3">
        {displayed.map((review) => (
          <ReviewCard key={review.id} review={review} onStatusChange={handleStatusChange} />
        ))}
        {displayed.length === 0 && reviews.length > 0 ? (
          <li className="py-4 text-sm text-zinc-500">No reviews in this filter.</li>
        ) : null}
        {reviews.length === 0 ? (
          <li className="py-4 text-sm text-zinc-500">
            No reviews synced yet. The worker fetches your latest Google reviews weekly.
          </li>
        ) : null}
      </ul>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Phase = "ready" | "sent" | "not_found" | "loading";

/**
 * Same experience for every visitor: the Google review link is always shown,
 * plus an optional private feedback box. No rating is collected or used to route.
 */
export default function ReviewRequestPage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";

  const [phase, setPhase] = useState<Phase>("loading");
  const [businessName, setBusinessName] = useState("");
  const [reviewUrl, setReviewUrl] = useState("");
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/review-request/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setPhase("not_found"); return; }
        setBusinessName(data.businessName ?? "this business");
        setReviewUrl(data.reviewUrl ?? "");
        setPhase("ready");
      })
      .catch(() => setPhase("not_found"));
  }, [token]);

  async function handleFeedbackSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!feedback.trim()) return;
    setSubmitting(true);
    await fetch(`/api/review-request/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    }).catch(() => null);
    setPhase("sent");
    setSubmitting(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl text-center">

        {phase === "loading" && (
          <div className="py-8">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-700" />
          </div>
        )}

        {phase === "not_found" && (
          <>
            <h1 className="mt-3 text-xl font-semibold text-zinc-900">Link not found</h1>
            <p className="mt-2 text-sm text-zinc-500">This review link has expired or is no longer active.</p>
          </>
        )}

        {phase === "ready" && (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-700">Share your experience</p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-900">
              How was your visit to {businessName}?
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              We would appreciate an honest review on Google, whatever your experience was.
            </p>
            {reviewUrl && (
              <a
                href={reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 block w-full rounded-full bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Leave a Google review
              </a>
            )}
            <form onSubmit={handleFeedbackSubmit} className="mt-6 space-y-3 text-left">
              <label className="block text-xs font-semibold text-zinc-600">
                Optional: send private feedback to the team
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Anything you want us to know?"
                rows={3}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-800 focus:border-zinc-400 focus:outline-none resize-none"
              />
              <button
                type="submit"
                disabled={submitting || !feedback.trim()}
                className="w-full rounded-full border border-zinc-300 bg-white py-2.5 text-sm font-semibold text-zinc-700 hover:border-zinc-400 disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Send private feedback"}
              </button>
            </form>
          </>
        )}

        {phase === "sent" && (
          <>
            <h1 className="mt-3 text-xl font-semibold text-zinc-900">Thank you!</h1>
            <p className="mt-2 text-sm text-zinc-500">Your feedback has been received.</p>
            {reviewUrl && (
              <a
                href={reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 block w-full rounded-full bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Leave a Google review
              </a>
            )}
          </>
        )}

        <p className="mt-8 text-[10px] text-zinc-300">Powered by GravyBlock</p>
      </div>
    </div>
  );
}

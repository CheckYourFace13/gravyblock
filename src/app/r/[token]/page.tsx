"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Phase = "rating" | "feedback" | "redirect" | "thanks" | "not_found" | "loading";

function StarButton({ value, selected, hover, onHover, onClick }: {
  value: number;
  selected: number;
  hover: number;
  onHover: (v: number) => void;
  onClick: (v: number) => void;
}) {
  const filled = value <= (hover || selected);
  return (
    <button
      type="button"
      onMouseEnter={() => onHover(value)}
      onMouseLeave={() => onHover(0)}
      onClick={() => onClick(value)}
      className="transition-transform hover:scale-110 focus:outline-none"
      aria-label={`${value} star${value !== 1 ? "s" : ""}`}
    >
      <svg
        className={`h-12 w-12 sm:h-14 sm:w-14 transition-colors ${filled ? "text-yellow-400" : "text-zinc-200"}`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    </button>
  );
}

const ratingLabel = ["", "Poor", "Fair", "Average", "Good", "Excellent"];

export default function ReviewRequestPage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";

  const [phase, setPhase] = useState<Phase>("loading");
  const [businessName, setBusinessName] = useState("");
  const [positiveRedirectUrl, setPositiveRedirectUrl] = useState("");
  const [threshold, setThreshold] = useState(4);

  const [selected, setSelected] = useState(0);
  const [hover, setHover] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Load the link metadata
  useEffect(() => {
    if (!token) return;
    fetch(`/api/review-request/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setPhase("not_found"); return; }
        setBusinessName(data.businessName ?? "this business");
        setPositiveRedirectUrl(data.positiveRedirectUrl ?? "");
        setThreshold(data.threshold ?? 4);
        setPhase("rating");
      })
      .catch(() => setPhase("not_found"));
  }, [token]);

  function handleStarClick(value: number) {
    setSelected(value);
    if (value >= threshold) {
      // Happy path — submit then redirect
      void submitAndRedirect(value);
    } else {
      // Unhappy — ask for feedback
      setPhase("feedback");
    }
  }

  async function submitAndRedirect(rating: number) {
    setPhase("redirect");
    await fetch(`/api/review-request/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    }).catch(() => null);
    if (positiveRedirectUrl) {
      window.location.href = positiveRedirectUrl;
    } else {
      setPhase("thanks");
    }
  }

  async function handleFeedbackSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch(`/api/review-request/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: selected, feedback }),
    }).catch(() => null);
    setPhase("thanks");
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
            <p className="text-4xl">🔗</p>
            <h1 className="mt-3 text-xl font-semibold text-zinc-900">Link not found</h1>
            <p className="mt-2 text-sm text-zinc-500">This review link has expired or is no longer active.</p>
          </>
        )}

        {phase === "rating" && (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-700">Share your experience</p>
            <h1 className="mt-2 text-2xl font-semibold text-zinc-900">
              How was your visit to {businessName}?
            </h1>
            <p className="mt-2 text-sm text-zinc-500">Tap a star to rate your experience.</p>
            <div className="mt-6 flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((v) => (
                <StarButton
                  key={v}
                  value={v}
                  selected={selected}
                  hover={hover}
                  onHover={setHover}
                  onClick={handleStarClick}
                />
              ))}
            </div>
            {(hover || selected) > 0 && (
              <p className="mt-2 text-sm font-semibold text-zinc-700 transition-all">
                {ratingLabel[hover || selected]}
              </p>
            )}
          </>
        )}

        {phase === "feedback" && (
          <>
            <p className="text-4xl">💬</p>
            <h1 className="mt-3 text-xl font-semibold text-zinc-900">
              We&apos;re sorry to hear that.
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Tell us what went wrong. Your feedback goes directly to the team — not online.
            </p>
            <form onSubmit={handleFeedbackSubmit} className="mt-5 space-y-3 text-left">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="What could we have done better?"
                rows={4}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-800 focus:border-zinc-400 focus:outline-none resize-none"
              />
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Send feedback"}
              </button>
              <button
                type="button"
                onClick={() => setPhase("rating")}
                className="w-full text-xs text-zinc-400 hover:text-zinc-600"
              >
                Go back
              </button>
            </form>
          </>
        )}

        {phase === "redirect" && (
          <>
            <p className="text-4xl">⭐</p>
            <h1 className="mt-3 text-xl font-semibold text-zinc-900">Thanks!</h1>
            <p className="mt-2 text-sm text-zinc-500">Taking you to Google now…</p>
            <div className="mt-4 mx-auto h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-700" />
          </>
        )}

        {phase === "thanks" && (
          <>
            <p className="text-4xl">🙏</p>
            <h1 className="mt-3 text-xl font-semibold text-zinc-900">Thank you!</h1>
            <p className="mt-2 text-sm text-zinc-500">
              Your feedback has been received. We appreciate you taking the time.
            </p>
          </>
        )}

        <p className="mt-8 text-[10px] text-zinc-300">Powered by GravyBlock</p>
      </div>
    </div>
  );
}

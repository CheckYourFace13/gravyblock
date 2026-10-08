"use client";

import { useState, useTransition } from "react";
import { startScaleFromReportAction } from "@/app/(site)/start/actions";

const RISK_LINE = "$74.99/month locked while subscribed · Cancel anytime · 30-day money-back guarantee";

/** Where a report visitor lands when we cannot send them straight to checkout. */
function startHref(publicId: string): string {
  return `/start?plan=growth&promo=GROWTH50&report=${encodeURIComponent(publicId)}`;
}

function track(eventType: string, publicId: string, businessId: string | null, placement: string) {
  try {
    void fetch("/api/events/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, reportPublicId: publicId, businessId, proofType: placement, path: window.location.pathname }),
      keepalive: true,
    });
  } catch {
    /* tracking must never block the click */
  }
}

/**
 * Primary purchase button for a completed scan. If the visitor has unlocked the report
 * (so we hold their email and business), one click goes straight to secure checkout with
 * Scale and GROWTH50 applied. Otherwise it opens the start page with the business already
 * filled in, needing only an email address.
 */
export function ScaleCta({
  publicId,
  businessId,
  unlockToken,
  placement,
  label = "Start GravyBlock — $74.99/mo",
  showRisk = true,
  compact = false,
  className = "",
}: {
  publicId: string;
  businessId?: string | null;
  unlockToken?: string | null;
  placement: string;
  label?: string;
  showRisk?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    track("scale_cta_clicked", publicId, businessId ?? null, placement);
    if (!unlockToken) {
      window.location.href = startHref(publicId);
      return;
    }
    startTransition(async () => {
      const res = await startScaleFromReportAction({ publicId, unlockToken });
      if (res.ok) {
        window.location.href = res.checkoutUrl;
      } else if (res.fallbackToStart) {
        window.location.href = startHref(publicId);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`w-full rounded-full bg-red-600 px-6 ${compact ? "py-3 text-sm" : "py-4 text-base"} font-bold text-white shadow-md transition hover:bg-red-500 disabled:cursor-wait disabled:opacity-70 sm:w-auto sm:px-9`}
      >
        {pending ? "Taking you to secure checkout…" : label}
      </button>
      {showRisk ? <p className="mt-2 text-xs font-medium text-zinc-600">{RISK_LINE}</p> : null}
      {error ? <p className="mt-2 text-xs font-medium text-red-700">{error}</p> : null}
    </div>
  );
}

const VALUE_STACK = [
  "Finds what is hurting your visibility",
  "Chooses what is worth fixing next",
  "Makes eligible website improvements",
  "Works on Google, reviews and social once connected",
  "Pursues legitimate authority and backlink opportunities",
  "Checks AI-search visibility",
  "Verifies what it completed",
  "Keeps monitoring and working automatically",
];

/** The sales block: what you get for the price, then the one button. */
export function ScaleOffer({
  publicId,
  businessId,
  unlockToken,
  placement,
  heading = "You can fix this yourself, or GravyBlock can take it from here.",
}: {
  publicId: string;
  businessId?: string | null;
  unlockToken?: string | null;
  placement: string;
  heading?: string;
}) {
  return (
    <section className="rounded-3xl border-2 border-red-200 bg-gradient-to-br from-red-50 via-white to-white p-6 shadow-sm sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">{heading}</h2>
      <p className="mt-2 max-w-2xl text-base text-zinc-700">
        GravyBlock already knows what is wrong. Turn on Autopilot and it will prioritize the work, perform the eligible fixes, verify them
        and keep working automatically.
      </p>
      <p className="mt-4 text-sm font-semibold text-zinc-900">
        For $74.99/month, GravyBlock keeps working on your visibility without you managing SEO.
      </p>
      <ul className="mt-3 grid gap-1.5 text-sm text-zinc-700 sm:grid-cols-2">
        {VALUE_STACK.map((v) => (
          <li key={v} className="flex gap-2">
            <span className="font-bold text-emerald-600">✓</span>
            {v}
          </li>
        ))}
      </ul>
      <ScaleCta publicId={publicId} businessId={businessId} unlockToken={unlockToken} placement={placement} className="mt-6" />
    </section>
  );
}

/** Persistent bottom bar on small screens so the next step is always one tap away. */
export function StickyScaleBar({
  publicId,
  businessId,
  unlockToken,
}: {
  publicId: string;
  businessId?: string | null;
  unlockToken?: string | null;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 px-4 py-2 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur md:hidden">
      <ScaleCta
        publicId={publicId}
        businessId={businessId}
        unlockToken={unlockToken}
        placement="sticky"
        label="Start GravyBlock — $74.99/mo"
        showRisk={false}
        compact
      />
    </div>
  );
}

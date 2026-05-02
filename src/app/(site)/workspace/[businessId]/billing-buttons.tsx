"use client";

import { useState, useTransition } from "react";
import { createBillingPortalAction, createCheckoutSessionAction } from "@/app/(site)/workspace/[businessId]/billing-actions";
import type { CheckoutPlan } from "@/lib/stripe/server";

function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-2 text-xs font-medium text-red-700">{message}</p>;
}

async function runCheckout(businessId: string, plan: CheckoutPlan, promoCode?: "ILoveYouFree" | "ILikeYou50" | null) {
  const formData = new FormData();
  formData.set("businessId", businessId);
  formData.set("plan", plan);
  if (promoCode) formData.set("promoCode", promoCode);
  return createCheckoutSessionAction(formData);
}

const growthExtras = [
  "AI-written content drafts + auto-published articles",
  "Reddit and blog posting on third-party channels",
  "Multi-step outreach sequences (3-step follow-up)",
  "8 backlink opportunities queued every month",
  "12 citation tasks + 8 review tasks/month",
  "Multi-location support",
];

export function CheckoutButton({
  businessId,
  plan,
  label,
  className,
  requireGrowthUpsell,
  promoCode,
}: {
  businessId: string;
  plan: CheckoutPlan;
  label: string;
  className: string;
  requireGrowthUpsell?: boolean;
  promoCode?: "ILoveYouFree" | "ILikeYou50" | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showUpsell, setShowUpsell] = useState(false);

  if (plan !== "starter" || !requireGrowthUpsell) {
    return (
      <div>
        <button
          type="button"
          disabled={pending}
          className={`${className} ${pending ? "cursor-not-allowed opacity-70" : ""}`}
          onClick={() => {
            startTransition(async () => {
              setError(null);
              try {
                const result = await runCheckout(businessId, plan, promoCode);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                window.location.href = result.checkoutUrl;
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not start checkout");
              }
            });
          }}
        >
          {pending ? "Opening checkout..." : label}
        </button>
        {promoCode ? <p className="mt-2 text-xs font-medium text-zinc-600">Promo code ready: {promoCode}</p> : null}
        <InlineError message={error} />
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className={`${className} ${pending ? "cursor-not-allowed opacity-70" : ""}`}
        onClick={() => {
          setError(null);
          setShowUpsell(true);
        }}
      >
        {label}
      </button>
      <InlineError message={error} />

      {showUpsell ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="growth-upsell-title"
        >
          <div className="max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h2 id="growth-upsell-title" className="text-lg font-semibold text-zinc-900">
              Before you choose Starter, Scale adds full execution
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Starter covers monthly monitoring and content ideas. Scale adds automated publishing, Reddit/blog posting,
              and outreach sequences.
            </p>
            <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-zinc-700">
              {growthExtras.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                onClick={() => {
                  startTransition(async () => {
                    setError(null);
                    const result = await runCheckout(businessId, "growth", promoCode);
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    window.location.href = result.checkoutUrl;
                  });
                }}
              >
                {pending ? "Opening checkout..." : "Upgrade to Scale"}
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-full bg-zinc-100 border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 disabled:opacity-60"
                onClick={() => {
                  startTransition(async () => {
                    setError(null);
                    const result = await runCheckout(businessId, "starter", promoCode);
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setShowUpsell(false);
                    window.location.href = result.checkoutUrl;
                  });
                }}
              >
                {pending ? "Opening checkout..." : "Continue with Starter"}
              </button>
              <button
                type="button"
                className="rounded-full px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900"
                onClick={() => setShowUpsell(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PortalButton({
  businessId,
  label,
  className,
}: {
  businessId: string;
  label: string;
  className: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className={`${className} ${pending ? "cursor-not-allowed opacity-70" : ""}`}
        onClick={() => {
          startTransition(async () => {
            setError(null);
            try {
              const formData = new FormData();
              formData.set("businessId", businessId);
              const result = await createBillingPortalAction(formData);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              window.location.href = result.portalUrl;
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not open billing portal");
            }
          });
        }}
      >
        {pending ? "Opening billing..." : label}
      </button>
      <InlineError message={error} />
    </div>
  );
}

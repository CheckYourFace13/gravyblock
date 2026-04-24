"use client";

import { useState, useTransition } from "react";
import { createBillingPortalAction, createCheckoutSessionAction } from "@/app/(site)/workspace/[businessId]/billing-actions";

function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-2 text-xs font-medium text-red-700">{message}</p>;
}

async function runCheckout(businessId: string, plan: "base" | "pro") {
  const formData = new FormData();
  formData.set("businessId", businessId);
  formData.set("plan", plan);
  return createCheckoutSessionAction(formData);
}

const proExtras = [
  "Faster refresh cadence than Base (weekly vs monthly in product settings)",
  "Content queue and publishing history",
  "Local and service-area page queue",
  "Citation and listing issue queue",
  "Review and reputation task queue",
  "AI visibility checks in workspace",
  "Multi-location support where the workspace supports it",
];

export function CheckoutButton({
  businessId,
  plan,
  label,
  className,
  requireProUpsell,
}: {
  businessId: string;
  plan: "base" | "pro";
  label: string;
  className: string;
  /** When true, Base checkout opens an upsell step before Stripe. */
  requireProUpsell?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showUpsell, setShowUpsell] = useState(false);

  if (plan === "pro" || !requireProUpsell) {
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
                const result = await runCheckout(businessId, plan);
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
          aria-labelledby="base-upsell-title"
        >
          <div className="max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h2 id="base-upsell-title" className="text-lg font-semibold text-zinc-900">
              Before you choose Base, Pro adds more automation
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Pro is the fullest automation layer in this build. Base covers monthly monitoring and summaries; Pro adds
              the queues and cadence below.
            </p>
            <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-zinc-700">
              {proExtras.map((line) => (
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
                    const result = await runCheckout(businessId, "pro");
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    window.location.href = result.checkoutUrl;
                  });
                }}
              >
                {pending ? "Opening checkout..." : "Upgrade to Pro"}
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:border-zinc-400 disabled:opacity-60"
                onClick={() => {
                  startTransition(async () => {
                    setError(null);
                    const result = await runCheckout(businessId, "base");
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    setShowUpsell(false);
                    window.location.href = result.checkoutUrl;
                  });
                }}
              >
                {pending ? "Opening checkout..." : "Continue with Base"}
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

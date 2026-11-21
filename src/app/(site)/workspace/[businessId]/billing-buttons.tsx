"use client";

import { useState, useTransition } from "react";
import {
  createBillingPortalAction,
  createCheckoutSessionAction,
} from "@/app/(site)/workspace/[businessId]/billing-actions";
import type { CheckoutPlan } from "@/lib/stripe/server";
import type { PromoCode } from "@/lib/stripe/promo-codes";

function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-2 text-xs font-medium text-red-700">{message}</p>;
}

async function runCheckout(
  businessId: string,
  plan: CheckoutPlan,
  promoCode?: PromoCode | null,
) {
  const formData = new FormData();
  formData.set("businessId", businessId);
  formData.set("plan", plan);
  if (promoCode) formData.set("promoCode", promoCode);
  return createCheckoutSessionAction(formData);
}

export function CheckoutButton({
  businessId,
  plan,
  label,
  className,
  promoCode,
}: {
  businessId: string;
  plan: CheckoutPlan;
  label: string;
  className: string;
  promoCode?: PromoCode | null;
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
              const result = await runCheckout(businessId, plan, promoCode);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              window.location.href = result.checkoutUrl;
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Could not start checkout",
              );
            }
          });
        }}
      >
        {pending ? "Opening checkout..." : label}
      </button>
      {promoCode ? (
        <p className="mt-2 text-xs font-medium text-zinc-600">
          Promo code ready: {promoCode}
        </p>
      ) : null}
      <InlineError message={error} />
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
              setError(
                err instanceof Error
                  ? err.message
                  : "Could not open billing portal",
              );
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

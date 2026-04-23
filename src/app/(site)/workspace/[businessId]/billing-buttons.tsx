"use client";

import { useState, useTransition } from "react";
import { createBillingPortalAction, createCheckoutSessionAction } from "@/app/(site)/workspace/[businessId]/billing-actions";

function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-2 text-xs font-medium text-red-700">{message}</p>;
}

export function CheckoutButton({
  businessId,
  plan,
  label,
  className,
}: {
  businessId: string;
  plan: "entry" | "pro";
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
              formData.set("plan", plan);
              const result = await createCheckoutSessionAction(formData);
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

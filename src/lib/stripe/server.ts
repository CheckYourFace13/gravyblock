import Stripe from "stripe";

let stripeClient: Stripe | null | undefined;

export function getStripeServerClient(): Stripe | null {
  if (stripeClient !== undefined) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    stripeClient = null;
    return stripeClient;
  }
  stripeClient = new Stripe(key, {
    apiVersion: "2026-03-25.dahlia",
  });
  return stripeClient;
}

export function getStripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export function getAppBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
}

export function getPriceIdForPlan(plan: "entry" | "pro"): string {
  const fromEnv =
    plan === "entry"
      ? process.env.STRIPE_PRICE_ENTRY_MONTHLY?.trim()
      : process.env.STRIPE_PRICE_PRO_MONTHLY?.trim();
  if (!fromEnv) {
    throw new Error(
      plan === "entry"
        ? "STRIPE_PRICE_ENTRY_MONTHLY is not configured"
        : "STRIPE_PRICE_PRO_MONTHLY is not configured",
    );
  }
  return fromEnv;
}

export function getPlanFromPriceId(priceId: string | null | undefined): "entry" | "pro" | null {
  if (!priceId) return null;
  const entry = process.env.STRIPE_PRICE_ENTRY_MONTHLY?.trim();
  const pro = process.env.STRIPE_PRICE_PRO_MONTHLY?.trim();
  if (entry && priceId === entry) return "entry";
  if (pro && priceId === pro) return "pro";
  return null;
}

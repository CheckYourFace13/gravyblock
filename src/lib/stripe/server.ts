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

function basePriceIdFromEnv(): string {
  const fromNew = process.env.STRIPE_PRICE_BASE_MONTHLY?.trim();
  const fromLegacy = process.env.STRIPE_PRICE_ENTRY_MONTHLY?.trim();
  const id = fromNew || fromLegacy;
  if (!id) {
    throw new Error(
      "Stripe Base price is not configured. Set STRIPE_PRICE_BASE_MONTHLY (or legacy STRIPE_PRICE_ENTRY_MONTHLY).",
    );
  }
  return id;
}

export function getPriceIdForPlan(plan: "base" | "pro"): string {
  if (plan === "base") {
    return basePriceIdFromEnv();
  }
  const pro = process.env.STRIPE_PRICE_PRO_MONTHLY?.trim();
  if (!pro) {
    throw new Error("STRIPE_PRICE_PRO_MONTHLY is not configured");
  }
  return pro;
}

export function getPlanFromPriceId(priceId: string | null | undefined): "base" | "pro" | null {
  if (!priceId) return null;
  const base =
    process.env.STRIPE_PRICE_BASE_MONTHLY?.trim() ||
    process.env.STRIPE_PRICE_ENTRY_MONTHLY?.trim();
  const pro = process.env.STRIPE_PRICE_PRO_MONTHLY?.trim();
  if (base && priceId === base) return "base";
  if (pro && priceId === pro) return "pro";
  return null;
}

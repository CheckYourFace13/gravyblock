import Stripe from "stripe";
import type { PlanTier } from "@/lib/plans";

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

export type CheckoutPlan = "starter" | "growth" | "pro" | "agency";

export function getPriceIdForPlan(plan: CheckoutPlan): string {
  const envMap: Record<CheckoutPlan, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER_MONTHLY?.trim() ||
             process.env.STRIPE_PRICE_BASE_MONTHLY?.trim() ||
             process.env.STRIPE_PRICE_ENTRY_MONTHLY?.trim(),
    growth:  process.env.STRIPE_PRICE_GROWTH_MONTHLY?.trim(),
    pro:     process.env.STRIPE_PRICE_PRO_MONTHLY?.trim(),
    agency:  process.env.STRIPE_PRICE_AGENCY_MONTHLY?.trim(),
  };
  const priceId = envMap[plan];
  if (!priceId) {
    throw new Error(`Stripe price ID not configured for plan "${plan}". Check your environment variables.`);
  }
  return priceId;
}

export function getPlanFromPriceId(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  const pairs: Array<[string | undefined, PlanTier]> = [
    [process.env.STRIPE_PRICE_STARTER_MONTHLY?.trim() || process.env.STRIPE_PRICE_BASE_MONTHLY?.trim() || process.env.STRIPE_PRICE_ENTRY_MONTHLY?.trim(), "starter"],
    [process.env.STRIPE_PRICE_GROWTH_MONTHLY?.trim(), "growth"],
    [process.env.STRIPE_PRICE_PRO_MONTHLY?.trim(), "pro"],
    [process.env.STRIPE_PRICE_AGENCY_MONTHLY?.trim(), "agency"],
  ];
  for (const [id, tier] of pairs) {
    if (id && priceId === id) return tier;
  }
  return null;
}

export function getAddonLocationPriceId(): string | null {
  return process.env.STRIPE_PRICE_ADDON_LOCATION?.trim() || null;
}

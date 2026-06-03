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
export type BillingInterval = "monthly" | "annual";

// Annual prices are ~25% cheaper than 12× monthly (e.g. Starter: $719.88/yr vs $79.99×12=$959.88)
// Create these in Stripe dashboard, then set these env vars on VPS:
//   STRIPE_PRICE_STARTER_ANNUAL, STRIPE_PRICE_GROWTH_ANNUAL,
//   STRIPE_PRICE_PRO_ANNUAL, STRIPE_PRICE_AGENCY_ANNUAL
export const ANNUAL_SAVINGS: Record<CheckoutPlan, { monthlyEquiv: number; fullPrice: number }> = {
  starter: { monthlyEquiv: 59.99,  fullPrice: 719.88 },
  growth:  { monthlyEquiv: 112.49, fullPrice: 1349.88 },
  pro:     { monthlyEquiv: 187.49, fullPrice: 2249.88 },
  agency:  { monthlyEquiv: 374.99, fullPrice: 4499.88 },
};

export function getPriceIdForPlan(plan: CheckoutPlan, interval: BillingInterval = "monthly"): string {
  const envMap: Record<CheckoutPlan, Record<BillingInterval, string | undefined>> = {
    starter: {
      monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY?.trim() ||
               process.env.STRIPE_PRICE_BASE_MONTHLY?.trim() ||
               process.env.STRIPE_PRICE_ENTRY_MONTHLY?.trim(),
      annual:  process.env.STRIPE_PRICE_STARTER_ANNUAL?.trim(),
    },
    growth: {
      monthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY?.trim(),
      annual:  process.env.STRIPE_PRICE_GROWTH_ANNUAL?.trim(),
    },
    pro: {
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY?.trim(),
      annual:  process.env.STRIPE_PRICE_PRO_ANNUAL?.trim(),
    },
    agency: {
      monthly: process.env.STRIPE_PRICE_AGENCY_MONTHLY?.trim(),
      annual:  process.env.STRIPE_PRICE_AGENCY_ANNUAL?.trim(),
    },
  };
  const priceId = envMap[plan][interval];
  if (!priceId) {
    // Fall back to monthly if annual not configured yet
    if (interval === "annual") {
      const monthly = envMap[plan].monthly;
      if (monthly) return monthly;
    }
    throw new Error(`Stripe price ID not configured for plan "${plan}" (${interval}). Check your environment variables.`);
  }
  return priceId;
}

export function getPlanFromPriceId(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  const pairs: Array<[string | undefined, PlanTier]> = [
    [process.env.STRIPE_PRICE_STARTER_MONTHLY?.trim() || process.env.STRIPE_PRICE_BASE_MONTHLY?.trim() || process.env.STRIPE_PRICE_ENTRY_MONTHLY?.trim(), "starter"],
    [process.env.STRIPE_PRICE_STARTER_ANNUAL?.trim(), "starter"],
    [process.env.STRIPE_PRICE_GROWTH_MONTHLY?.trim(), "growth"],
    [process.env.STRIPE_PRICE_GROWTH_ANNUAL?.trim(), "growth"],
    [process.env.STRIPE_PRICE_PRO_MONTHLY?.trim(), "pro"],
    [process.env.STRIPE_PRICE_PRO_ANNUAL?.trim(), "pro"],
    [process.env.STRIPE_PRICE_AGENCY_MONTHLY?.trim(), "agency"],
    [process.env.STRIPE_PRICE_AGENCY_ANNUAL?.trim(), "agency"],
  ];
  for (const [id, tier] of pairs) {
    if (id && priceId === id) return tier;
  }
  return null;
}

export function getAddonLocationPriceId(): string | null {
  return process.env.STRIPE_PRICE_ADDON_LOCATION?.trim() || null;
}

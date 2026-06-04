"use server";

import { randomUUID } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { getDb, businesses } from "@/lib/db";
import { getStripeServerClient, getPriceIdForPlan, getAppBaseUrl, type CheckoutPlan, type BillingInterval } from "@/lib/stripe/server";
import { persistStripeCustomerId } from "@/lib/billing/repository";
import { normalizePromoCode } from "@/lib/stripe/promo-codes";

function normalizePlan(raw: string | null | undefined): CheckoutPlan {
  const p = (raw ?? "").toLowerCase();
  if (p === "entry" || p === "base") return "starter";
  if (p === "starter" || p === "growth" || p === "pro" || p === "agency") return p as CheckoutPlan;
  return "starter";
}

function normalizeWebsite(raw: string | null | undefined): { url: string | null; normalized: string | null } {
  if (!raw?.trim()) return { url: null, normalized: null };
  let url = raw.trim();
  if (!url.startsWith("http")) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    return { url: parsed.href, normalized: parsed.hostname.replace(/^www\./, "") };
  } catch {
    return { url: null, normalized: null };
  }
}

export type DirectSignupResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; error: string };

export async function directSignupAction(
  _prev: DirectSignupResult | null,
  formData: FormData,
): Promise<DirectSignupResult> {
  try {
    const businessName = (formData.get("businessName") as string | null)?.trim();
    const email = (formData.get("email") as string | null)?.trim().toLowerCase();
    const rawPlan = formData.get("plan") as string | null;
    const rawInterval = formData.get("interval") as string | null;
    const rawPromo = formData.get("promoCode") as string | null;
    const rawWebsite = formData.get("website") as string | null;
    const city = (formData.get("city") as string | null)?.trim() || null;

    if (!businessName) return { ok: false, error: "Please enter your business name." };
    if (!email || !email.includes("@")) return { ok: false, error: "Please enter a valid email address." };

    const plan = normalizePlan(rawPlan);
    const interval: BillingInterval = rawInterval === "annual" ? "annual" : "monthly";
    const promoIntent = normalizePromoCode(rawPromo);
    const { url: website, normalized: websiteNormalized } = normalizeWebsite(rawWebsite);

    const db = getDb();
    if (!db) return { ok: false, error: "Service temporarily unavailable. Please try again." };

    // Check if a business with this email already exists — re-use it
    const whereClause = websiteNormalized
      ? or(eq(businesses.billingEmail, email), eq(businesses.websiteNormalized, websiteNormalized))
      : eq(businesses.billingEmail, email);

    const [existing] = await db
      .select({ id: businesses.id, stripeCustomerId: businesses.stripeCustomerId })
      .from(businesses)
      .where(whereClause)
      .limit(1)
      .catch(() => []);

    let businessId: string;
    let existingStripeCustomerId: string | null = null;

    if (existing) {
      businessId = existing.id;
      existingStripeCustomerId = existing.stripeCustomerId ?? null;
    } else {
      // Create a new business record — planTier starts as "free", upgraded by Stripe webhook
      businessId = randomUUID();
      await db.insert(businesses).values({
        id: businessId,
        name: businessName,
        billingEmail: email,
        website: website ?? null,
        websiteNormalized: websiteNormalized ?? null,
        address: city ?? null,
        planTier: "free",
      });
    }

    // Create or reuse Stripe customer
    const stripe = getStripeServerClient();
    if (!stripe) return { ok: false, error: "Payment system unavailable. Please try again." };

    let customerId = existingStripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        name: businessName,
        metadata: { businessId },
      });
      customerId = customer.id;
      await persistStripeCustomerId(businessId, customerId);
    }

    const baseUrl = getAppBaseUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: businessId,
      metadata: {
        businessId,
        requestedPlan: plan,
        billingInterval: interval,
        ...(promoIntent ? { promoIntent } : {}),
      },
      line_items: [{ price: getPriceIdForPlan(plan, interval), quantity: 1 }],
      subscription_data: {
        metadata: { businessId, billingInterval: interval },
      },
      customer_update: { address: "auto", name: "auto" },
      billing_address_collection: "auto",
      success_url: `${baseUrl}/workspace/${businessId}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/start?plan=${plan}`,
      ...(promoIntent
        ? { discounts: [{ coupon: promoIntent }] }
        : { allow_promotion_codes: true }),
    });

    if (!session.url) return { ok: false, error: "Could not create checkout. Please try again." };

    return { ok: true, checkoutUrl: session.url };
  } catch (err) {
    console.error("[direct-signup] error", { error: err instanceof Error ? err.message : String(err) });
    return {
      ok: false,
      error: err instanceof Error && err.message.includes("price")
        ? "That plan is not available yet. Please try another."
        : "Something went wrong. Please try again.",
    };
  }
}

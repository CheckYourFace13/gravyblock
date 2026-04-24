"use server";

import { getBusinessById, persistStripeCustomerId } from "@/lib/billing/repository";
import { getAppBaseUrl, getPriceIdForPlan, getStripeServerClient } from "@/lib/stripe/server";

function requiredField(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (!value) throw new Error(`Missing ${key}`);
  return String(value);
}

function normalizeCheckoutPlan(raw: string): "base" | "pro" {
  const p = raw.toLowerCase();
  if (p === "entry") return "base";
  if (p === "base" || p === "pro") return p;
  throw new Error("Invalid plan");
}

export async function createCheckoutSessionAction(formData: FormData) {
  try {
    const businessId = requiredField(formData, "businessId");
    const plan = normalizeCheckoutPlan(requiredField(formData, "plan"));

    const stripe = getStripeServerClient();
    if (!stripe) throw new Error("Stripe is not configured");
    const business = await getBusinessById(businessId);
    if (!business) throw new Error("Business not found");

    let customerId = business.stripeCustomerId ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: business.billingEmail ?? undefined,
        name: business.name,
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
      },
      line_items: [
        {
          price: getPriceIdForPlan(plan),
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: { businessId },
      },
      success_url: `${baseUrl}/workspace/${businessId}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/workspace/${businessId}/billing/cancel`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new Error("Stripe checkout did not return a redirect URL");
    }
    return { ok: true as const, checkoutUrl: session.url };
  } catch (error) {
    console.error("[billing] checkout session creation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not start checkout",
    };
  }
}

export async function createBillingPortalAction(formData: FormData) {
  try {
    const businessId = requiredField(formData, "businessId");
    const stripe = getStripeServerClient();
    if (!stripe) throw new Error("Stripe is not configured");
    const business = await getBusinessById(businessId);
    if (!business?.stripeCustomerId) {
      throw new Error("No Stripe customer found for this business");
    }

    const baseUrl = getAppBaseUrl();
    const portal = await stripe.billingPortal.sessions.create({
      customer: business.stripeCustomerId,
      return_url: `${baseUrl}/workspace/${businessId}`,
    });
    return { ok: true as const, portalUrl: portal.url };
  } catch (error) {
    console.error("[billing] portal session creation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not open billing portal",
    };
  }
}

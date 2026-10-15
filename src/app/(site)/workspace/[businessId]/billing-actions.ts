"use server";

import { getBusinessById, persistStripeCustomerId, persistPendingPlan } from "@/lib/billing/repository";
import { OFFER } from "@/lib/offer";
import { getAppBaseUrl, getPriceIdForPlan, getStripeServerClient, type CheckoutPlan, type BillingInterval } from "@/lib/stripe/server";
import { canAccessBusiness } from "@/lib/auth/customer-auth";
import { isAdminSession } from "@/lib/auth/admin-session";
import { normalizePromoCode, resolveCouponId } from "@/lib/stripe/promo-codes";

function requiredField(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (!value) throw new Error(`Missing ${key}`);
  return String(value);
}

function normalizeCheckoutPlan(raw: string): CheckoutPlan {
  const p = raw.toLowerCase();
  if (p === "entry" || p === "base") return "starter";
  if (p === "starter" || p === "growth" || p === "pro" || p === "agency") return p as CheckoutPlan;
  throw new Error("Invalid plan");
}

const normalizePromoCodeIntent = (raw: string) => normalizePromoCode(raw);

export async function createCheckoutSessionAction(formData: FormData) {
  try {
    const businessId = requiredField(formData, "businessId");
    // One public product at one price: plan, interval and promo inputs are ignored.
    void normalizeCheckoutPlan;
    const plan: CheckoutPlan = OFFER.tier;
    const interval: BillingInterval = "monthly";
    const promoIntent = normalizePromoCodeIntent("");
    const couponId = resolveCouponId(promoIntent);
    const authorized = (await isAdminSession()) || (await canAccessBusiness(businessId));
    if (!authorized) throw new Error("Unauthorized business access");

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

    // Record which plan checkout was started for — abandoned-checkout recovery
    // emails read this instead of assuming Starter.
    await persistPendingPlan(businessId, plan);

    const baseUrl = getAppBaseUrl();
    const priceId = getPriceIdForPlan(plan, interval);
    const live = await stripe.prices.retrieve(priceId);
    if (live.unit_amount !== OFFER.priceCents) {
      console.error("[billing] configured price does not match the public offer", { priceId, unitAmount: live.unit_amount });
      throw new Error("Checkout is being updated. Please try again in a few minutes.");
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: businessId,
      metadata: {
        businessId,
        requestedPlan: plan,
        ...(promoIntent ? { promoIntent } : {}),
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: { businessId, billingInterval: interval },
      },
      success_url: `${baseUrl}/workspace/${businessId}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/workspace/${businessId}/billing/cancel`,
      // Auto-apply the resolved coupon ID if present; otherwise let the user enter
      // a code manually. Never pass the raw advertised string as a coupon ID — most
      // do not match their Stripe coupon ID and would throw the whole checkout.
      ...(couponId
        ? { discounts: [{ coupon: couponId }] }
        : {}),
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
    const authorized = (await isAdminSession()) || (await canAccessBusiness(businessId));
    if (!authorized) throw new Error("Unauthorized business access");
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

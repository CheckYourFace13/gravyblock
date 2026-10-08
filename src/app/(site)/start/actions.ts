"use server";

import { randomUUID } from "node:crypto";
import { desc, eq, or } from "drizzle-orm";
import { getDb, businesses, leads } from "@/lib/db";
import { getReportWithContext } from "@/lib/report/repository";
import { verifyReportUnlockToken } from "@/lib/report/unlock-token";
import { getStripeServerClient, getPriceIdForPlan, getAppBaseUrl, type CheckoutPlan, type BillingInterval } from "@/lib/stripe/server";
import { persistStripeCustomerId, persistPendingPlan } from "@/lib/billing/repository";
import { normalizePromoCode, resolveCouponId } from "@/lib/stripe/promo-codes";
import { trackFunnelEvent } from "@/lib/events/track";
import { getAttributionToken } from "@/lib/events/attribution";
import { cookies } from "next/headers";

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

type CheckoutArgs = {
  businessId: string;
  email: string;
  businessName: string;
  plan: CheckoutPlan;
  interval: BillingInterval;
  promoIntent: ReturnType<typeof normalizePromoCode>;
  couponId: ReturnType<typeof resolveCouponId>;
  existingStripeCustomerId: string | null;
  reportPublicId?: string | null;
};

/** Creates (or reuses) the Stripe customer and a subscription Checkout session. Shared by every purchase path. */
async function buildCheckout(args: CheckoutArgs): Promise<DirectSignupResult> {
  const { businessId, email, businessName, plan, interval, promoIntent, couponId, existingStripeCustomerId, reportPublicId } = args;
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

  // Record which plan checkout was started for — abandoned-checkout recovery
  // emails read this instead of assuming Starter.
  await persistPendingPlan(businessId, plan);

  const visitorSessionId = (await cookies()).get("gb_visitor")?.value ?? null;
  const attributionToken = await getAttributionToken();
  await trackFunnelEvent({
    eventType: "checkout_started",
    businessId,
    sessionId: visitorSessionId,
    reportPublicId: reportPublicId ?? null,
      metadata: { plan, interval, ...(attributionToken ? { attributionToken } : {}) },
  });

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
      // Carried through to the completed-checkout webhook so "paid" can
      // be tied back to the original outreach send server-side, without
      // relying on a browser cookie the webhook has no access to.
      ...(attributionToken ? { attributionToken } : {}),
    },
    line_items: [{ price: getPriceIdForPlan(plan, interval), quantity: 1 }],
    subscription_data: {
      metadata: { businessId, billingInterval: interval },
    },
    customer_update: { address: "auto", name: "auto" },
    billing_address_collection: "auto",
    success_url: `${baseUrl}/api/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: reportPublicId ? `${baseUrl}/report/${reportPublicId}?plan=${plan}` : `${baseUrl}/start?plan=${plan}`,
    // Resolve the advertised code to its real Stripe coupon ID. Falling back to
    // allow_promotion_codes (rather than passing an unknown coupon that throws)
    // means an unmapped code degrades to a manual-entry field instead of a dead checkout.
    ...(couponId
      ? { discounts: [{ coupon: couponId }] }
      : { allow_promotion_codes: true }),
  });

  if (!session.url) return { ok: false, error: "Could not create checkout. Please try again." };

  return { ok: true, checkoutUrl: session.url };

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
    const reportPublicId = (formData.get("reportPublicId") as string | null)?.trim() || null;

    if (!businessName) return { ok: false, error: "Please enter your business name." };
    if (!email || !email.includes("@")) return { ok: false, error: "Please enter a valid email address." };

    const plan = normalizePlan(rawPlan);
    const interval: BillingInterval = rawInterval === "annual" ? "annual" : "monthly";
    const promoIntent = normalizePromoCode(rawPromo);
    const couponId = resolveCouponId(promoIntent);
    const { url: website, normalized: websiteNormalized } = normalizeWebsite(rawWebsite);

    const db = getDb();
    if (!db) return { ok: false, error: "Service temporarily unavailable. Please try again." };

    // One account per email: match an existing business by account OR billing
    // email (or same website). Reuse it rather than creating a duplicate.
    const whereClause = websiteNormalized
      ? or(eq(businesses.accountEmail, email), eq(businesses.billingEmail, email), eq(businesses.websiteNormalized, websiteNormalized))
      : or(eq(businesses.accountEmail, email), eq(businesses.billingEmail, email));

    const [existing] = await db
      .select({ id: businesses.id, stripeCustomerId: businesses.stripeCustomerId })
      .from(businesses)
      .where(whereClause)
      .limit(1)
      .catch(() => []);

    // A visitor who arrives from their own report is buying for the business that was scanned.
    let reportBusinessId: string | null = null;
    if (reportPublicId) {
      const rec = await getReportWithContext(reportPublicId).catch(() => null);
      reportBusinessId = rec?.businessId ?? null;
    }
    const [reportBiz] = reportBusinessId
      ? await db
          .select({ id: businesses.id, stripeCustomerId: businesses.stripeCustomerId, billingEmail: businesses.billingEmail })
          .from(businesses)
          .where(eq(businesses.id, reportBusinessId))
          .limit(1)
          .catch(() => [])
      : [];

    let businessId: string;
    let existingStripeCustomerId: string | null = null;

    if (reportBiz) {
      businessId = reportBiz.id;
      existingStripeCustomerId = reportBiz.stripeCustomerId ?? null;
      if (!reportBiz.billingEmail) {
        await db.update(businesses).set({ billingEmail: email, accountEmail: email }).where(eq(businesses.id, businessId)).catch(() => {});
      }
    } else if (existing) {
      businessId = existing.id;
      existingStripeCustomerId = existing.stripeCustomerId ?? null;
    } else {
      // Create a new business record — planTier starts as "free", upgraded by Stripe webhook
      businessId = randomUUID();
      await db.insert(businesses).values({
        id: businessId,
        name: businessName,
        billingEmail: email,
        accountEmail: email,
        website: website ?? null,
        websiteNormalized: websiteNormalized ?? null,
        address: city ?? null,
        planTier: "free",
      });
      // Confirm the email is real (non-blocking — doesn't hold up checkout).
      const { sendVerificationEmail } = await import("@/lib/email/send-verification");
      void sendVerificationEmail(businessId, email, businessName).catch(() => {});
    }

    return await buildCheckout({ businessId, email, businessName, plan, interval, promoIntent, couponId, existingStripeCustomerId, reportPublicId });
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

export type StartFromReportResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; error: string; fallbackToStart?: boolean };

/**
 * One-click purchase from a completed report. The unlock token proves the visitor already
 * gave us their email for this report, so the business and email are taken from the scan,
 * Scale and GROWTH50 are applied, and the visitor goes straight to Stripe.
 */
export async function startScaleFromReportAction(input: { publicId: string; unlockToken: string }): Promise<StartFromReportResult> {
  const fallback: StartFromReportResult = { ok: false, error: "Please confirm your email to continue.", fallbackToStart: true };
  try {
    if (!verifyReportUnlockToken(input.publicId, input.unlockToken)) return fallback;
    const report = await getReportWithContext(input.publicId);
    const db = getDb();
    if (!report?.businessId || !db) return fallback;

    const [biz] = await db
      .select({
        id: businesses.id,
        name: businesses.name,
        planTier: businesses.planTier,
        billingEmail: businesses.billingEmail,
        accountEmail: businesses.accountEmail,
        stripeCustomerId: businesses.stripeCustomerId,
      })
      .from(businesses)
      .where(eq(businesses.id, report.businessId))
      .limit(1);
    if (!biz) return fallback;
    if (biz.planTier && biz.planTier !== "free") {
      return { ok: false, error: "This business already has a GravyBlock plan. Log in to manage it." };
    }

    const [lead] = await db
      .select({ email: leads.email })
      .from(leads)
      .where(eq(leads.reportPublicId, input.publicId))
      .orderBy(desc(leads.createdAt))
      .limit(1);
    const email = (lead?.email ?? biz.accountEmail ?? biz.billingEmail ?? "").trim().toLowerCase();
    if (!email.includes("@")) return fallback;
    if (!biz.billingEmail) {
      await db.update(businesses).set({ billingEmail: email, accountEmail: biz.accountEmail ?? email }).where(eq(businesses.id, biz.id)).catch(() => {});
    }

    const promoIntent = normalizePromoCode("GROWTH50");
    return await buildCheckout({
      businessId: biz.id,
      email,
      businessName: biz.name,
      plan: "growth",
      interval: "monthly",
      promoIntent,
      couponId: resolveCouponId(promoIntent),
      existingStripeCustomerId: biz.stripeCustomerId ?? null,
      reportPublicId: input.publicId,
    });
  } catch (err) {
    console.error("[start-from-report] error", { error: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: "Something went wrong. Please try again.", fallbackToStart: true };
  }
}

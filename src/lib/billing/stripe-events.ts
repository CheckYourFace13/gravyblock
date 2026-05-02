import type Stripe from "stripe";
import {
  applyInvoiceState,
  applyStripeSubscriptionToBusiness,
  applySubscriptionDeleted,
  getBusinessById,
  getBusinessByStripeCustomerId,
  getBusinessByStripeSubscriptionId,
  stripeSubscriptionSnapshot,
} from "@/lib/billing/repository";
import { schedulePlanRecurringSnapshotJob, scheduleRecurringSnapshotJob } from "@/lib/autopilot/executor";
import { getPlanFromPriceId } from "@/lib/stripe/server";
import { getStripeServerClient } from "@/lib/stripe/server";
import { sendSetupEmail } from "@/lib/setup/send-setup-email";
import { autoConfigBusiness } from "@/lib/setup/auto-config";
import { applyDunningDowngrade, sendDowngradeNoticeEmail, sendPaymentFailedEmail } from "@/lib/billing/dunning";
import { normalizePlanTierFromDb, planFeatures } from "@/lib/plans";
import { getDb, businesses } from "@/lib/db";
import { eq } from "drizzle-orm";

function customerIdFromUnknown(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return "id" in customer ? customer.id : null;
}

function customerEmailFromUnknown(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!customer || typeof customer === "string") return null;
  if ("deleted" in customer && customer.deleted) return null;
  return customer.email ?? null;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const value = invoice as unknown as {
    parent?: { subscription_details?: { subscription?: string | null } };
    subscription_details?: { subscription?: string | null };
  };
  return value.parent?.subscription_details?.subscription ?? value.subscription_details?.subscription ?? null;
}

export async function syncCheckoutSession(sessionId: string) {
  const stripe = getStripeServerClient();
  if (!stripe) throw new Error("Stripe is not configured");

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription", "customer"],
  });
  return handleCheckoutSessionCompleted(session);
}

export async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const stripe = getStripeServerClient();
  if (!stripe) throw new Error("Stripe is not configured");
  if (session.mode !== "subscription") return;

  const businessId = session.metadata?.businessId || session.client_reference_id || null;
  if (!businessId) {
    console.error("[stripe] checkout.session.completed missing businessId metadata", {
      sessionId: session.id,
    });
    return;
  }

  const subscriptionValue = session.subscription;
  if (!subscriptionValue) return;
  const subscription =
    typeof subscriptionValue === "string"
      ? await stripe.subscriptions.retrieve(subscriptionValue)
      : subscriptionValue;

  const snap = stripeSubscriptionSnapshot(subscription);
  const billingEmail = session.customer_details?.email ?? customerEmailFromUnknown(session.customer) ?? null;

  await applyStripeSubscriptionToBusiness({
    businessId,
    stripeCustomerId: snap.stripeCustomerId,
    stripeSubscriptionId: snap.stripeSubscriptionId,
    status: snap.status,
    currentPeriodEndUnix: snap.currentPeriodEndUnix,
    priceId: snap.priceId,
    billingEmail,
  });

  // Send setup email so owner can configure autopilot context
  if (billingEmail) {
    const db = getDb();
    if (db) {
      const [biz] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
      void sendSetupEmail(businessId, biz?.name ?? "your business", billingEmail);
    }
  }

  // Kick off AI business profile generation immediately (don't block checkout response)
  void autoConfigBusiness(businessId).catch((err) =>
    console.error("[stripe] autoConfigBusiness failed on checkout", { businessId, error: String(err) }),
  );

  const planTier = getPlanFromPriceId(snap.priceId);
  if (planTier && planTier !== "free") {
    const jobType = planTier === "pro" || planTier === "agency" ? "pro_recurring_refresh" : "entry_monthly_refresh";
    await scheduleRecurringSnapshotJob({
      businessId,
      runAfterMs: 0,
      type: jobType,
    });
    await schedulePlanRecurringSnapshotJob({
      businessId,
      planTier,
    });
  }
}

export async function handleSubscriptionUpsert(subscription: Stripe.Subscription) {
  const snap = stripeSubscriptionSnapshot(subscription);
  const businessFromSubscription = await getBusinessByStripeSubscriptionId(snap.stripeSubscriptionId);
  const businessFromCustomer = businessFromSubscription ?? (await getBusinessByStripeCustomerId(snap.stripeCustomerId));
  const businessFromMetadata =
    !businessFromCustomer && subscription.metadata?.businessId
      ? await getBusinessById(subscription.metadata.businessId)
      : null;
  const targetBusiness = businessFromCustomer ?? businessFromMetadata;

  if (!targetBusiness) {
    console.error("[stripe] subscription event not linked to business", {
      subscriptionId: subscription.id,
      customerId: snap.stripeCustomerId,
    });
    return;
  }

  await applyStripeSubscriptionToBusiness({
    businessId: targetBusiness.id,
    stripeCustomerId: snap.stripeCustomerId,
    stripeSubscriptionId: snap.stripeSubscriptionId,
    status: snap.status,
    currentPeriodEndUnix: snap.currentPeriodEndUnix,
    priceId: snap.priceId,
    billingEmail: targetBusiness.billingEmail ?? null,
  });
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = customerIdFromUnknown(subscription.customer);
  if (!customerId) return;
  const business =
    (await getBusinessByStripeSubscriptionId(subscription.id)) ||
    (await getBusinessByStripeCustomerId(customerId)) ||
    (subscription.metadata?.businessId ? await getBusinessById(subscription.metadata.businessId) : null);
  if (!business) {
    console.error("[stripe] customer.subscription.deleted not linked to business", {
      subscriptionId: subscription.id,
      customerId,
    });
    return;
  }
  await applySubscriptionDeleted({
    businessId: business.id,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    billingEmail: business.billingEmail ?? null,
  });
}

export async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = customerIdFromUnknown(invoice.customer);
  if (!customerId) return;
  await applyInvoiceState({
    stripeCustomerId: customerId,
    stripeSubscriptionId: invoiceSubscriptionId(invoice),
    status: "active",
    billingEmail: invoice.customer_email ?? null,
  });
}

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = customerIdFromUnknown(invoice.customer);
  if (!customerId) return;

  // Look up business to check if this is a first or repeat failure
  const subId = invoiceSubscriptionId(invoice);
  const business = subId
    ? ((await getBusinessByStripeSubscriptionId(subId)) ?? (await getBusinessByStripeCustomerId(customerId)))
    : await getBusinessByStripeCustomerId(customerId);

  const billingEmail = invoice.customer_email ?? business?.billingEmail ?? null;

  if (business && billingEmail) {
    const tier = normalizePlanTierFromDb(business.planTier);
    const features = planFeatures(tier);
    const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "https://gravyblock.com";
    const workspaceUrl = `${appBase}/workspace/${business.id}`;

    const isRepeatFailure = business.subscriptionStatus === "past_due";

    if (isRepeatFailure) {
      // Second+ failure: downgrade to free and notify
      try {
        await sendDowngradeNoticeEmail({
          email: billingEmail,
          businessName: business.name,
          planLabel: features.label,
          reactivateUrl: workspaceUrl,
        });
      } catch (err) {
        console.error("[dunning] downgrade notice email failed", { businessId: business.id, err });
      }
      await applyDunningDowngrade(business.id, "repeated_payment_failure");
      console.info("[dunning] downgraded after repeat payment failure", { businessId: business.id });
      return; // applyDunningDowngrade handles the DB status, skip applyInvoiceState
    } else {
      // First failure: warn and set past_due
      const retryTs = (invoice as unknown as { next_payment_attempt?: number | null }).next_payment_attempt;
      const retryDate = retryTs
        ? new Date(retryTs * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : "the next billing date";
      const amountDue = ((invoice as unknown as { amount_due?: number }).amount_due ?? 0) / 100;

      try {
        await sendPaymentFailedEmail({
          email: billingEmail,
          businessName: business.name,
          planLabel: features.label,
          amount: amountDue,
          retryDate,
          updateBillingUrl: workspaceUrl,
        });
      } catch (err) {
        console.error("[dunning] payment failed email failed", { businessId: business.id, err });
      }
    }
  }

  await applyInvoiceState({
    stripeCustomerId: customerId,
    stripeSubscriptionId: subId,
    status: "past_due",
    billingEmail,
  });
}

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
import { getStripeServerClient } from "@/lib/stripe/server";

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
  await applyInvoiceState({
    stripeCustomerId: customerId,
    stripeSubscriptionId: invoiceSubscriptionId(invoice),
    status: "past_due",
    billingEmail: invoice.customer_email ?? null,
  });
}

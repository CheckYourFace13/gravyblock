import { eq } from "drizzle-orm";
import { businesses, getDb } from "@/lib/db";
import { getPlanFromPriceId } from "@/lib/stripe/server";

function firstSubscriptionPriceId(subscription: {
  items?: { data?: Array<{ price?: { id?: string | null } | null }> };
}): string | null {
  return subscription.items?.data?.[0]?.price?.id ?? null;
}

function periodEndFromUnix(periodEnd: number | null | undefined): Date | null {
  if (!periodEnd) return null;
  return new Date(periodEnd * 1000);
}

export async function getBusinessById(businessId: string) {
  const db = getDb();
  if (!db) return null;
  const [row] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  return row ?? null;
}

export async function getBusinessByStripeCustomerId(stripeCustomerId: string) {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return row ?? null;
}

export async function getBusinessByStripeSubscriptionId(stripeSubscriptionId: string) {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);
  return row ?? null;
}

export async function applyStripeSubscriptionToBusiness(input: {
  businessId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string | null;
  billingEmail: string | null;
  currentPeriodEndUnix?: number | null;
  priceId: string | null;
}) {
  const db = getDb();
  if (!db) return;
  const plan = getPlanFromPriceId(input.priceId);
  await db
    .update(businesses)
    .set({
      updatedAt: new Date(),
      planTier: plan ?? "free",
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      subscriptionStatus: input.status,
      billingEmail: input.billingEmail,
      currentPeriodEnd: periodEndFromUnix(input.currentPeriodEndUnix),
    })
    .where(eq(businesses.id, input.businessId));
}

export async function applySubscriptionDeleted(input: {
  businessId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  billingEmail: string | null;
}) {
  const db = getDb();
  if (!db) return;
  await db
    .update(businesses)
    .set({
      updatedAt: new Date(),
      planTier: "free",
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      subscriptionStatus: "canceled",
      billingEmail: input.billingEmail,
      currentPeriodEnd: null,
    })
    .where(eq(businesses.id, input.businessId));
}

export async function applyInvoiceState(input: {
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  status: "active" | "past_due";
  billingEmail: string | null;
}) {
  const db = getDb();
  if (!db) return;
  const target =
    (input.stripeSubscriptionId && (await getBusinessByStripeSubscriptionId(input.stripeSubscriptionId))) ||
    (await getBusinessByStripeCustomerId(input.stripeCustomerId));
  if (!target) return;
  await db
    .update(businesses)
    .set({
      updatedAt: new Date(),
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId ?? target.stripeSubscriptionId ?? null,
      subscriptionStatus: input.status,
      billingEmail: input.billingEmail,
    })
    .where(eq(businesses.id, target.id));
}

export function stripeSubscriptionSnapshot(subscription: {
  id: string;
  customer: string | { id: string };
  status: string;
  current_period_end?: number | null;
  items?: { data?: Array<{ price?: { id?: string | null } | null }> };
  customer_email?: string | null;
}) {
  return {
    stripeSubscriptionId: subscription.id,
    stripeCustomerId:
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    status: subscription.status ?? null,
    currentPeriodEndUnix: subscription.current_period_end ?? null,
    priceId: firstSubscriptionPriceId(subscription),
  };
}

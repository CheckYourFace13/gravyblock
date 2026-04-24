import { eq } from "drizzle-orm";
import { businesses, getDb } from "@/lib/db";
import { memoryStore } from "@/lib/db/memory-store";
import { getPlanFromPriceId } from "@/lib/stripe/server";

type BusinessRow = typeof businesses.$inferSelect;

function firstSubscriptionPriceId(subscription: {
  items?: { data?: Array<{ price?: { id?: string | null } | null }> };
}): string | null {
  return subscription.items?.data?.[0]?.price?.id ?? null;
}

function periodEndFromUnix(periodEnd: number | null | undefined): Date | null {
  if (!periodEnd) return null;
  return new Date(periodEnd * 1000);
}

function memoryBusinessToRow(businessId: string): BusinessRow | null {
  const mem = memoryStore.getBusiness(businessId);
  if (!mem) return null;
  return {
    id: mem.id,
    organizationId: null,
    brandId: null,
    locationId: null,
    createdAt: new Date(mem.createdAt),
    updatedAt: new Date(mem.updatedAt),
    name: mem.name,
    vertical: mem.vertical,
    businessModel: "single_location",
    ownershipModel: "independent",
    placeId: mem.placeId,
    primaryCategory: mem.primaryCategory,
    address: mem.address,
    website: mem.website,
    websiteNormalized: mem.websiteNormalized,
    phone: mem.phone,
    googleMapsUri: mem.googleMapsUri,
    rating: mem.rating,
    reviewCount: mem.reviewCount,
    latitude: mem.latitude,
    longitude: mem.longitude,
    businessStatus: mem.businessStatus,
    brandNotes: mem.brandNotes,
    planTier: mem.planTier,
    stripeCustomerId: mem.stripeCustomerId,
    stripeSubscriptionId: mem.stripeSubscriptionId,
    subscriptionStatus: mem.subscriptionStatus,
    billingEmail: mem.billingEmail,
    currentPeriodEnd: mem.currentPeriodEnd ? new Date(mem.currentPeriodEnd) : null,
  };
}

export async function getBusinessById(businessId: string): Promise<BusinessRow | null> {
  const db = getDb();
  if (db) {
    const [row] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
    return row ?? null;
  }
  return memoryBusinessToRow(businessId);
}

export async function getBusinessByStripeCustomerId(stripeCustomerId: string): Promise<BusinessRow | null> {
  const db = getDb();
  if (!db) {
    for (const b of memoryStore.listBusinesses()) {
      if (b.stripeCustomerId === stripeCustomerId) return memoryBusinessToRow(b.id);
    }
    return null;
  }
  const [row] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return row ?? null;
}

export async function getBusinessByStripeSubscriptionId(stripeSubscriptionId: string): Promise<BusinessRow | null> {
  const db = getDb();
  if (!db) {
    for (const b of memoryStore.listBusinesses()) {
      if (b.stripeSubscriptionId === stripeSubscriptionId) return memoryBusinessToRow(b.id);
    }
    return null;
  }
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
  const plan = getPlanFromPriceId(input.priceId);
  const db = getDb();
  if (!db) {
    memoryStore.updateBusinessBilling({
      businessId: input.businessId,
      planTier: plan ?? "free",
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      subscriptionStatus: input.status,
      billingEmail: input.billingEmail,
      currentPeriodEnd: periodEndFromUnix(input.currentPeriodEndUnix)?.toISOString() ?? null,
    });
    return;
  }
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
  if (!db) {
    memoryStore.updateBusinessBilling({
      businessId: input.businessId,
      planTier: "free",
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      subscriptionStatus: "canceled",
      billingEmail: input.billingEmail,
      currentPeriodEnd: null,
    });
    return;
  }
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
  if (!db) {
    const target =
      (input.stripeSubscriptionId &&
        memoryStore.listBusinesses().find((b) => b.stripeSubscriptionId === input.stripeSubscriptionId)) ||
      memoryStore.listBusinesses().find((b) => b.stripeCustomerId === input.stripeCustomerId);
    if (!target) return;
    memoryStore.updateBusinessBilling({
      businessId: target.id,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId ?? target.stripeSubscriptionId,
      subscriptionStatus: input.status,
      billingEmail: input.billingEmail,
    });
    return;
  }
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

export async function persistStripeCustomerId(businessId: string, stripeCustomerId: string) {
  const db = getDb();
  if (!db) {
    memoryStore.updateBusinessBilling({ businessId, stripeCustomerId });
    return;
  }
  await db
    .update(businesses)
    .set({ updatedAt: new Date(), stripeCustomerId })
    .where(eq(businesses.id, businessId));
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

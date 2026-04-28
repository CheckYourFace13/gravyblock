"use server";

import { eq, and } from "drizzle-orm";
import { getDb, businesses, locations, organizations } from "@/lib/db";
import { normalizePlanTierFromDb, planFeatures } from "@/lib/plans";
import { requireBusinessAccess } from "@/lib/auth/customer-guards";
import { getStripeServerClient, getAddonLocationPriceId } from "@/lib/stripe/server";

// Max add-on locations beyond the 1 included in Pro
const MAX_ADDON_LOCATIONS = 2;

export type LocationRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  stateRegion: string | null;
  placeId: string | null;
  website: string | null;
  isAddon: boolean;
};

export async function getLocationsForBusiness(businessId: string): Promise<LocationRow[]> {
  await requireBusinessAccess(businessId);
  const db = getDb();
  if (!db) return [];

  const [biz] = await db
    .select({ organizationId: businesses.organizationId })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz?.organizationId) return [];

  const rows = await db
    .select({
      id: locations.id,
      name: locations.name,
      address: locations.address,
      city: locations.city,
      stateRegion: locations.stateRegion,
      placeId: locations.placeId,
      website: locations.website,
      stripeSubscriptionItemId: locations.stripeSubscriptionItemId,
    })
    .from(locations)
    .where(eq(locations.organizationId, biz.organizationId))
    .orderBy(locations.createdAt);

  return rows.map((r, i) => ({ ...r, isAddon: i > 0 }));
}

export async function addLocation(
  businessId: string,
  input: {
    name: string;
    address?: string;
    city?: string;
    stateRegion?: string;
    placeId?: string;
    website?: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  await requireBusinessAccess(businessId);
  const db = getDb();
  if (!db) return { ok: false, error: "Database not available" };

  const [biz] = await db
    .select({
      organizationId: businesses.organizationId,
      planTier: businesses.planTier,
      stripeSubscriptionId: businesses.stripeSubscriptionId,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) return { ok: false, error: "Business not found" };

  const tier = normalizePlanTierFromDb(biz.planTier);
  const features = planFeatures(tier);

  if (!features.multiLocationReady) {
    return { ok: false, error: "Multi-location requires Pro or higher." };
  }

  // Ensure the business has an organization
  let orgId = biz.organizationId;
  if (!orgId) {
    const [newOrg] = await db
      .insert(organizations)
      .values({ name: input.name, accountType: "multi_location", planTier: tier })
      .returning({ id: organizations.id });
    orgId = newOrg?.id ?? null;
    if (!orgId) return { ok: false, error: "Failed to create organization" };
    await db.update(businesses).set({ organizationId: orgId }).where(eq(businesses.id, businessId));
  }

  const existing = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.organizationId, orgId));

  // First location is included in Pro — no charge
  const isAddon = existing.length >= 1;

  if (isAddon) {
    // Enforce add-on cap (2 extra locations max on Pro)
    if (existing.length > MAX_ADDON_LOCATIONS) {
      return { ok: false, error: `You can add up to ${MAX_ADDON_LOCATIONS} additional locations on Pro. Contact us to discuss Agency.` };
    }

    // Require an active Stripe subscription to bill the add-on
    if (!biz.stripeSubscriptionId) {
      return { ok: false, error: "An active Pro subscription is required to add extra locations." };
    }

    const addonPriceId = getAddonLocationPriceId();
    if (!addonPriceId) {
      return { ok: false, error: "Location add-on pricing is not configured. Contact support." };
    }

    const stripe = getStripeServerClient();
    if (!stripe) {
      return { ok: false, error: "Billing is not available right now. Try again shortly." };
    }

    // Add a subscription item — Stripe bills it immediately prorated
    let siId: string;
    try {
      const si = await stripe.subscriptionItems.create({
        subscription: biz.stripeSubscriptionId,
        price: addonPriceId,
        quantity: 1,
      });
      siId = si.id;
    } catch (err) {
      console.error("[addLocation] Stripe subscription item creation failed", err);
      return { ok: false, error: "Could not add billing for this location. Check your payment method." };
    }

    await db.insert(locations).values({
      organizationId: orgId,
      name: input.name,
      address: input.address ?? null,
      city: input.city ?? null,
      stateRegion: input.stateRegion ?? null,
      placeId: input.placeId ?? null,
      website: input.website ?? null,
      stripeSubscriptionItemId: siId,
    });
  } else {
    // First location — free, no Stripe charge
    await db.insert(locations).values({
      organizationId: orgId,
      name: input.name,
      address: input.address ?? null,
      city: input.city ?? null,
      stateRegion: input.stateRegion ?? null,
      placeId: input.placeId ?? null,
      website: input.website ?? null,
    });
  }

  return { ok: true };
}

export async function removeLocation(
  businessId: string,
  locationId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireBusinessAccess(businessId);
  const db = getDb();
  if (!db) return { ok: false, error: "Database not available" };

  const [biz] = await db
    .select({ organizationId: businesses.organizationId })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz?.organizationId) return { ok: false, error: "Business not found" };

  const [loc] = await db
    .select({ id: locations.id, stripeSubscriptionItemId: locations.stripeSubscriptionItemId })
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.organizationId, biz.organizationId)))
    .limit(1);

  if (!loc) return { ok: false, error: "Location not found." };

  // Cancel the Stripe add-on if one exists
  if (loc.stripeSubscriptionItemId) {
    const stripe = getStripeServerClient();
    if (stripe) {
      try {
        await stripe.subscriptionItems.del(loc.stripeSubscriptionItemId, {
          proration_behavior: "create_prorations",
        });
      } catch (err) {
        console.error("[removeLocation] Stripe subscription item deletion failed", err);
        // Don't block the removal — log and continue
      }
    }
  }

  await db
    .delete(locations)
    .where(and(eq(locations.id, locationId), eq(locations.organizationId, biz.organizationId)));

  return { ok: true };
}

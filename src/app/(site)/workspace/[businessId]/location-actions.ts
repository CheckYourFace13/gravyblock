"use server";

import { eq, and } from "drizzle-orm";
import { getDb, businesses, locations, organizations } from "@/lib/db";
import { normalizePlanTierFromDb, planFeatures } from "@/lib/plans";
import { requireBusinessAccess } from "@/lib/auth/customer-guards";

export type LocationRow = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  stateRegion: string | null;
  placeId: string | null;
  website: string | null;
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

  return db
    .select({
      id: locations.id,
      name: locations.name,
      address: locations.address,
      city: locations.city,
      stateRegion: locations.stateRegion,
      placeId: locations.placeId,
      website: locations.website,
    })
    .from(locations)
    .where(eq(locations.organizationId, biz.organizationId))
    .orderBy(locations.createdAt);
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
    .select({ organizationId: businesses.organizationId, planTier: businesses.planTier })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) return { ok: false, error: "Business not found" };

  const tier = normalizePlanTierFromDb(biz.planTier);
  const features = planFeatures(tier);
  const maxLocations = features.clientSeats; // Pro=3, Agency=10

  if (!features.multiLocationReady) {
    return { ok: false, error: "Multi-location is not available on your current plan. Upgrade to Pro or higher." };
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

  // Check current count
  const existing = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.organizationId, orgId));

  if (existing.length >= maxLocations) {
    return { ok: false, error: `Your ${features.label} plan supports up to ${maxLocations} location${maxLocations === 1 ? "" : "s"}. Upgrade to add more.` };
  }

  await db.insert(locations).values({
    organizationId: orgId,
    name: input.name,
    address: input.address ?? null,
    city: input.city ?? null,
    stateRegion: input.stateRegion ?? null,
    placeId: input.placeId ?? null,
    website: input.website ?? null,
  });

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

  // Only delete if the location belongs to this org
  await db
    .delete(locations)
    .where(and(eq(locations.id, locationId), eq(locations.organizationId, biz.organizationId)));

  return { ok: true };
}

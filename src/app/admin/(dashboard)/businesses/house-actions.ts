"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { businesses, getDb } from "@/lib/db";
import { isAdminSession } from "@/lib/auth/admin-session";
import { runHouseAccountCycle } from "@/lib/house";

const MODES = ["local", "regional", "national", "online"] as const;

function hostOf(raw: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!u.hostname.includes(".")) return null;
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The single enrollment path for a new owner-run site: create it once as a house account (or convert
 * the existing record for the same domain, never a duplicate). From then on the house scheduler gives
 * it Business Truth refreshes, discovery, orchestration and measurement with no further steps.
 */
export async function enrollHouseSite(formData: FormData): Promise<void> {
  if (!(await isAdminSession())) throw new Error("Not authorized.");
  const db = getDb();
  if (!db) throw new Error("Database unavailable.");
  const name = String(formData.get("name") ?? "").trim();
  const host = hostOf(String(formData.get("website") ?? "").trim());
  const focus = String(formData.get("focusArea") ?? "online");
  if (!name || !host) throw new Error("A name and a valid domain are required.");
  const focusArea = (MODES as readonly string[]).includes(focus) ? focus : "online";

  const all = await db.select({ id: businesses.id, website: businesses.website, accountType: businesses.accountType }).from(businesses);
  const existing = all.find((b) => b.website && hostOf(b.website) === host);
  if (existing) {
    await db.update(businesses).set({ accountType: "house", planTier: "pro" }).where(eq(businesses.id, existing.id));
  } else {
    await db.insert(businesses).values({ name, website: `https://${host}`, websiteNormalized: host, businessModel: "online", focusArea, planTier: "pro", accountType: "house" });
  }
  revalidatePath("/admin/businesses");
}

/** Runs one full house-account cycle now (refresh, discovery, orchestrator). Same code the scheduler runs. */
export async function runHouseCycleNow(businessId: string): Promise<void> {
  if (!(await isAdminSession())) throw new Error("Not authorized.");
  await runHouseAccountCycle(businessId, { force: true });
  revalidatePath("/admin/businesses");
}

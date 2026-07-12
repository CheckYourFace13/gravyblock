"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, businesses } from "@/lib/db";
import { isAdminSession } from "@/lib/auth/admin-session";
import { PLAN_TIERS, type PlanTier } from "@/lib/plans";

/**
 * Marks a business as an owner-run "house" account: full features via
 * planTier directly (no Stripe subscription needed), and excluded from
 * MRR/revenue reporting and automated customer emails (see mrr/page.tsx and
 * the email batch jobs, which all filter on accountType).
 */
export async function setHouseAccount(businessId: string, formData: FormData): Promise<void> {
  if (!(await isAdminSession())) throw new Error("Not authorized.");

  const planTier = String(formData.get("planTier") ?? "");
  if (!(PLAN_TIERS as readonly string[]).includes(planTier)) {
    throw new Error("Invalid plan tier.");
  }

  const db = getDb();
  if (!db) throw new Error("Database unavailable.");

  await db
    .update(businesses)
    .set({ accountType: "house", planTier: planTier as PlanTier })
    .where(eq(businesses.id, businessId));

  revalidatePath(`/admin/businesses/${businessId}`);
  revalidatePath("/admin/businesses");
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
}

/** Reverts a business back to a normal, billed customer account. */
export async function revertToCustomerAccount(businessId: string, _formData: FormData): Promise<void> {
  if (!(await isAdminSession())) throw new Error("Not authorized.");

  const db = getDb();
  if (!db) throw new Error("Database unavailable.");

  await db.update(businesses).set({ accountType: "customer" }).where(eq(businesses.id, businessId));

  revalidatePath(`/admin/businesses/${businessId}`);
  revalidatePath("/admin/businesses");
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
}

/** Toggles whether this business appears on the public /proof showcase page. */
export async function toggleShowcase(businessId: string, _formData: FormData): Promise<void> {
  if (!(await isAdminSession())) throw new Error("Not authorized.");

  const db = getDb();
  if (!db) throw new Error("Database unavailable.");

  const [biz] = await db
    .select({ showcaseOptIn: businesses.showcaseOptIn, name: businesses.name })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  if (!biz) throw new Error("Business not found.");

  // Owner directive: the parent company never appears on the public page,
  // even if the toggle is clicked by accident.
  if (biz.name.toLowerCase().includes("iscream")) {
    throw new Error("This business is excluded from the public showcase.");
  }

  await db
    .update(businesses)
    .set({ showcaseOptIn: biz.showcaseOptIn === "true" ? "false" : "true" })
    .where(eq(businesses.id, businessId));

  revalidatePath(`/admin/businesses/${businessId}`);
  revalidatePath("/proof");
}

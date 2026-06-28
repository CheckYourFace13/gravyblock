"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, businesses } from "@/lib/db";
import { canAccessBusiness } from "@/lib/auth/customer-auth";
import { isAdminSession } from "@/lib/auth/admin-session";
import { sendVerificationEmail } from "@/lib/email/send-verification";

export type AccountEmailResult = { ok: boolean; message?: string };

export async function updateAccountEmail(
  _prev: AccountEmailResult | null,
  formData: FormData,
): Promise<AccountEmailResult> {
  const businessId = String(formData.get("businessId") ?? "");
  const email = String(formData.get("accountEmail") ?? "").trim().toLowerCase();

  if (!businessId) return { ok: false, message: "Missing business." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Please enter a valid email address." };

  const authorized = (await isAdminSession()) || (await canAccessBusiness(businessId));
  if (!authorized) return { ok: false, message: "Not authorized." };

  const db = getDb();
  if (!db) return { ok: false, message: "Service unavailable." };

  try {
    const [biz] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
    await db
      .update(businesses)
      .set({ accountEmail: email, emailVerified: "false" })
      .where(eq(businesses.id, businessId));

    void sendVerificationEmail(businessId, email, biz?.name ?? "your business").catch(() => {});
    revalidatePath(`/workspace/${businessId}`);
    return { ok: true, message: "Account email updated. We sent a confirmation link to verify it." };
  } catch {
    return { ok: false, message: "Could not update. Please try again." };
  }
}

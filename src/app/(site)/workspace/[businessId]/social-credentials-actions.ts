"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, businessConfigs } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth/customer-guards";

export type SocialCredentials = {
  facebookPageId: string;
  facebookAccessToken: string;
  instagramAccountId: string;
};

export async function getSocialCredentials(businessId: string): Promise<SocialCredentials | null> {
  await requireBusinessAccess(businessId);
  const db = getDb();
  if (!db) return null;

  const [cfg] = await db
    .select({
      facebookPageId: businessConfigs.facebookPageId,
      facebookAccessToken: businessConfigs.facebookAccessToken,
      instagramAccountId: businessConfigs.instagramAccountId,
    })
    .from(businessConfigs)
    .where(eq(businessConfigs.businessId, businessId))
    .limit(1);

  if (!cfg) return null;
  return {
    facebookPageId: cfg.facebookPageId ?? "",
    facebookAccessToken: cfg.facebookAccessToken ?? "",
    instagramAccountId: cfg.instagramAccountId ?? "",
  };
}

export async function saveSocialCredentials(
  businessId: string,
  data: SocialCredentials,
): Promise<{ ok: boolean; error?: string }> {
  await requireBusinessAccess(businessId);
  const db = getDb();
  if (!db) return { ok: false, error: "No database" };

  try {
    const existing = await db
      .select({ id: businessConfigs.id })
      .from(businessConfigs)
      .where(eq(businessConfigs.businessId, businessId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(businessConfigs)
        .set({
          facebookPageId: data.facebookPageId || null,
          facebookAccessToken: data.facebookAccessToken || null,
          instagramAccountId: data.instagramAccountId || null,
          updatedAt: new Date(),
        })
        .where(eq(businessConfigs.businessId, businessId));
    } else {
      await db.insert(businessConfigs).values({
        businessId,
        source: "owner_form",
        facebookPageId: data.facebookPageId || null,
        facebookAccessToken: data.facebookAccessToken || null,
        instagramAccountId: data.instagramAccountId || null,
      });
    }

    revalidatePath(`/workspace/${businessId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

"use server";

import { and, eq } from "drizzle-orm";
import { getDb, publishingTargets, businesses } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth/customer-guards";
import { testWordPressConnection, type WordPressConfig } from "@/lib/integrations/wordpress";

export async function getPublishingTargets(businessId: string) {
  await requireBusinessAccess(businessId);
  const db = getDb();
  if (!db) return [];
  return db
    .select()
    .from(publishingTargets)
    .where(eq(publishingTargets.businessId, businessId));
}

export async function connectWordPress(
  businessId: string,
  input: { siteUrl: string; username: string; appPassword: string },
): Promise<{ ok: boolean; error?: string; siteName?: string }> {
  await requireBusinessAccess(businessId);

  const config: WordPressConfig = {
    siteUrl: input.siteUrl.trim().replace(/\/$/, ""),
    username: input.username.trim(),
    appPassword: input.appPassword.trim(),
  };

  const test = await testWordPressConnection(config);
  if (!test.ok) return test;

  const db = getDb();
  if (!db) return { ok: false, error: "Database unavailable" };

  // Upsert: remove old WordPress target for this business, then insert new one
  await db
    .delete(publishingTargets)
    .where(and(eq(publishingTargets.businessId, businessId), eq(publishingTargets.adapter, "wordpress")));

  await db.insert(publishingTargets).values({
    businessId,
    label: test.siteName ? `WordPress: ${test.siteName}` : "WordPress",
    adapter: "wordpress",
    config,
    active: "true",
  });

  return { ok: true, siteName: test.siteName };
}

export async function disconnectWordPress(businessId: string): Promise<void> {
  await requireBusinessAccess(businessId);
  const db = getDb();
  if (!db) return;
  await db
    .delete(publishingTargets)
    .where(and(eq(publishingTargets.businessId, businessId), eq(publishingTargets.adapter, "wordpress")));
}

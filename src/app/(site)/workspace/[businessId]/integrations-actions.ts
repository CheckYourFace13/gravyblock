"use server";

import { and, eq } from "drizzle-orm";
import { getDb, publishingTargets, businesses } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth/customer-guards";
import { testWordPressConnection, type WordPressConfig } from "@/lib/integrations/wordpress";
import { testWebflowConnection, type WebflowConfig } from "@/lib/publishing/adapters/webflow";
import { testShopifyConnection, type ShopifyConfig } from "@/lib/publishing/adapters/shopify";

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

export async function connectWebflow(
  businessId: string,
  input: { siteId: string; collectionId: string; apiToken: string },
): Promise<{ ok: boolean; error?: string; collectionName?: string }> {
  await requireBusinessAccess(businessId);

  const config: WebflowConfig = {
    siteId: input.siteId.trim(),
    collectionId: input.collectionId.trim(),
    apiToken: input.apiToken.trim(),
  };

  const test = await testWebflowConnection(config);
  if (!test.ok) return test;

  const db = getDb();
  if (!db) return { ok: false, error: "Database unavailable" };

  await db
    .delete(publishingTargets)
    .where(and(eq(publishingTargets.businessId, businessId), eq(publishingTargets.adapter, "webflow")));

  await db.insert(publishingTargets).values({
    businessId,
    label: `Webflow: ${test.collectionName}`,
    adapter: "webflow",
    config,
    active: "true",
  });

  return { ok: true, collectionName: test.collectionName };
}

export async function disconnectWebflow(businessId: string): Promise<void> {
  await requireBusinessAccess(businessId);
  const db = getDb();
  if (!db) return;
  await db
    .delete(publishingTargets)
    .where(and(eq(publishingTargets.businessId, businessId), eq(publishingTargets.adapter, "webflow")));
}

export async function connectShopify(
  businessId: string,
  input: { shopDomain: string; accessToken: string },
): Promise<{ ok: boolean; error?: string; blogTitle?: string }> {
  await requireBusinessAccess(businessId);

  const config: ShopifyConfig = {
    shopDomain: input.shopDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""),
    accessToken: input.accessToken.trim(),
  };

  const test = await testShopifyConnection(config);
  if (!test.ok) return test;

  const db = getDb();
  if (!db) return { ok: false, error: "Database unavailable" };

  await db
    .delete(publishingTargets)
    .where(and(eq(publishingTargets.businessId, businessId), eq(publishingTargets.adapter, "shopify")));

  await db.insert(publishingTargets).values({
    businessId,
    label: `Shopify: ${test.blogTitle}`,
    adapter: "shopify",
    config,
    active: "true",
  });

  return { ok: true, blogTitle: test.blogTitle };
}

export async function disconnectShopify(businessId: string): Promise<void> {
  await requireBusinessAccess(businessId);
  const db = getDb();
  if (!db) return;
  await db
    .delete(publishingTargets)
    .where(and(eq(publishingTargets.businessId, businessId), eq(publishingTargets.adapter, "shopify")));
}

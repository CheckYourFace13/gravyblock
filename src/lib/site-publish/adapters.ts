/**
 * Site publishing / site action abstraction. GravyBlock does not assume any CMS:
 * each connected site has an adapter with an explicit capability set, and engines
 * ask "what can I do on this site?" instead of "is it WordPress?".
 *
 * Adapters:
 *   wordpress     REST + Application Password       articles, pages, existing-page edits
 *   webflow       CMS API                            articles
 *   shopify       Admin API                          articles
 *   managed_feed  signed first-party publishing feed articles, page metadata, social image, schema
 *                 (any site that embeds the tiny GravyBlock connector; house accounts use it)
 * Future adapters (GitHub-commit, Wix/Squarespace app, headless CMS) plug in by adding a
 * row here and a publish/verify implementation.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { businesses, getDb, jobs, publishingTargets } from "@/lib/db";
import { safeFetchText } from "@/lib/net/safe-fetch";

export type SiteAdapterKind = "wordpress" | "webflow" | "shopify" | "managed_feed";

export type SiteCapabilities = {
  articles: boolean;
  pageMetadata: boolean;
  socialImage: boolean;
  structuredData: boolean;
  existingPageBody: boolean;
};

export const SITE_ADAPTERS: Record<SiteAdapterKind, { label: string; capabilities: SiteCapabilities }> = {
  wordpress: { label: "WordPress", capabilities: { articles: true, pageMetadata: true, socialImage: false, structuredData: true, existingPageBody: true } },
  webflow: { label: "Webflow", capabilities: { articles: true, pageMetadata: false, socialImage: false, structuredData: false, existingPageBody: false } },
  shopify: { label: "Shopify", capabilities: { articles: true, pageMetadata: false, socialImage: false, structuredData: false, existingPageBody: false } },
  managed_feed: { label: "GravyBlock connector (signed feed)", capabilities: { articles: true, pageMetadata: true, socialImage: true, structuredData: true, existingPageBody: false } },
};

export type SiteTarget = { targetId: string; adapter: SiteAdapterKind; config: Record<string, unknown>; capabilities: SiteCapabilities; label: string };

export async function getSiteTarget(businessId: string): Promise<SiteTarget | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(publishingTargets)
    .where(and(eq(publishingTargets.businessId, businessId), eq(publishingTargets.active, "true"), inArray(publishingTargets.adapter, Object.keys(SITE_ADAPTERS))))
    .orderBy(publishingTargets.createdAt);
  const row = rows.find((r) => r.config);
  if (!row) return null;
  const kind = row.adapter as SiteAdapterKind;
  return { targetId: row.id, adapter: kind, config: row.config as Record<string, unknown>, capabilities: SITE_ADAPTERS[kind].capabilities, label: SITE_ADAPTERS[kind].label };
}

/** A connected site announces the connector at /.well-known/gravyblock.json and names the business it belongs to. */
export async function detectConnector(website: string): Promise<{ businessId: string; version: number } | null> {
  let origin: string;
  try {
    origin = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).origin;
  } catch {
    return null;
  }
  const r = await safeFetchText(`${origin}/.well-known/gravyblock.json`, { timeoutMs: 6000, maxBytes: 20_000, accept: "application/json" });
  if (!r.ok || r.status !== 200) return null;
  try {
    const j = JSON.parse(r.body) as { connector?: string; businessId?: string; version?: number };
    if (j.connector !== "gravyblock-managed" || !j.businessId) return null;
    return { businessId: j.businessId, version: j.version ?? 1 };
  } catch {
    return null;
  }
}

/**
 * Connect any business whose own site has the connector installed — no dashboard step.
 * The marker must name THIS business, so a site can never be attached to someone else's account.
 * House accounts are ours; customers get the same path once they add the connector snippet.
 */
export async function autoConnectManagedSites(limit = 20): Promise<{ checked: number; connected: number }> {
  const db = getDb();
  if (!db) return { checked: 0, connected: 0 };
  const bizRows = await db.select({ id: businesses.id, website: businesses.website }).from(businesses).limit(400);
  let checked = 0;
  let connected = 0;
  for (const b of bizRows) {
    if (!b.website || checked >= limit) continue;
    const [existing] = await db.select({ id: publishingTargets.id }).from(publishingTargets).where(and(eq(publishingTargets.businessId, b.id), eq(publishingTargets.adapter, "managed_feed"))).limit(1);
    if (existing) continue;
    checked++;
    const found = await detectConnector(b.website);
    if (!found || found.businessId !== b.id) continue;
    const origin = new URL(/^https?:\/\//i.test(b.website) ? b.website : `https://${b.website}`).origin;
    await db.insert(publishingTargets).values({ businessId: b.id, label: "GravyBlock connector", adapter: "managed_feed", config: { siteOrigin: origin, basePath: "/insights", connectedAt: new Date().toISOString() }, active: "true" });
    await db.insert(jobs).values({ businessId: b.id, type: "site_connector_connected", status: "completed", payload: { origin, version: found.version } });
    connected++;
  }
  return { checked, connected };
}

export async function latestOverrideState(businessId: string, path: string): Promise<{ status: string; payload: Record<string, unknown> } | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select({ status: jobs.status, payload: jobs.payload }).from(jobs).where(and(eq(jobs.businessId, businessId), eq(jobs.type, "site_override"))).orderBy(desc(jobs.createdAt)).limit(300);
  for (const r of rows) {
    const p = (r.payload ?? {}) as Record<string, unknown>;
    if (p.path === path) return { status: r.status, payload: p };
  }
  return null;
}

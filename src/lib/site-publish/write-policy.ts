/**
 * House accounts are READ-ONLY with respect to their websites.
 *
 * One rule, at the shared site layer: `account_type = 'house'` means GravyBlock may crawl, read, measure and
 * diagnose the site but may never modify it (content, metadata, schema, links, social preview, sitemap,
 * indexability, images, config or deployed code). Everything that can write to a site goes through one of the
 * choke points below, so a future engine cannot write to a house site by forgetting to check:
 *
 *   getSiteTarget()        -> capabilities all false, writable=false for house accounts
 *   getWordPressTarget()   -> null for house accounts
 *   buildManagedFeed()     -> empty items and overrides for house accounts (the signed feed serves nothing)
 *   executeContentPublishPath(), hasExternalPublishingTarget(), basic SEO apply -> refuse
 *
 * Customer accounts are unaffected: they keep their authorized write automation.
 */
import { eq } from "drizzle-orm";
import { businesses, getDb } from "@/lib/db";

export class SiteWriteBlockedError extends Error {
  constructor(businessId: string) {
    super(`site writes are disabled for house account ${businessId}`);
    this.name = "SiteWriteBlockedError";
  }
}

export async function isSiteWriteBlocked(businessId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return true; // fail closed
  const [b] = await db.select({ accountType: businesses.accountType }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  return b?.accountType === "house";
}

export async function assertSiteWritable(businessId: string): Promise<void> {
  if (await isSiteWriteBlocked(businessId)) throw new SiteWriteBlockedError(businessId);
}

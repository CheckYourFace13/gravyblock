/**
 * Customer indexing service — we handle getting our customers' sites found.
 *
 * 1. IndexNow: when we publish content to a customer's site, notify Bing/Yandex
 *    (helps AI search). Best-effort; see pingCustomerIndexNow.
 * 2. GSC sitemap submission: for customers who connected Google, submit their
 *    sitemap to Search Console via API so Google recrawls. Tiered to Scale+.
 *
 * Tiering is enforced by the caller via plan features.
 */

import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb, businesses, googleOauthConnections, jobs } from "@/lib/db";
import { getFreshAccessToken } from "@/lib/integrations/google-oauth";
import { pingIndexNow } from "@/lib/integrations/indexnow";

const SCALE_PLUS = ["growth", "pro", "agency", "managed"];

/** Notify Bing/Yandex that a customer URL changed. Best-effort, never throws. */
export async function pingCustomerIndexNow(host: string, key: string, urls: string[]): Promise<boolean> {
  if (!host || !key || !urls.length) return false;
  return pingIndexNow({ host, key, urls });
}

/** Submit one customer's sitemap to their Google Search Console. */
async function submitSitemap(businessId: string, siteUrl: string, sitemapUrl: string): Promise<boolean> {
  const token = await getFreshAccessToken(businessId);
  if (!token) return false;
  try {
    const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
    const res = await fetch(endpoint, { method: "PUT", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    return res.ok; // 200/204 on success
  } catch {
    return false;
  }
}

/**
 * Submit sitemaps for Scale+ customers with Google connected. Monthly dedup.
 * Returns how many were submitted.
 */
export async function runCustomerSitemapSubmissionBatch(limit = 15): Promise<{ submitted: number }> {
  const db = getDb();
  if (!db) return { submitted: 0 };

  const conns = await db
    .select({
      businessId: googleOauthConnections.businessId,
      property: googleOauthConnections.searchConsoleProperty,
      website: businesses.website,
      planTier: businesses.planTier,
    })
    .from(googleOauthConnections)
    .innerJoin(businesses, eq(businesses.id, googleOauthConnections.businessId))
    .where(inArray(businesses.planTier, SCALE_PLUS))
    .limit(limit * 3);

  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let submitted = 0;

  for (const c of conns) {
    if (submitted >= limit) break;
    if (!c.property || !c.website) continue;

    const jobType = `sitemap_submit_${c.businessId}`;
    const [recent] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.type, jobType), gte(jobs.createdAt, monthAgo)))
      .limit(1);
    if (recent) continue;

    const sitemapUrl = `${c.website.replace(/\/$/, "")}/sitemap.xml`;
    const ok = await submitSitemap(c.businessId, c.property, sitemapUrl);
    if (ok) {
      await db.insert(jobs).values({ id: randomUUID(), businessId: c.businessId, type: jobType, status: "done", payload: { sitemapUrl } });
      submitted++;
    }
  }

  return { submitted };
}

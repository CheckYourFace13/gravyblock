import { eq } from "drizzle-orm";
import { businesses, getDb } from "@/lib/db";
import { listVerifiedProperties } from "./google-search-console";
import { getGoogleConnection, updateGoogleConnectionProperty, upsertGoogleConnection } from "./google-oauth";

/**
 * One Google authorization for the whole House Accounts portfolio. The owner authorizes ONCE on any house account (existing flow:
 * /api/auth/google/start?businessId=<a house account id>, signed in to admin). The callback then reuses that same read-only Search Console grant
 * for the other house accounts and matches each house site to a Search Console property by domain. Only accounts with account_type "house" are
 * ever touched; a paying customer's Google connection is never read, copied or written here.
 */

const domainOf = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

/** The Search Console property for a domain: a domain property first, then the https and http URL prefixes. Null when the Google account has none for it. */
export function matchSearchConsoleProperty(domain: string, properties: string[]): string | null {
  const wanted = [`sc-domain:${domain}`, `https://${domain}/`, `https://www.${domain}/`, `http://${domain}/`, `http://www.${domain}/`];
  const have = new Set(properties.map((p) => p.toLowerCase()));
  return wanted.find((w) => have.has(w)) ?? null;
}

/** True only for a House Account (the owner's own portfolio). Used so the admin session can start Google authorization for house accounts and for nothing else. */
export async function isHouseAccount(businessId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    const [row] = await db.select({ accountType: businesses.accountType }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
    return row?.accountType === "house";
  } catch {
    return false; // not a valid id or no database: never grants access
  }
}

export type HouseGoogleFanOut = { copiedTo: number; matched: Array<{ name: string; property: string }>; notInGoogleAccount: string[] };

export async function fanOutHouseGoogleConnection(sourceBusinessId: string): Promise<HouseGoogleFanOut | null> {
  const db = getDb();
  if (!db) return null;
  const [source] = await db.select({ accountType: businesses.accountType }).from(businesses).where(eq(businesses.id, sourceBusinessId)).limit(1);
  if (source?.accountType !== "house") return null;
  const conn = await getGoogleConnection(sourceBusinessId);
  if (!conn || !conn.refreshToken) return null;

  const houses = await db.select({ id: businesses.id, name: businesses.name, website: businesses.website }).from(businesses).where(eq(businesses.accountType, "house"));
  const properties = await listVerifiedProperties(conn.accessToken);
  const out: HouseGoogleFanOut = { copiedTo: 0, matched: [], notInGoogleAccount: [] };
  for (const h of houses) {
    if (h.id !== sourceBusinessId) {
      await upsertGoogleConnection({ businessId: h.id, accessToken: conn.accessToken, refreshToken: conn.refreshToken, expiresAt: conn.expiresAt, scopes: conn.scopes, googleEmail: conn.googleEmail });
      out.copiedTo++;
    }
    const domain = domainOf(h.website);
    const property = domain ? matchSearchConsoleProperty(domain, properties) : null;
    if (property) {
      await updateGoogleConnectionProperty(h.id, { searchConsoleProperty: property });
      out.matched.push({ name: h.name, property });
    } else out.notInGoogleAccount.push(h.name);
  }
  return out;
}

/**
 * Email opt-out utilities.
 * Used by both the drip sequence and cold outreach to check + generate unsubscribe links.
 */

import { eq, sql } from "drizzle-orm";
import { getDb, jobs } from "@/lib/db";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";

/** Encode email for use in unsubscribe URLs. */
export function encodeEmail(email: string): string {
  return Buffer.from(email.toLowerCase()).toString("base64url");
}

/**
 * Build an unsubscribe URL for an email address.
 * Optionally include the lead ID so the lead record gets updated too.
 */
export function unsubscribeUrl(email: string, leadId?: string): string {
  const params = new URLSearchParams({ e: encodeEmail(email) });
  if (leadId) params.set("lid", leadId);
  return `${SITE_URL}/api/unsubscribe?${params.toString()}`;
}

/** Check if an email address has opted out of all marketing emails. */
export async function isOptedOut(email: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;

  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.type, "email_optout"))
    .where(eq(sql`lower(payload->>'email')`, email.toLowerCase()))
    .limit(1)
    .catch(() => []);

  return Boolean(row);
}

/** Unsubscribe footer HTML to append to all marketing emails. */
export function unsubscribeFooter(email: string, leadId?: string): string {
  const url = unsubscribeUrl(email, leadId);
  return `<p style="margin:24px 0 0;font-size:11px;color:#a1a1aa;text-align:center">
    GravyBlock &middot;
    <a href="${url}" style="color:#a1a1aa;text-decoration:underline">Unsubscribe</a>
    &middot; You're receiving this because you scanned your business on GravyBlock.
  </p>`;
}

/** Unsubscribe footer for cold outreach emails (slightly different wording). */
export function coldOutreachFooter(email: string): string {
  const url = unsubscribeUrl(email);
  return `<p style="font-size:12px;color:#999;margin:0">
    I send these personally when I notice a business that could be ranking higher.
    <a href="${url}" style="color:#999">Unsubscribe</a> to never hear from us again.
  </p>`;
}

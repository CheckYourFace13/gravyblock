/**
 * Email opt-out utilities.
 * Used by both the drip sequence and cold outreach to check + generate unsubscribe links.
 */

import { and, eq, sql } from "drizzle-orm";
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

/**
 * Check if an email address has opted out of all marketing emails.
 * Deliberately does NOT swallow a query failure into "not opted out" — a
 * DB error here must block the send (fail closed), same posture as
 * pause-guard.ts. Silently treating a failed suppression check as "clear to
 * send" would mean a real opt-out could get re-contacted the moment the
 * lookup itself has a transient error, which is worse than skipping a good
 * prospect.
 */
export async function isOptedOut(email: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;

  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, "email_optout"), eq(sql`lower(payload->>'email')`, email.toLowerCase())))
    .limit(1);

  return Boolean(row);
}

/** Record an opt-out for an email address (used by webhook on bounce/complaint). */
export async function recordOptOut(email: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  // Check if already opted out before inserting
  const already = await isOptedOut(email);
  if (already) return;
  await db.insert(jobs).values({
    type: "email_optout",
    payload: { email: email.toLowerCase(), source: "webhook" },
    status: "completed",
  });
}

/**
 * RFC 8058 one-click unsubscribe headers for marketing and outreach mail. Gmail and Yahoo expect these on promotional mail (an "Unsubscribe" button in the inbox
 * instead of the spam button); the URL accepts a POST (one-click) and a GET (the existing confirmation page). Suppression is the same email_optout record as the
 * footer link, so nothing about who is suppressed changes.
 */
export function listUnsubscribeHeaders(email: string, leadId?: string): Record<string, string> {
  return { "List-Unsubscribe": `<${unsubscribeUrl(email, leadId)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

/** A readable plain-text alternative for HTML-only messages (multipart mail with a text part is the norm; HTML-only is a spam-filter signal). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const t = label.replace(/<[^>]+>/g, "").trim();
      return t && !href.startsWith("mailto:") && t !== href ? `${t} (${href})` : t || href;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|table|ul|ol)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&middot;/g, "·").replace(/&bull;/g, "•").replace(/&mdash;/g, "-").replace(/&rarr;/g, "->")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ")
    .trim();
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

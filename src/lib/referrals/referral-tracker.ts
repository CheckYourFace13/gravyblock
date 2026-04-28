/**
 * Simple referral system using the jobs table for tracking.
 * No new DB table needed — referral events are stored as job records.
 *
 * Referral URL format: /scan?ref=<6-char businessId prefix>
 *
 * Events tracked:
 *   type = "referral_click"  — someone clicked a referral link
 *   type = "referral_scan"   — referred person ran a scan
 *   type = "referral_paid"   — referred person became a paid customer (set by webhook)
 */

import { and, count, eq, sql } from "drizzle-orm";
import { getDb, jobs } from "@/lib/db";

export function referralCodeForBusiness(businessId: string): string {
  return businessId.replace(/-/g, "").slice(0, 8);
}

export function referralUrlForBusiness(businessId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
  return `${base}/scan?ref=${referralCodeForBusiness(businessId)}`;
}

export async function trackReferralEvent(
  event: "click" | "scan" | "paid",
  refCode: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db.insert(jobs).values({
    type: `referral_${event}`,
    status: "completed",
    payload: { refCode, ...meta },
  });
}

export async function getReferralStats(businessId: string): Promise<{
  clicks: number;
  scans: number;
  paid: number;
}> {
  const db = getDb();
  if (!db) return { clicks: 0, scans: 0, paid: 0 };

  const refCode = referralCodeForBusiness(businessId);

  const [clicks, scans, paid] = await Promise.all([
    db.select({ count: count() }).from(jobs).where(
      and(
        eq(jobs.type, "referral_click"),
        sql`${jobs.payload}->>'refCode' = ${refCode}`,
      )
    ),
    db.select({ count: count() }).from(jobs).where(
      and(
        eq(jobs.type, "referral_scan"),
        sql`${jobs.payload}->>'refCode' = ${refCode}`,
      )
    ),
    db.select({ count: count() }).from(jobs).where(
      and(
        eq(jobs.type, "referral_paid"),
        sql`${jobs.payload}->>'refCode' = ${refCode}`,
      )
    ),
  ]);

  return {
    clicks: clicks[0]?.count ?? 0,
    scans: scans[0]?.count ?? 0,
    paid: paid[0]?.count ?? 0,
  };
}

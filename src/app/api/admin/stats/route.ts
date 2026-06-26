/**
 * Read-only metrics endpoint for monitoring acquisition health.
 *
 * Auth: requires ?token=<STATS_TOKEN> matching the STATS_TOKEN env var.
 * Returns ONLY aggregate counts — no customer PII, no write access.
 *
 * Usage:  curl "https://gravyblock.com/api/admin/stats?token=YOUR_TOKEN"
 */

import { NextRequest, NextResponse } from "next/server";
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, jobs, leads, businesses, emailEvents } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];

async function countJobs(db: NonNullable<ReturnType<typeof getDb>>, type: string, since?: Date): Promise<number> {
  const where = since ? and(eq(jobs.type, type), gte(jobs.createdAt, since)) : eq(jobs.type, type);
  const [row] = await db.select({ n: count() }).from(jobs).where(where);
  return row?.n ?? 0;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("token");
  const expected = process.env.STATS_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ error: "No database" }, { status: 503 });

  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000);
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

  try {
    const [
      sent24h, sent7d, sentAll,
      followups7d, breakups7d,
      optOutsAll,
      leads7d, leadsAll,
      paidRow, freeRow,
    ] = await Promise.all([
      countJobs(db, "cold_outreach_sent", since24h),
      countJobs(db, "cold_outreach_sent", since7d),
      countJobs(db, "cold_outreach_sent"),
      countJobs(db, "cold_outreach_followup_sent", since7d),
      countJobs(db, "cold_outreach_breakup_sent", since7d),
      countJobs(db, "email_optout"),
      db.select({ n: count() }).from(leads).where(gte(leads.createdAt, since7d)).then((r) => r[0]?.n ?? 0),
      db.select({ n: count() }).from(leads).then((r) => r[0]?.n ?? 0),
      db.select({ n: count() }).from(businesses).where(inArray(businesses.planTier, PAID_TIERS)).then((r) => r[0]?.n ?? 0),
      db.select({ n: count() }).from(businesses).then((r) => r[0]?.n ?? 0),
    ]);

    // Email engagement from Resend webhook events (last 7d), grouped by type
    let opens7d = 0;
    let clicks7d = 0;
    let bounces7d = 0;
    try {
      const events = await db
        .select({ eventType: emailEvents.eventType, n: count() })
        .from(emailEvents)
        .where(gte(emailEvents.createdAt, since7d))
        .groupBy(emailEvents.eventType);
      for (const e of events) {
        if (e.eventType === "opened") opens7d = e.n;
        else if (e.eventType === "clicked") clicks7d = e.n;
        else if (e.eventType === "bounced") bounces7d = e.n;
      }
    } catch { /* email_events table may not exist yet on older DBs */ }

    const openRate = sent7d > 0 ? Math.round((opens7d / sent7d) * 100) : null;

    return NextResponse.json({
      asOf: new Date().toISOString(),
      outreach: {
        sentLast24h: sent24h,
        sentLast7d: sent7d,
        sentAllTime: sentAll,
        followupsLast7d: followups7d,
        breakupsLast7d: breakups7d,
        optOutsAllTime: optOutsAll,
      },
      engagement7d: {
        opens: opens7d,
        clicks: clicks7d,
        bounces: bounces7d,
        openRatePct: openRate,
        note: openRate === null ? "no sends in window" : "opens require Resend webhook to be live",
      },
      leads: {
        last7d: leads7d,
        allTime: leadsAll,
      },
      subscribers: {
        paid: paidRow,
        totalBusinesses: freeRow,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Query failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

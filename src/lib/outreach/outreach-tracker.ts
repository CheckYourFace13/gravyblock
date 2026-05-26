// Tracks which businesses have been cold-outreached to avoid duplicates.
// Uses the jobs table with type = "cold_outreach_sent" and payload = { placeId, businessName }.
// No outreachTargets table exists in schema — this is the correct fallback.

import { getDb, jobs } from "@/lib/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";

const OUTREACH_JOB_TYPE = "cold_outreach_sent";

export async function hasBeenContacted(placeId: string): Promise<boolean> {
  const db = getDb();
  if (!db) {
    // No DB — can't check, treat as not contacted so we don't silently skip sends
    return false;
  }

  const existing = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.type, OUTREACH_JOB_TYPE),
        eq(sql`payload->>'placeId'`, placeId),
      ),
    )
    .limit(1);

  return existing.length > 0;
}

export async function recordOutreachSent(
  placeId: string,
  businessName: string,
  email?: string,
): Promise<void> {
  const db = getDb();
  if (!db) {
    console.warn("[outreach-tracker] No DB available — skipping recordOutreachSent");
    return;
  }

  await db.insert(jobs).values({
    type: OUTREACH_JOB_TYPE,
    payload: {
      placeId,
      businessName,
      ...(email ? { email } : {}),
    },
    status: "done",
  });
}

// ── Follow-up (email #2) tracking ────────────────────────────────────────────

const FOLLOWUP_JOB_TYPE = "cold_outreach_followup_sent";

/** Returns prospects who got email #1 between minDaysAgo and maxDaysAgo, haven't gotten email #2 yet. */
export async function getFollowupCandidates(
  minDaysAgo = 3,
  maxDaysAgo = 21,
  limit = 20,
): Promise<Array<{ placeId: string; businessName: string; email: string }>> {
  const db = getDb();
  if (!db) return [];

  const minDate = new Date(Date.now() - maxDaysAgo * 24 * 60 * 60 * 1000);
  const maxDate = new Date(Date.now() - minDaysAgo * 24 * 60 * 60 * 1000);

  // Load email-1 records sent in the window
  const sentJobs = await db
    .select({ payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.type, OUTREACH_JOB_TYPE), gte(jobs.createdAt, minDate), lte(jobs.createdAt, maxDate)))
    .limit(limit * 10);

  if (sentJobs.length === 0) return [];

  // Load all follow-up records to build exclusion set
  const followupJobs = await db
    .select({ payload: jobs.payload })
    .from(jobs)
    .where(eq(jobs.type, FOLLOWUP_JOB_TYPE))
    .limit(2000);

  const alreadyFollowedUp = new Set(
    followupJobs.map((j) => (j.payload as Record<string, unknown>)?.placeId as string).filter(Boolean),
  );

  return sentJobs
    .map((j) => {
      const p = j.payload as Record<string, unknown>;
      return {
        placeId: (p?.placeId as string) ?? "",
        businessName: (p?.businessName as string) ?? "",
        email: (p?.email as string) ?? "",
      };
    })
    .filter((c) => c.placeId && c.email && !alreadyFollowedUp.has(c.placeId))
    .slice(0, limit);
}

export async function recordFollowupSent(
  placeId: string,
  businessName: string,
  email: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(jobs).values({
    type: FOLLOWUP_JOB_TYPE,
    payload: { placeId, businessName, email },
    status: "done",
  });
}

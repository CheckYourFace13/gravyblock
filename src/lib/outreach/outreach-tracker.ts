// Tracks which businesses have been cold-outreached to avoid duplicates.
// Uses the jobs table with type = "cold_outreach_sent" and payload = { placeId, businessName }.
// No outreachTargets table exists in schema — this is the correct fallback.

import { getDb, jobs } from "@/lib/db";
import { and, eq, sql } from "drizzle-orm";

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

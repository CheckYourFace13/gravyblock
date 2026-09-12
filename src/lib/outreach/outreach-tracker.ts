// Tracks which businesses have been cold-outreached to avoid duplicates.
// Uses the jobs table with type = "cold_outreach_sent" and payload = { placeId, businessName }.
// No outreachTargets table exists in schema — this is the correct fallback.

import { getDb, jobs, reports } from "@/lib/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { classifyFindingStrength } from "./finding-quality";

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
  city?: string,
  reportPublicId?: string,
  contactSource?: string,
  contactConfidence?: string,
  resendEmailId?: string,
  extra?: { industry?: string; attributionToken?: string; discoverySourceUrl?: string | null; isNamed?: boolean; variant?: "A" | "B" },
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
      ...(city ? { city } : {}),
      ...(reportPublicId ? { reportPublicId } : {}),
      ...(contactSource ? { contactSource } : {}),
      ...(contactConfidence ? { contactConfidence } : {}),
      ...(resendEmailId ? { resendEmailId } : {}),
      ...(extra?.industry ? { industry: extra.industry } : {}),
      ...(extra?.attributionToken ? { attributionToken: extra.attributionToken } : {}),
      ...(extra?.discoverySourceUrl ? { discoverySourceUrl: extra.discoverySourceUrl } : {}),
      ...(extra?.isNamed !== undefined ? { isNamed: extra.isNamed } : {}),
      ...(extra?.variant ? { variant: extra.variant } : {}),
    },
    status: "done",
  });
}

/** Real top finding + score for an existing report — lets follow-up/breakup emails
 * reference the SAME finding as the initial email instead of re-running a scan. */
export async function getReportSummary(
  reportPublicId: string,
): Promise<{ findingId: string | null; findingTitle: string | null; score: number | null } | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ payload: reports.payload, overallScore: reports.overallScore })
    .from(reports)
    .where(eq(reports.publicId, reportPublicId))
    .limit(1);
  if (!row) return null;
  const payload = row.payload as { prioritizedFixes?: Array<{ id?: string; title?: string }> } | null;
  const fixes = payload?.prioritizedFixes ?? [];
  // Re-rank by outreach-hook strength, not the report's own impact order —
  // same reasoning as prospect-prescan.ts: the report's #1 fix is almost
  // always the generic modeled "estimated visibility is soft" finding, so a
  // naive [0] would keep echoing that instead of a real, specific one.
  const strengthRank = { strong: 3, medium: 2, weak: 1 } as const;
  const best = [...fixes].sort(
    (a, b) => strengthRank[classifyFindingStrength(b.id)] - strengthRank[classifyFindingStrength(a.id)],
  )[0];
  return { findingId: best?.id ?? null, findingTitle: best?.title ?? null, score: row.overallScore ?? null };
}

// ── Follow-up (email #2) tracking ────────────────────────────────────────────

const FOLLOWUP_JOB_TYPE = "cold_outreach_followup_sent";

/** Returns prospects who got email #1 between minDaysAgo and maxDaysAgo, haven't gotten email #2 yet. */
export async function getFollowupCandidates(
  minDaysAgo = 3,
  maxDaysAgo = 21,
  limit = 20,
): Promise<Array<{ placeId: string; businessName: string; email: string; city: string; reportPublicId?: string }>> {
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
        city: (p?.city as string) ?? "",
        contactSource: p?.contactSource as string | undefined,
        reportPublicId: p?.reportPublicId as string | undefined,
      };
    })
    .filter((c) => c.placeId && c.email && !alreadyFollowedUp.has(c.placeId))
    // Legacy pre-discoverContactEmail records have no contactSource at all
    // (that field didn't exist yet) — those are guessed addresses (many on
    // garbage placeholder domains), confirmed via the Aug25-Sep4 funnel pull
    // to be driving a 36%+ follow-up bounce rate. Only follow up contacts
    // whose original send was a verified, genuinely published address —
    // either a mailto: link or schema.org structured data (see
    // discover-contact-email.ts's ContactSource type; keep this in sync
    // with that type, not just literally "website_mailto").
    .filter((c) => c.contactSource === "website_mailto" || c.contactSource === "structured_data")
    .map(({ contactSource: _contactSource, ...c }) => c)
    .slice(0, limit);
}

export async function recordFollowupSent(
  placeId: string,
  businessName: string,
  email: string,
  city?: string,
  attributionToken?: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(jobs).values({
    type: FOLLOWUP_JOB_TYPE,
    payload: { placeId, businessName, email, ...(city ? { city } : {}), ...(attributionToken ? { attributionToken } : {}) },
    status: "done",
  });
}

// ── Breakup (email #3) tracking ──────────────────────────────────────────────

const BREAKUP_JOB_TYPE = "cold_outreach_breakup_sent";

/** Prospects who got the follow-up (email #2) 5–30 days ago and no breakup yet. */
export async function getBreakupCandidates(
  minDaysAgo = 5,
  maxDaysAgo = 30,
  limit = 40,
): Promise<Array<{ placeId: string; businessName: string; email: string; city: string; reportPublicId?: string }>> {
  const db = getDb();
  if (!db) return [];

  const minDate = new Date(Date.now() - maxDaysAgo * 24 * 60 * 60 * 1000);
  const maxDate = new Date(Date.now() - minDaysAgo * 24 * 60 * 60 * 1000);

  const followupJobs = await db
    .select({ payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.type, FOLLOWUP_JOB_TYPE), gte(jobs.createdAt, minDate), lte(jobs.createdAt, maxDate)))
    .limit(limit * 10);

  if (followupJobs.length === 0) return [];

  const [breakupJobs, originalSendJobs] = await Promise.all([
    db.select({ payload: jobs.payload }).from(jobs).where(eq(jobs.type, BREAKUP_JOB_TYPE)).limit(2000),
    // cold_outreach_followup_sent doesn't carry contactSource itself — trace
    // back to each candidate's original email-#1 record to check it (same
    // legacy-guessed-address exclusion as getFollowupCandidates above).
    db.select({ payload: jobs.payload }).from(jobs).where(eq(jobs.type, OUTREACH_JOB_TYPE)).limit(5000),
  ]);

  const alreadyBrokenUp = new Set(
    breakupJobs.map((j) => (j.payload as Record<string, unknown>)?.placeId as string).filter(Boolean),
  );
  const verifiedPlaceIds = new Set(
    originalSendJobs
      .map((j) => j.payload as Record<string, unknown>)
      .filter((p) => p?.contactSource === "website_mailto" || p?.contactSource === "structured_data")
      .map((p) => p.placeId as string)
      .filter(Boolean),
  );
  const reportPublicIdByPlaceId = new Map(
    originalSendJobs
      .map((j) => j.payload as Record<string, unknown>)
      .filter((p) => p?.placeId && p?.reportPublicId)
      .map((p) => [p.placeId as string, p.reportPublicId as string]),
  );

  return followupJobs
    .map((j) => {
      const p = j.payload as Record<string, unknown>;
      const placeId = (p?.placeId as string) ?? "";
      return {
        placeId,
        businessName: (p?.businessName as string) ?? "",
        email: (p?.email as string) ?? "",
        city: (p?.city as string) ?? "",
        reportPublicId: reportPublicIdByPlaceId.get(placeId),
      };
    })
    .filter((c) => verifiedPlaceIds.has(c.placeId))
    .filter((c) => c.placeId && c.email && !alreadyBrokenUp.has(c.placeId))
    .slice(0, limit);
}

export async function recordBreakupSent(
  placeId: string,
  businessName: string,
  email: string,
  attributionToken?: string,
): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(jobs).values({
    type: BREAKUP_JOB_TYPE,
    payload: { placeId, businessName, email, ...(attributionToken ? { attributionToken } : {}) },
    status: "done",
  });
}

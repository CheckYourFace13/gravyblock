/**
 * Paid-onboarding baseline setup.
 *
 * Gap this closes: a business could complete Stripe checkout and land in its
 * workspace having NEVER had a real scan run — `directSignupAction` creates a
 * bare `businesses` row (name/email/website only) and checkout only ever
 * triggered `autoConfigBusiness` (an LLM-written brand-voice config, not a
 * measurement) plus scheduling the NEXT recurring refresh. Nothing populated
 * the FIRST real visibility snapshot, so `/workspace/[businessId]` showed a
 * blank/zero score for a paying customer until whatever the next recurring
 * cycle happened to compute — with no visible indication that setup was
 * still in progress.
 *
 * This runs the same real scan pipeline every free scan and every cold-
 * outreach pre-scan already use (generateReportFromPlace/FromWebsite →
 * recordScanRun), so a paid customer's first score is exactly as real as a
 * self-served one — never fabricated, never skipped silently.
 */

import { eq, inArray, and } from "drizzle-orm";
import { getDb, businesses, visibilitySnapshots, jobs } from "@/lib/db";
import { createPublicId, generateReportFromPlace, generateReportFromWebsite } from "@/lib/report/generator";
import { recordScanRun } from "@/lib/report/repository";
import { checkBusinessVisibilityInAI } from "@/lib/integrations/perplexity";

const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];
const MAX_ATTEMPTS = 3;

function cityFromAddress(address: string | null | undefined): string {
  if (!address) return "";
  const parts = address.split(",");
  return parts.length >= 2 ? parts[1].trim() : address.trim();
}

export type BaselineSetupResult =
  | { ok: true }
  | { ok: false; reason: "no_db" | "already_has_baseline" | "max_attempts_reached" | "no_website_or_place" | "scan_failed" };

/**
 * Runs (or retries) the one-time real baseline scan for a single paid
 * business. Safe to call repeatedly — no-ops once a snapshot exists.
 */
export async function runOnboardingBaselineSetup(businessId: string): Promise<BaselineSetupResult> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };

  const [existing] = await db
    .select({ id: visibilitySnapshots.id })
    .from(visibilitySnapshots)
    .where(eq(visibilitySnapshots.businessId, businessId))
    .limit(1);
  if (existing) return { ok: false, reason: "already_has_baseline" };

  const attemptType = `onboarding_baseline_attempt_${businessId}`;
  const priorAttempts = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.type, attemptType));
  if (priorAttempts.length >= MAX_ATTEMPTS) {
    // Queryable terminal-failure marker for admin visibility — idempotent,
    // only recorded once per business regardless of how many more times the
    // worker sweep encounters this business before someone intervenes.
    const [alreadyFlagged] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.type, "onboarding_baseline_failed"), eq(jobs.businessId, businessId)))
      .limit(1);
    if (!alreadyFlagged) {
      await db.insert(jobs).values({ type: "onboarding_baseline_failed", businessId, status: "failed", payload: { reason: "max_attempts_reached" } });
    }
    return { ok: false, reason: "max_attempts_reached" };
  }

  const [biz] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      placeId: businesses.placeId,
      website: businesses.website,
      address: businesses.address,
      vertical: businesses.vertical,
      focusArea: businesses.focusArea,
      businessModel: businesses.businessModel,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz || (!biz.placeId && !biz.website)) {
    // Genuinely nothing to scan — not a transient failure, don't keep retrying.
    await db.insert(jobs).values({ type: attemptType, status: "failed", payload: { reason: "no_website_or_place" } });
    await db.insert(jobs).values({ type: "onboarding_baseline_failed", businessId, status: "failed", payload: { reason: "no_website_or_place" } });
    return { ok: false, reason: "no_website_or_place" };
  }

  try {
    const city = cityFromAddress(biz.address);
    const vertical = (biz.vertical as Parameters<typeof generateReportFromPlace>[0]["vertical"]) ?? "other";
    const generated = biz.placeId
      ? await generateReportFromPlace({ placeId: biz.placeId, vertical, query: biz.name, locationHint: city })
      : await generateReportFromWebsite({
          websiteUrl: biz.website!,
          businessName: biz.name,
          focusArea: (biz.focusArea as "local" | "regional" | "national" | "online") ?? "local",
        });

    const publicId = createPublicId();
    await recordScanRun({
      publicId,
      query: biz.name,
      locationHint: city,
      selectedPlaceId: biz.placeId ?? undefined,
      candidateConfidence: undefined,
      profile: generated.profile,
      payload: generated.payload,
      rankingChecks: generated.rankings,
      auditFindings: generated.crawlFindings,
      competitorSnapshots: generated.competitorSnapshots,
      businessModel: (biz.businessModel as "single_location" | "multi_location") ?? "single_location",
      vertical,
      focusArea: (biz.focusArea as "local" | "regional" | "national" | "online") ?? "local",
    });

    // Best-effort AI-visibility baseline probe — non-fatal if it fails, the
    // recurring refresh's own monthly probe gate will pick this up later.
    try {
      const checks = await checkBusinessVisibilityInAI({ businessName: biz.name, city, vertical: biz.vertical ?? null });
      if (checks.length > 0) {
        const { aiVisibilityChecks } = await import("@/lib/db");
        await db.insert(aiVisibilityChecks).values(
          checks.map((c) => ({
            businessId,
            locationId: null as string | null,
            prompt: c.query,
            engine: c.platform,
            mentionFound: c.mentioned ? "true" : "false",
            sentiment: c.sentiment,
            confidence: c.confidence,
          })),
        );
      }
    } catch (err) {
      console.warn("[onboarding-baseline] AI probe failed (non-fatal)", { businessId, error: err instanceof Error ? err.message : String(err) });
    }

    await db.insert(jobs).values({ type: attemptType, status: "done", payload: { publicId } });
    await db.insert(jobs).values({ type: "onboarding_baseline_complete", businessId, status: "done", payload: { publicId } });
    return { ok: true };
  } catch (err) {
    console.error("[onboarding-baseline] scan failed", { businessId, error: err instanceof Error ? err.message : String(err) });
    await db.insert(jobs).values({ type: attemptType, status: "failed", payload: { reason: "scan_failed", error: err instanceof Error ? err.message : String(err) } });
    return { ok: false, reason: "scan_failed" };
  }
}

/** Runs baseline setup for paid businesses that still have zero visibility snapshots, up to batchSize per call. */
export async function runOnboardingBaselineBatch(batchSize = 5): Promise<{ completed: number; failed: number; checked: number }> {
  const db = getDb();
  if (!db) return { completed: 0, failed: 0, checked: 0 };

  const paid = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(inArray(businesses.planTier, PAID_TIERS))
    .limit(200);

  const candidateIds = paid.map((b) => b.id);
  if (candidateIds.length === 0) return { completed: 0, failed: 0, checked: 0 };

  const withSnapshot = await db
    .select({ businessId: visibilitySnapshots.businessId })
    .from(visibilitySnapshots);
  const hasSnapshot = new Set(withSnapshot.map((s) => s.businessId));
  const missing = candidateIds.filter((id) => !hasSnapshot.has(id)).slice(0, batchSize);

  let completed = 0;
  let failed = 0;
  for (const businessId of missing) {
    const result = await runOnboardingBaselineSetup(businessId);
    if (result.ok) completed++;
    else if (result.reason !== "already_has_baseline") failed++;
  }

  return { completed, failed, checked: missing.length };
}

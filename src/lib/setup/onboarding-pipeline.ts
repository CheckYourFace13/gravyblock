/**
 * Shared onboarding initialization pipeline — the ONE place that establishes
 * a business's real baseline, called identically from Stripe checkout (paid
 * customers) and directly for house accounts (no fabricated payment event).
 * Replaces the earlier onboarding-baseline.ts (which only covered the scan/
 * score piece) and reinitializeHouseAccountBaselines (which never actually
 * ran house accounts through the real customer path — it only fast-forwarded
 * their next recurring-refresh job).
 *
 * Design:
 *  - Resumable/idempotent: every component's status is read before doing its
 *    work; already-`complete`/`not_applicable` components are skipped, so
 *    calling this twice (or a hundred times, e.g. via the worker's retry
 *    sweep) never redoes finished work or duplicates side effects.
 *  - Component-by-component retry: one component failing (e.g. a transient
 *    Google Places timeout) does not force-restart already-completed
 *    components — the next call only retries what's still pending/failed.
 *  - `automation_ready` can only become `complete` when every REQUIRED
 *    component (business_identity, website_crawl, score_snapshot,
 *    ai_visibility_baseline, citation_baseline, recurring_scheduled) is
 *    `complete` or `not_applicable`. `needs_customer_action` components
 *    (place_identity, competitor_baseline, ranking_baseline,
 *    gbp_integration_status) do NOT block readiness — per the explicit
 *    instruction that Google-dependent features are integration-dependent,
 *    not launch blockers, and a business with no confident Place match can
 *    still get everything else that works.
 *
 * NOT decomposed further than this: website_crawl, score_snapshot, and (for
 * place-resolved businesses) competitor_baseline/ranking_baseline are all
 * produced by ONE underlying call (generateReportFromPlace/FromWebsite ->
 * recordScanRun) — that pipeline was not rewritten to make each of those
 * independently re-runnable, which would have meant rearchitecting
 * generator.ts. They are tracked as separate component STATUS rows (so the
 * customer-facing summary can show them separately and honestly), but their
 * IMPLEMENTATION succeeds or fails together as one scan. This is a
 * deliberate scope limit, not an oversight.
 */

import { eq } from "drizzle-orm";
import { getDb, businesses, googleOauthConnections, visibilitySnapshots, aiVisibilityChecks } from "@/lib/db";
import { createPublicId, generateReportFromPlace, generateReportFromWebsite } from "@/lib/report/generator";
import { recordScanRun } from "@/lib/report/repository";
import { checkBusinessVisibilityInAI } from "@/lib/integrations/perplexity";
import { searchGooglePlaceCandidates, getGooglePlaceDetails } from "@/lib/integrations/google-places";
import { normalizeWebsiteForLookup } from "@/lib/business/normalize";
import { runCitationAuditForBusiness } from "@/lib/citations/citation-audit";
import { scheduleRecurringSnapshotJob, schedulePlanRecurringSnapshotJob } from "@/lib/autopilot/executor";
import { normalizePlanTierFromDb } from "@/lib/plans";
import {
  getComponentStatus,
  setComponentStatus,
  getAllComponentStates,
  isDone,
  type OnboardingComponent,
} from "./onboarding-components";

const REQUIRED_FOR_READY: OnboardingComponent[] = [
  "business_identity",
  "website_crawl",
  "score_snapshot",
  "ai_visibility_baseline",
  "citation_baseline",
  "recurring_scheduled",
];

/**
 * Bounded retry: after 3 attempts a component moves to `failed` instead of
 * retrying forever. Prevents a genuinely-broken business (bad API key,
 * permanently-erroring input) from burning API quota every worker tick
 * indefinitely while never surfacing a clear terminal state.
 */
function nextRetryStatus(priorDetail: Record<string, unknown> | null | undefined): { status: "retrying" | "failed"; attempt: number } {
  const attempt = ((priorDetail?.attempt as number | undefined) ?? 0) + 1;
  return { status: attempt >= 3 ? "failed" : "retrying", attempt };
}

function cityFromAddress(address: string | null | undefined): string {
  if (!address) return "";
  const parts = address.split(",");
  return parts.length >= 2 ? parts[1].trim() : address.trim();
}

/**
 * Attempts to resolve a real Google Place identity for a business that
 * doesn't already have one, using name + address + website (the reliable
 * information already on file) — never fabricates a match. A match is
 * "confident" when either (a) the top candidate's own website matches the
 * business's stored website domain exactly, or (b) the text-search
 * confidence score is high (>=75) with no website to cross-check against.
 */
async function resolvePlaceIdentity(input: {
  name: string;
  website: string | null;
  address: string | null;
}): Promise<{ matched: true; placeId: string; confidence: number; domainConfirmed: boolean } | { matched: false; reason: string; topCandidateConfidence: number | null }> {
  const city = cityFromAddress(input.address);
  let candidates;
  try {
    candidates = await searchGooglePlaceCandidates({ query: input.name, locationHint: city, maxResults: 5 });
  } catch (err) {
    return { matched: false, reason: `places_search_failed: ${err instanceof Error ? err.message : String(err)}`, topCandidateConfidence: null };
  }
  if (candidates.length === 0) return { matched: false, reason: "no_candidates_found", topCandidateConfidence: null };

  const top = candidates[0]!;
  let domainConfirmed = false;
  if (input.website) {
    try {
      const details = await getGooglePlaceDetails(top.placeId);
      if (details.website) {
        domainConfirmed = normalizeWebsiteForLookup(details.website) === normalizeWebsiteForLookup(input.website);
      }
    } catch {
      // Best-effort cross-check only — a details-lookup failure doesn't
      // disqualify the candidate, it just means we fall back to the
      // text-search confidence score alone.
    }
  }

  const confident = domainConfirmed || top.confidence >= 75;
  if (!confident) return { matched: false, reason: "no_confident_match", topCandidateConfidence: top.confidence };
  return { matched: true, placeId: top.placeId, confidence: top.confidence, domainConfirmed };
}

export type OnboardingPipelineResult = {
  automationReady: boolean;
  components: Awaited<ReturnType<typeof getAllComponentStates>>;
};

/**
 * Runs (or resumes) the shared onboarding pipeline for one business. Safe
 * to call repeatedly. `source` is recorded on the business_identity
 * component for auditability (which entry point triggered this run).
 */
export async function runOnboardingPipeline(
  businessId: string,
  source: "stripe_checkout" | "house_account_canary" | "worker_retry",
  options?: { forceRescan?: boolean },
): Promise<OnboardingPipelineResult> {
  const forceRescan = options?.forceRescan ?? false;
  const db = getDb();
  if (!db) return { automationReady: false, components: await getAllComponentStates(businessId) };

  const [biz] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      placeId: businesses.placeId,
      website: businesses.website,
      address: businesses.address,
      phone: businesses.phone,
      vertical: businesses.vertical,
      primaryCategory: businesses.primaryCategory,
      focusArea: businesses.focusArea,
      businessModel: businesses.businessModel,
      planTier: businesses.planTier,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) {
    return { automationReady: false, components: await getAllComponentStates(businessId) };
  }

  // 1. business_identity — the business row existing IS this component;
  // nothing to do beyond recording that onboarding started.
  const identityState = await getComponentStatus(businessId, "business_identity");
  if (!isDone(identityState?.status)) {
    await setComponentStatus(businessId, "business_identity", "complete", { source });
  }

  // 3. place_identity — resolve BEFORE the scan, since the scan's shape
  // (place-based vs website-only) depends on it. `resolvedPlaceId` starts as
  // whatever's already on the freshly-queried business row — if a PRIOR
  // pipeline run auto-matched a place, that write already landed in
  // `businesses.placeId`, so this naturally picks it up on resume without
  // needing to re-derive it from the component's stored detail payload.
  let resolvedPlaceId = biz.placeId;
  const placeState = await getComponentStatus(businessId, "place_identity");
  if (!isDone(placeState?.status)) {
    if (biz.placeId) {
      await setComponentStatus(businessId, "place_identity", "complete", { source: "already_on_file" });
    } else if (!biz.website && !biz.address) {
      // Nothing to search with — not a transient failure, don't retry forever.
      await setComponentStatus(businessId, "place_identity", "needs_customer_action", { reason: "no_name_or_website_to_search" });
    } else {
      const resolution = await resolvePlaceIdentity({ name: biz.name, website: biz.website, address: biz.address });
      if (resolution.matched) {
        await db.update(businesses).set({ placeId: resolution.placeId }).where(eq(businesses.id, businessId));
        resolvedPlaceId = resolution.placeId;
        await setComponentStatus(businessId, "place_identity", "complete", {
          source: "auto_matched",
          confidence: resolution.confidence,
          domainConfirmed: resolution.domainConfirmed,
        });
      } else {
        await setComponentStatus(businessId, "place_identity", "needs_customer_action", {
          reason: resolution.reason,
          topCandidateConfidence: resolution.topCandidateConfidence,
        });
      }
    }
  }

  // 2 + 4 + 5 + 9. website_crawl / competitor_baseline / ranking_baseline /
  // score_snapshot — bundled into one real scan call (see file header).
  const [existingSnapshot] = await db
    .select({ id: visibilitySnapshots.id })
    .from(visibilitySnapshots)
    .where(eq(visibilitySnapshots.businessId, businessId))
    .limit(1);

  const scanState = await getComponentStatus(businessId, "website_crawl");
  if (existingSnapshot && !forceRescan) {
    if (!isDone(scanState?.status)) {
      await setComponentStatus(businessId, "website_crawl", "complete", { source: "existing_snapshot" });
      await setComponentStatus(businessId, "score_snapshot", "complete", { source: "existing_snapshot" });
    }
    // Competitor/ranking status reflects whatever place resolution achieved.
    // Deliberately re-evaluated on every call while not yet `complete` —
    // including while sitting at `needs_customer_action` — so a place match
    // that resolves on a LATER call (retry, or the customer manually
    // attaches one) flips these to complete without needing a separate
    // re-check path. Self-healing per the reliability requirement, not a
    // one-shot decision.
    const competitorState = await getComponentStatus(businessId, "competitor_baseline");
    const rankingState = await getComponentStatus(businessId, "ranking_baseline");
    if (!isDone(competitorState?.status)) {
      await setComponentStatus(
        businessId,
        "competitor_baseline",
        resolvedPlaceId ? "complete" : "needs_customer_action",
        resolvedPlaceId ? { source: "existing_snapshot" } : { reason: "waiting_for_business_match" },
      );
    }
    if (!isDone(rankingState?.status)) {
      await setComponentStatus(
        businessId,
        "ranking_baseline",
        resolvedPlaceId ? "complete" : "needs_customer_action",
        resolvedPlaceId ? { source: "existing_snapshot" } : { reason: "waiting_for_business_match" },
      );
    }
  } else if (!biz.placeId && !resolvedPlaceId && !biz.website) {
    await setComponentStatus(businessId, "website_crawl", "needs_customer_action", { reason: "no_website_or_place" });
    await setComponentStatus(businessId, "score_snapshot", "needs_customer_action", { reason: "no_website_or_place" });
    await setComponentStatus(businessId, "competitor_baseline", "needs_customer_action", { reason: "no_website_or_place" });
    await setComponentStatus(businessId, "ranking_baseline", "needs_customer_action", { reason: "no_website_or_place" });
  } else if (scanState?.status === "failed" && !forceRescan) {
    // Terminal after 3 attempts — do not keep silently re-attempting and
    // burning API quota forever. Stays visibly `failed` until a human
    // intervenes (or a house-account forceRescan explicitly overrides it).
  } else {
    await setComponentStatus(businessId, "website_crawl", "running", {});
    try {
      const city = cityFromAddress(biz.address);
      const vertical = (biz.vertical as Parameters<typeof generateReportFromPlace>[0]["vertical"]) ?? "other";
      const usePlace = resolvedPlaceId ?? biz.placeId;
      const generated = usePlace
        ? await generateReportFromPlace({ placeId: usePlace, vertical, query: biz.name, locationHint: city })
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
        selectedPlaceId: usePlace ?? undefined,
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

      await setComponentStatus(businessId, "website_crawl", "complete", { publicId });
      await setComponentStatus(businessId, "score_snapshot", "complete", { publicId });
      // Website-only (no place resolved): do NOT fabricate competitor/ranking
      // data — generateReportFromWebsite genuinely returns none of it.
      if (usePlace) {
        await setComponentStatus(businessId, "competitor_baseline", "complete", { publicId, placeId: usePlace });
        await setComponentStatus(businessId, "ranking_baseline", "complete", { publicId, placeId: usePlace });
      } else {
        await setComponentStatus(businessId, "competitor_baseline", "needs_customer_action", { reason: "waiting_for_business_match" });
        await setComponentStatus(businessId, "ranking_baseline", "needs_customer_action", { reason: "waiting_for_business_match" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Use `scanState` captured at the TOP of this function, before this
      // call's own "running" write — reading getComponentStatus again here
      // would just return that "running" marker (attempt-less) and the
      // count would never advance, letting a permanently-broken business
      // retry forever instead of ever reaching `failed`.
      const { status, attempt } = nextRetryStatus(scanState?.detail);
      await setComponentStatus(businessId, "website_crawl", status, { error: message, attempt });
      await setComponentStatus(businessId, "score_snapshot", status, { error: message, attempt });
    }
  }

  // 6. ai_visibility_baseline — best-effort, bounded retry.
  const aiState = await getComponentStatus(businessId, "ai_visibility_baseline");
  if (!isDone(aiState?.status) && aiState?.status !== "failed") {
    try {
      const city = cityFromAddress(biz.address);
      const checks = await checkBusinessVisibilityInAI({ businessName: biz.name, city, vertical: biz.vertical ?? null });
      if (checks.length > 0) {
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
        await setComponentStatus(businessId, "ai_visibility_baseline", "complete", { probesRun: checks.length });
      } else {
        const { status, attempt } = nextRetryStatus(aiState?.detail);
        await setComponentStatus(businessId, "ai_visibility_baseline", status, { reason: "no_probe_results", attempt });
      }
    } catch (err) {
      const { status, attempt } = nextRetryStatus(aiState?.detail);
      await setComponentStatus(businessId, "ai_visibility_baseline", status, { error: err instanceof Error ? err.message : String(err), attempt });
    }
  }

  // 7. citation_baseline — real audit, run immediately at onboarding rather
  // than waiting for the recurring batch to reach this business. Bounded retry.
  const citationState = await getComponentStatus(businessId, "citation_baseline");
  if (!isDone(citationState?.status) && citationState?.status !== "failed") {
    try {
      const result = await runCitationAuditForBusiness({
        id: biz.id,
        name: biz.name,
        address: biz.address,
        phone: biz.phone,
        website: biz.website,
        primaryCategory: biz.primaryCategory,
        vertical: biz.vertical,
        planTier: biz.planTier,
      });
      await setComponentStatus(businessId, "citation_baseline", "complete", { tasksCreated: result.tasksCreated });
    } catch (err) {
      const { status, attempt } = nextRetryStatus(citationState?.detail);
      await setComponentStatus(businessId, "citation_baseline", status, { error: err instanceof Error ? err.message : String(err), attempt });
    }
  }

  // 8. gbp_integration_status — never blocks readiness; honestly reflects
  // whether Google is connected, with a customer action available if not.
  // Re-checked on every call (cheap, one indexed lookup) rather than frozen
  // at "needs_customer_action" forever, so connecting Google later is
  // reflected the next time this pipeline runs (worker sweep or otherwise).
  const gbpState = await getComponentStatus(businessId, "gbp_integration_status");
  if (!isDone(gbpState?.status)) {
    const [conn] = await db
      .select({ id: googleOauthConnections.id })
      .from(googleOauthConnections)
      .where(eq(googleOauthConnections.businessId, businessId))
      .limit(1);
    await setComponentStatus(
      businessId,
      "gbp_integration_status",
      conn ? "complete" : "needs_customer_action",
      conn ? { connected: true } : { connected: false, reason: "not_connected" },
    );
  }

  // 10. recurring_scheduled — bounded retry.
  const recurringState = await getComponentStatus(businessId, "recurring_scheduled");
  if (!isDone(recurringState?.status) && recurringState?.status !== "failed") {
    try {
      const tier = normalizePlanTierFromDb(biz.planTier);
      if (tier === "free") {
        await setComponentStatus(businessId, "recurring_scheduled", "not_applicable", { reason: "free_tier" });
      } else {
        await scheduleRecurringSnapshotJob({ businessId, runAfterMs: 0, type: tier === "pro" || tier === "agency" ? "pro_recurring_refresh" : "entry_monthly_refresh" });
        await schedulePlanRecurringSnapshotJob({ businessId, planTier: tier });
        await setComponentStatus(businessId, "recurring_scheduled", "complete", { planTier: tier });
      }
    } catch (err) {
      const { status, attempt } = nextRetryStatus(recurringState?.detail);
      await setComponentStatus(businessId, "recurring_scheduled", status, { error: err instanceof Error ? err.message : String(err), attempt });
    }
  }

  // 11. automation_ready — final rollup. Only required components gate this;
  // needs_customer_action components (place/competitor/ranking/GBP) don't.
  const states = await getAllComponentStates(businessId);
  const allRequiredDone = REQUIRED_FOR_READY.every((c) => isDone(states[c]?.status));
  const anyRequiredFailed = REQUIRED_FOR_READY.some((c) => states[c]?.status === "failed");
  const readyStatus = anyRequiredFailed ? "failed" : allRequiredDone ? "complete" : "pending";
  const currentReady = await getComponentStatus(businessId, "automation_ready");
  if (currentReady?.status !== readyStatus) {
    await setComponentStatus(businessId, "automation_ready", readyStatus, {
      requiredComponents: REQUIRED_FOR_READY,
      allRequiredDone,
    });
  }

  return { automationReady: readyStatus === "complete", components: await getAllComponentStates(businessId) };
}

/**
 * Runs house accounts (accountType='house' — Boating Chicago, League Pour,
 * etc., the /proof canaries) through the SAME shared pipeline a paying
 * customer's Stripe checkout triggers — no fabricated payment event, direct
 * call with source="house_account_canary". forceRescan:true because these
 * accounts already have historical visibilitySnapshots (they've been real
 * accounts for a while); a fresh baseline-v1-tagged scan is created
 * alongside that history rather than replacing it — recordScanRun only ever
 * inserts, it never deletes prior snapshots/reports.
 */
export async function runHouseAccountCanaryPipeline(): Promise<{ processed: number; ready: number; results: Array<{ businessId: string; name: string; automationReady: boolean }> }> {
  const db = getDb();
  if (!db) return { processed: 0, ready: 0, results: [] };

  const houseAccounts = await db
    .select({ id: businesses.id, name: businesses.name })
    .from(businesses)
    .where(eq(businesses.accountType, "house"));

  const results: Array<{ businessId: string; name: string; automationReady: boolean }> = [];
  let ready = 0;
  for (const biz of houseAccounts) {
    const result = await runOnboardingPipeline(biz.id, "house_account_canary", { forceRescan: true });
    results.push({ businessId: biz.id, name: biz.name, automationReady: result.automationReady });
    if (result.automationReady) ready++;
  }

  return { processed: houseAccounts.length, ready, results };
}

/** Sweeps paid businesses whose onboarding hasn't reached automation_ready and resumes them — the retry/self-heal safety net. */
export async function runOnboardingPipelineBatch(batchSize = 5): Promise<{ processed: number; ready: number }> {
  const db = getDb();
  if (!db) return { processed: 0, ready: 0 };

  const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];
  const paid = await db.select({ id: businesses.id, planTier: businesses.planTier }).from(businesses).limit(500);
  const candidates = paid.filter((b) => PAID_TIERS.includes(b.planTier ?? "")).map((b) => b.id);

  let processed = 0;
  let ready = 0;
  for (const businessId of candidates) {
    const readyState = await getComponentStatus(businessId, "automation_ready");
    if (readyState?.status === "complete") continue;
    if (processed >= batchSize) break;
    const result = await runOnboardingPipeline(businessId, "worker_retry");
    processed++;
    if (result.automationReady) ready++;
  }
  return { processed, ready };
}

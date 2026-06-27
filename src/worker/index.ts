/**
 * GravyBlock background worker — runs alongside the Next.js app on VPS.
 *
 * Start via PM2 (see ecosystem.config.js):
 *   pm2 start ecosystem.config.js
 *
 * Or standalone:
 *   npx tsx src/worker/index.ts
 *
 * What it does on each tick (every WORKER_INTERVAL_MS, default 15 min):
 *   1. Processes up to JOBS_PER_TICK pending recurring snapshot jobs
 *   2. For each active paid business with queued content, publishes one item
 *   3. Daily (8am UTC): sends owner report to chris@gravyblock.com
 *   4. Monday (9am UTC): sends weekly upsell emails to paid non-Agency subscribers
 *   5. Every tick: processes 7-day lead nurture drip for unconverted scan leads
 */

import { eq, and, inArray, gte, lte, count } from "drizzle-orm";
import { runPendingRecurringSnapshotJobs, executeContentPublishPath } from "@/lib/autopilot/executor";
import { getDb, businesses, contentQueue, jobs } from "@/lib/db";
import { queueContentForBusiness } from "@/lib/content-gen/queue-content";
import { sendDailyOwnerReport } from "@/lib/email/daily-owner-report";
import { sendWeeklyUpsellEmails } from "@/lib/email/weekly-upsell";
import { runLeadDripBatch } from "@/lib/email/lead-drip";
import { runOnboardingBatch } from "@/lib/email/onboarding";
import { runTestimonialRequestBatch } from "@/lib/email/testimonial-request";
import { runReviewRequestBatch } from "@/lib/email/review-request";
import { runAutoConfigBatch } from "@/lib/setup/auto-config";
import { runMonthlyDigestBatch } from "@/lib/email/monthly-digest";
import { runAbandonedCheckoutBatch } from "@/lib/email/abandoned-checkout";
import { runCitationAuditBatch } from "@/lib/citations/citation-audit";
import { runMultiPlatformReviewBatch } from "@/lib/reviews/platform-sync";
import { runLlmProbeBatch } from "@/lib/ai-visibility/llm-probes";
import { runBacklinkProspectBatch } from "@/lib/backlinks/prospect-finder";
import { runRepurposeBatch } from "@/lib/content-gen/repurpose";
import { runGbpQaOptimizerBatch } from "@/lib/gbp/qa-optimizer";
import { runDirectoryProfileBatch } from "@/lib/directories/profile-generator";
import { runRedditPostingBatch } from "@/lib/social/reddit-poster";
import { runFacebookPostingBatch } from "@/lib/social/facebook-poster";
import { runRankTrackingBatch } from "@/lib/seo/rank-tracker";
import { runLocalPackTrackingBatch } from "@/lib/seo/local-pack-tracker";
import { runOutreachBatch } from "@/lib/outreach/run-outreach-batch";
import { getTodaysOutreachTarget } from "@/lib/outreach/outreach-calendar";
import { runFollowupOutreachBatch } from "@/lib/outreach/run-followup-batch";
import { runBreakupOutreachBatch } from "@/lib/outreach/run-breakup-batch";
import { runGbpReviewReplyBatch } from "@/lib/gbp/review-responder";
import { ensureResendWebhookRegistered } from "@/lib/integrations/resend-setup";
import { runGbpPostBatch } from "@/lib/gbp/post-publisher";
import { runGbpPhotoUploadBatch } from "@/lib/gbp/photo-uploader";

const WORKER_INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 15 * 60 * 1000);
const JOBS_PER_TICK = Number(process.env.JOBS_PER_TICK ?? 5);
const CONTENT_PER_TICK = Number(process.env.CONTENT_PER_TICK ?? 3);

const CONTENT_GEN_PER_TICK = 3;
const PAID_TIERS_FOR_CONTENT = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];

async function processContentGeneration() {
  const db = getDb();
  if (!db) return;

  // Find paid businesses that currently have zero queued content items
  const allPaidBizIds = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(inArray(businesses.planTier, PAID_TIERS_FOR_CONTENT))
    .limit(100);

  if (allPaidBizIds.length === 0) return;

  // For each candidate, check their queue depth; collect those with none queued
  const candidates: string[] = [];
  for (const row of allPaidBizIds) {
    if (candidates.length >= CONTENT_GEN_PER_TICK) break;
    const [countRow] = await db
      .select({ count: count() })
      .from(contentQueue)
      .where(and(eq(contentQueue.businessId, row.id), eq(contentQueue.status, "queued")));
    if ((countRow?.count ?? 0) === 0) {
      candidates.push(row.id);
    }
  }

  for (const businessId of candidates) {
    try {
      const result = await queueContentForBusiness(businessId);
      if (result.queued > 0) {
        console.info("[worker] content generation queued", { businessId, queued: result.queued });
      }
    } catch (error) {
      console.error("[worker] content generation failed", {
        businessId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function processContentQueue() {
  const db = getDb();
  if (!db) return;

  const withQueued = await db
    .selectDistinct({ businessId: contentQueue.businessId })
    .from(contentQueue)
    .where(eq(contentQueue.status, "queued"))
    .limit(CONTENT_PER_TICK);

  const paidTiers = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];

  for (const row of withQueued) {
    if (!row.businessId) continue;
    const [biz] = await db
      .select({ planTier: businesses.planTier })
      .from(businesses)
      .where(and(eq(businesses.id, row.businessId), inArray(businesses.planTier, paidTiers)))
      .limit(1);
    if (!biz) continue;

    try {
      const result = await executeContentPublishPath(row.businessId);
      console.info("[worker] content publish", { businessId: row.businessId, ...result });
    } catch (error) {
      console.error("[worker] content publish failed", {
        businessId: row.businessId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function hasJobRunToday(jobType: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, jobType), gte(jobs.createdAt, todayStart)))
    .limit(1);
  return Boolean(row);
}

async function hasJobRunThisWeek(jobType: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const weekStart = new Date();
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay()); // Sunday
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, jobType), gte(jobs.createdAt, weekStart)))
    .limit(1);
  return Boolean(row);
}

async function recordWorkerJob(jobType: string, payload?: Record<string, unknown>) {
  const db = getDb();
  if (!db) return;
  await db.insert(jobs).values({ type: jobType, status: "completed", payload: payload ?? {} });
}

async function maybeSendDailyReport() {
  const nowHour = new Date().getUTCHours();
  if (nowHour < 8 || nowHour > 9) return; // only fire in the 8am UTC window
  if (await hasJobRunToday("daily_owner_report")) return;
  try {
    const ok = await sendDailyOwnerReport();
    if (ok) {
      await recordWorkerJob("daily_owner_report");
      console.info("[worker] daily owner report sent");
    }
  } catch (error) {
    console.error("[worker] daily report failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

async function maybeSendQuarterlyUpsell() {
  // Paid subscribers are NOT hard-sold. We nudge an upgrade at most once per
  // quarter, and only to tiers below Pro (handled inside sendWeeklyUpsellEmails
  // via NEXT_TIER, which is null for pro/agency). Non-subscribers are nurtured
  // through the separate lead-drip / abandoned-checkout flows instead.
  const now = new Date();
  if (now.getUTCDay() !== 1) return; // Monday only
  const nowHour = now.getUTCHours();
  if (nowHour < 9 || nowHour > 10) return; // 9am UTC window

  // Quarterly cadence: skip if we've run an upsell batch in the last 90 days.
  const db = getDb();
  if (db) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [recent] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.type, "quarterly_upsell_batch"), gte(jobs.createdAt, ninetyDaysAgo)))
      .limit(1);
    if (recent) return;
  }

  try {
    const result = await sendWeeklyUpsellEmails(); // targets below-Pro subscribers only
    await recordWorkerJob("quarterly_upsell_batch", result);
    console.info("[worker] quarterly upsell emails", result);
  } catch (error) {
    console.error("[worker] quarterly upsell failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

async function maybeSendMonthlyDigest() {
  const now = new Date();
  if (now.getUTCDate() !== 1) return; // 1st of month only
  const nowHour = now.getUTCHours();
  if (nowHour < 9 || nowHour > 10) return; // 9am UTC window
  if (await hasJobRunToday("monthly_digest_batch")) return;
  try {
    const result = await runMonthlyDigestBatch();
    if (result.sent > 0) {
      await recordWorkerJob("monthly_digest_batch", result);
      console.info("[worker] monthly digest emails sent", result);
    }
  } catch (error) {
    console.error("[worker] monthly digest failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

async function hasJobRunThisMonth(jobType: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, jobType), gte(jobs.createdAt, monthStart)))
    .limit(1);
  return Boolean(row);
}

async function maybeCitationAudit() {
  if (await hasJobRunThisMonth("citation_audit_batch")) return;
  try {
    const result = await runCitationAuditBatch(5);
    if (result.audited > 0) {
      await recordWorkerJob("citation_audit_batch", result);
      console.info("[worker] citation audit batch", result);
    }
  } catch (error) {
    console.error("[worker] citation audit failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Cold outreach — weekdays: 3 windows × up to 10 emails = up to 30/day
 *                 weekends: restaurants only, 2 windows × up to 10 = up to 20/day
 * Settings (paused, emailsPerBatch, etc.) are read from the DB via admin UI.
 */

// Weekend sends at 14:00/17:00 UTC = 10am/1pm ET — when restaurant owners check email
const WEEKEND_RESTAURANT_TARGETS = [
  { windowKey: "sat_morning",   day: 6, hour: 14, city: "Houston",   state: "TX", industry: "restaurant", industryLabel: "restaurant" },
  { windowKey: "sat_afternoon", day: 6, hour: 17, city: "Chicago",   state: "IL", industry: "restaurant", industryLabel: "restaurant" },
  { windowKey: "sun_morning",   day: 0, hour: 14, city: "Miami",     state: "FL", industry: "restaurant", industryLabel: "restaurant" },
  { windowKey: "sun_afternoon", day: 0, hour: 17, city: "Nashville", state: "TN", industry: "restaurant", industryLabel: "restaurant" },
];

async function runColdOutreachWindow(
  windowKey: string,
  calendarOffset: number,
  hour: number,
  overrideTarget?: { city: string; state: string; industry: string; industryLabel: string },
  emailsPerBatch = 8,
) {
  const now = new Date();
  if (now.getUTCHours() < hour || now.getUTCHours() > hour + 1) return;
  if (await hasJobRunToday(`cold_outreach_${windowKey}`)) return;

  let target: { city: string; state: string; industry: string; industryLabel: string };
  if (overrideTarget) {
    target = overrideTarget;
  } else {
    const { OUTREACH_CALENDAR } = await import("@/lib/outreach/outreach-calendar");
    const slot = ((now.getUTCDate() - 1 + calendarOffset) % 30);
    target = OUTREACH_CALENDAR[slot]!;
  }

  try {
    const result = await runOutreachBatch({
      city: target.city,
      state: target.state,
      industry: target.industry,
      industryLabel: target.industryLabel,
      maxEmails: emailsPerBatch,
    });
    await recordWorkerJob(`cold_outreach_${windowKey}`, { ...result, ...target, window: windowKey });
    await recordWorkerJob("cold_outreach_batch", { ...result, ...target, window: windowKey });
    console.info(`[worker] cold outreach [${windowKey}]`, { sent: result.sent, target: `${target.industry} in ${target.city}` });
  } catch (error) {
    console.error(`[worker] cold outreach [${windowKey}] failed`, {
      error: error instanceof Error ? error.message : String(error), target,
    });
  }
}

async function maybeSendColdOutreach() {
  // Read settings from DB (admin-controlled)
  const { getOutreachSettings } = await import("@/app/admin/(dashboard)/outreach/actions");
  const settings = await getOutreachSettings().catch(() => ({
    emailsPerBatch: 13, paused: false, weekdayEnabled: true, weekendRestaurantsEnabled: true,
  }));

  if (settings.paused) return;

  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 6=Sat

  // ── WEEKDAYS: 4 windows hitting different city+industry combos ──
  // 4 × 13 = ~52 emails/day on weekdays
  // Windows in UTC chosen to land in US business hours:
  // 13:00 UTC = 9am ET / 6am PT · 15:00 = 11am ET / 8am PT
  // 17:00 = 1pm ET / 10am PT  · 19:00 = 3pm ET / 12pm PT
  if (settings.weekdayEnabled && day >= 1 && day <= 5) {
    await runColdOutreachWindow("morning",   0, 13,  undefined, settings.emailsPerBatch);
    await runColdOutreachWindow("midday",   10, 15,  undefined, settings.emailsPerBatch);
    await runColdOutreachWindow("afternoon",20, 17,  undefined, settings.emailsPerBatch);
    await runColdOutreachWindow("evening",   5, 19,  undefined, settings.emailsPerBatch);
  }

  // ── WEEKENDS: restaurants only ──
  if (settings.weekendRestaurantsEnabled && (day === 0 || day === 6)) {
    for (const wt of WEEKEND_RESTAURANT_TARGETS) {
      if (wt.day === day) {
        await runColdOutreachWindow(wt.windowKey, 0, wt.hour, wt, settings.emailsPerBatch);
      }
    }
  }
}

async function maybeSendReviewRequests() {
  const now = new Date();
  if (now.getUTCDay() !== 3) return; // Wednesday only
  const nowHour = now.getUTCHours();
  if (nowHour < 10 || nowHour > 11) return; // 10am UTC window
  if (await hasJobRunThisWeek("review_request_batch")) return;
  try {
    const result = await runReviewRequestBatch();
    if (result.sent > 0) {
      await recordWorkerJob("review_request_batch", result);
      console.info("[worker] review request emails sent", result);
    }
  } catch (error) {
    console.error("[worker] review request batch failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

async function ensureSelfBusinessQueued() {
  // If GravyBlock is registered as its own customer, make sure it always has content queued
  const selfId = process.env.GRAVYBLOCK_SELF_BUSINESS_ID;
  if (!selfId) return;
  const db = getDb();
  if (!db) return;
  try {
    const [countRow] = await db
      .select({ count: count() })
      .from(contentQueue)
      .where(and(eq(contentQueue.businessId, selfId), eq(contentQueue.status, "queued")));
    if ((countRow?.count ?? 0) === 0) {
      const result = await queueContentForBusiness(selfId);
      if (result.queued > 0) {
        console.info("[worker] self-business content queued", { queued: result.queued });
      }
    }
  } catch (err) {
    console.error("[worker] self-business queue failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

async function tick() {
  const startedAt = new Date().toISOString();
  console.info("[worker] tick start", { startedAt, jobsPerTick: JOBS_PER_TICK });

  try {
    const snapshotResult = await runPendingRecurringSnapshotJobs(JOBS_PER_TICK);
    console.info("[worker] snapshot jobs", snapshotResult);
  } catch (error) {
    console.error("[worker] snapshot jobs failed", { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const autoConfigResult = await runAutoConfigBatch(3);
    if (autoConfigResult.configured > 0) {
      console.info("[worker] auto-config generated", autoConfigResult);
    }
  } catch (error) {
    console.error("[worker] auto-config failed", { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    await ensureSelfBusinessQueued();
  } catch (error) {
    console.error("[worker] self-business failed", { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    await processContentGeneration();
  } catch (error) {
    console.error("[worker] content generation failed", { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    await processContentQueue();
  } catch (error) {
    console.error("[worker] content queue failed", { error: error instanceof Error ? error.message : String(error) });
  }

  await maybeSendDailyReport();
  await maybeSendMonthlyDigest();
  await maybeSendQuarterlyUpsell();
  await maybeSendReviewRequests();
  await maybeSendColdOutreach();

  // Follow-up email (#2): free trial offer to prospects who got email #1 3-21 days ago
  // Runs once per day at 14:00 UTC (10am ET / 7am PT)
  if (new Date().getUTCHours() === 14 && !(await hasJobRunToday("followup_outreach_batch"))) {
    try {
      const followupResult = await runFollowupOutreachBatch(40);
      if (followupResult.sent > 0) {
        await recordWorkerJob("followup_outreach_batch", followupResult);
        console.info("[worker] followup outreach emails sent", followupResult);
      }
    } catch (error) {
      console.error("[worker] followup outreach failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Breakup email (#3): final "closing your file" touch, 5-30 days after email #2
  // Runs once per day at 16:00 UTC (12pm ET / 9am PT)
  if (new Date().getUTCHours() === 16 && !(await hasJobRunToday("breakup_outreach_batch"))) {
    try {
      const breakupResult = await runBreakupOutreachBatch(40);
      if (breakupResult.sent > 0) {
        await recordWorkerJob("breakup_outreach_batch", breakupResult);
        console.info("[worker] breakup outreach emails sent", breakupResult);
      }
    } catch (error) {
      console.error("[worker] breakup outreach failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  await maybeCitationAudit();

  try {
    const reviewResult = await runMultiPlatformReviewBatch(5);
    if (reviewResult.newReviews > 0) {
      console.info("[worker] multi-platform review sync", reviewResult);
    }
  } catch (error) {
    console.error("[worker] review sync failed", { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const probeResult = await runLlmProbeBatch(2);
    if (probeResult.ran > 0) {
      console.info("[worker] llm probes", probeResult);
    }
  } catch (error) {
    console.error("[worker] llm probes failed", { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const backlinkResult = await runBacklinkProspectBatch(2);
    if (backlinkResult.totalFound > 0) {
      console.info("[worker] backlink prospects", backlinkResult);
    }
  } catch (error) {
    console.error("[worker] backlink prospect failed", { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const repurposeResult = await runRepurposeBatch(5);
    if (repurposeResult.queued > 0) {
      console.info("[worker] content repurpose", repurposeResult);
    }
  } catch (error) {
    console.error("[worker] content repurpose failed", { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const gbpQaResult = await runGbpQaOptimizerBatch(3);
    if (gbpQaResult.processed > 0) {
      console.info("[worker] gbp qa optimizer", gbpQaResult);
    }
  } catch (error) {
    console.error("[worker] gbp qa optimizer failed", { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const reviewReplyResult = await runGbpReviewReplyBatch(5);
    if (reviewReplyResult.replied > 0) {
      console.info("[worker] gbp review replies", reviewReplyResult);
    }
  } catch (error) {
    console.error("[worker] gbp review replies failed", { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const gbpPostResult = await runGbpPostBatch(3);
    if (gbpPostResult.posted > 0) {
      console.info("[worker] gbp posts published", gbpPostResult);
    }
  } catch (error) {
    console.error("[worker] gbp posts failed", { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const photoResult = await runGbpPhotoUploadBatch(3);
    if (photoResult.uploaded > 0) {
      console.info("[worker] gbp photos uploaded", photoResult);
    }
  } catch (error) {
    console.error("[worker] gbp photo upload failed", { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const dirResult = await runDirectoryProfileBatch(3);
    if (dirResult.processed > 0) {
      console.info("[worker] directory profiles", dirResult);
    }
  } catch (error) {
    console.error("[worker] directory profiles failed", { error: error instanceof Error ? error.message : String(error) });
  }

  // IndexNow — notify Bing/Yandex of GravyBlock's content once/day (helps AI search)
  if (new Date().getUTCHours() === 6 && !(await hasJobRunToday("indexnow_gravyblock"))) {
    try {
      const { getAllBlogPosts } = await import("@/lib/blog/posts");
      const { pingIndexNowForGravyblock } = await import("@/lib/integrations/indexnow");
      const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
      const urls = [
        `${site}/`, `${site}/pricing`, `${site}/scan`, `${site}/tools`,
        `${site}/blog`, `${site}/compare`, `${site}/glossary`, `${site}/guides`,
        ...getAllBlogPosts().map((p) => `${site}/blog/${p.slug}`),
      ];
      const ok = await pingIndexNowForGravyblock(urls);
      await recordWorkerJob("indexnow_gravyblock", { urls: urls.length, ok });
      if (ok) console.info("[worker] IndexNow ping sent", { urls: urls.length });
    } catch (error) {
      console.error("[worker] IndexNow ping failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  try {
    const dripResult = await runLeadDripBatch();
    if (dripResult.sent > 0) {
      console.info("[worker] lead drip emails sent", dripResult);
    }
  } catch (error) {
    console.error("[worker] lead drip failed", { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const abandonedResult = await runAbandonedCheckoutBatch();
    if (abandonedResult.sent > 0) {
      console.info("[worker] abandoned checkout emails sent", abandonedResult);
    }
  } catch (error) {
    console.error("[worker] abandoned checkout failed", { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const onboardResult = await runOnboardingBatch();
    if (onboardResult.sent > 0) {
      console.info("[worker] onboarding emails sent", onboardResult);
    }
  } catch (error) {
    console.error("[worker] onboarding batch failed", { error: error instanceof Error ? error.message : String(error) });
  }

  // Testimonial request — once/day, to paid customers ~3 weeks in
  if (new Date().getUTCHours() === 17 && !(await hasJobRunToday("testimonial_request_batch"))) {
    try {
      const tResult = await runTestimonialRequestBatch(10);
      if (tResult.sent > 0) {
        await recordWorkerJob("testimonial_request_batch", tResult);
        console.info("[worker] testimonial requests sent", tResult);
      }
    } catch (error) {
      console.error("[worker] testimonial request failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  try {
    const redditResult = await runRedditPostingBatch();
    if (redditResult.posted > 0) {
      console.info("[worker] reddit posts published", redditResult);
    }
  } catch (error) {
    console.error("[worker] reddit posting failed", { error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const fbResult = await runFacebookPostingBatch();
    if (fbResult.posted > 0) {
      console.info("[worker] facebook/instagram posts published", fbResult);
    }
  } catch (error) {
    console.error("[worker] facebook posting failed", { error: error instanceof Error ? error.message : String(error) });
  }

  // GSC rank tracking — runs once per day
  if (!(await hasJobRunToday("rank_tracking_batch"))) {
    try {
      const rankResult = await runRankTrackingBatch(10);
      if (rankResult.synced > 0) {
        await recordWorkerJob("rank_tracking_batch", rankResult);
        console.info("[worker] rank tracking synced", rankResult);
      }
    } catch (error) {
      console.error("[worker] rank tracking failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // DataForSEO local pack tracking — real Maps Pack rank data, runs weekly
  if (new Date().getUTCDay() === 2 && !(await hasJobRunToday("local_pack_tracking_batch"))) { // Tuesday
    try {
      const packResult = await runLocalPackTrackingBatch(5);
      if (packResult.synced > 0) {
        await recordWorkerJob("local_pack_tracking_batch", packResult);
        console.info("[worker] local pack tracking", packResult);
      }
    } catch (error) {
      console.error("[worker] local pack tracking failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  console.info("[worker] tick done", { durationMs: Date.now() - new Date(startedAt).getTime() });
}

// One-time startup tasks
void ensureResendWebhookRegistered().catch(() => null);

void tick();
setInterval(() => void tick(), WORKER_INTERVAL_MS);

console.info("[worker] started", {
  intervalMs: WORKER_INTERVAL_MS,
  jobsPerTick: JOBS_PER_TICK,
  contentPerTick: CONTENT_PER_TICK,
});

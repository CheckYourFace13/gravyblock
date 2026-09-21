import { recordProof } from "@/lib/proof/ledger";
import { markdownToHtml, wordCount } from "@/lib/site-publish/markdown";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  aiVisibilityChecks,
  backlinkOpportunities,
  businesses,
  contentQueue,
  getDb,
  jobs,
  leads,
  operatorTasks,
  publishedContent,
  publishingJobs,
  publishingTargets,
  reports,
  visibilitySnapshots,
} from "@/lib/db";
import { sendAutomationSummaryEmail } from "@/lib/integrations/resend";
import { planTruthGroundedContent } from "./content-planner";
import { ensureFreshTruth } from "@/lib/truth";
import { safeFetchText } from "@/lib/net/safe-fetch";
import { publishToWordPress, type WordPressConfig } from "@/lib/integrations/wordpress";
import { publishToWebflow, extractWebflowConfig } from "@/lib/publishing/adapters/webflow";
import { publishToShopify, extractShopifyConfig } from "@/lib/publishing/adapters/shopify";
import { planFeatures, normalizePlanTierFromDb, type PlanTier } from "@/lib/plans";
import { getGooglePlaceDetails } from "@/lib/integrations/google-places";
import { runSiteCrawlAudit } from "@/lib/audit/site-crawl";
import { syncBusinessIssues } from "@/lib/audit/issue-tracker";
import type { WebsiteAuditFinding, WebsiteAuditSummary } from "@/lib/report/types";
import { buildSocialPresence } from "@/lib/social/discover";
import { generateArticleBody, generateLocalPageBody, generateMetaTags } from "@/lib/content/generator";
import { addInternalLinks } from "@/lib/content/internal-linker";
import { getArticlePhoto } from "@/lib/integrations/unsplash";
import { businessConfigs } from "@/lib/db";
import { buildSchemaScriptBlock, injectSchemaIntoHtml } from "@/lib/publishing/inject-schema";
import { checkBusinessVisibilityInAI } from "@/lib/integrations/perplexity";
import { containsPlaceholderArtifact } from "@/lib/content-gen/quality-guard";
import { pingIndexNowForGravyblock } from "@/lib/integrations/indexnow";
import { getGeoAuditScore } from "@/lib/audit/geo-audit";
import { computeAeoScore } from "@/lib/scoring/aeo-score";
import {
  computeVisibilityScore,
  computeOptimizationHealthScore,
  SCORE_METHOD_VERSION,
} from "@/lib/scoring/visibility-score";
import type { ReportPayload } from "@/lib/report/types";

type AutomationRunProfile = {
  aiChecks: number;
  contentIdeas: number;
  actionItems: number;
  citationTasks: number;
  reviewTasks: number;
  backlinkOpportunities: number;
  drafts: number;
  publishingJobs: number;
  localPages: number;
  outreachDrafts: number;
};

function levelForScore(score: number) {
  if (score >= 78) return "low";
  if (score >= 62) return "medium";
  return "high";
}

/**
 * Pulls the last known search-visibility / local-ranking measurements out of
 * this business's original scan report (reports.payload, the same
 * ReportPayload the initial free scan produced). These are real, previously
 * observed signals — a GSC-verified position or a modeled local-rank
 * estimate — not re-verified every recurring cycle (that would mean
 * re-running the rank estimator's live Places queries on every refresh,
 * which this cycle does not do), so they're surfaced as "last known," not
 * "just measured." Returns nulls (not measured) if there's no report to read.
 */
async function lastKnownSearchAndRankSignals(
  db: NonNullable<ReturnType<typeof getDb>>,
  reportId: string | null,
): Promise<{
  searchVisibilityPoints: number | null;
  searchVisibilitySource: "search_console_verified" | "estimated_rank" | null;
  localRankingPoints: number | null;
}> {
  if (!reportId) return { searchVisibilityPoints: null, searchVisibilitySource: null, localRankingPoints: null };
  const [row] = await db.select({ payload: reports.payload }).from(reports).where(eq(reports.id, reportId)).limit(1);
  const payload = row?.payload as ReportPayload | undefined;
  if (!payload) return { searchVisibilityPoints: null, searchVisibilitySource: null, localRankingPoints: null };

  const searchSection = payload.sections?.find((s) => s.key === "searchVisibility") ?? null;
  const rankSection = payload.sections?.find((s) => s.key === "localRankingSignals") ?? null;
  const verified = payload.searchVisibility?.verified ?? false;

  return {
    searchVisibilityPoints: searchSection?.score ?? null,
    searchVisibilitySource: searchSection ? (verified ? "search_console_verified" : "estimated_rank") : null,
    localRankingPoints: rankSection?.score ?? null,
  };
}

function recurringJobTypeForPlan(tier: PlanTier) {
  if (tier === "pro" || tier === "agency") return "pro_recurring_refresh";
  return "entry_monthly_refresh";
}

function profileForJobType(jobType: string): AutomationRunProfile {
  if (jobType === "pro_recurring_refresh") {
    return {
      // 3 real engines are queried per monthly probe cycle (see
      // checkBusinessVisibilityInAI) — keep all 3 results, not just one.
      aiChecks: 3,
      contentIdeas: 3,
      actionItems: 3,
      citationTasks: 4,
      reviewTasks: 2,
      backlinkOpportunities: 4,
      drafts: 2,
      publishingJobs: 2,
      localPages: 1,
      outreachDrafts: 2,
    };
  }
  return {
    // 3 real engines are queried per monthly probe cycle (see
    // checkBusinessVisibilityInAI) — keep all 3 results, not just one.
    aiChecks: 3,
    contentIdeas: 4,
    actionItems: 3,
    citationTasks: 4,
    reviewTasks: 2,
    backlinkOpportunities: 4,
    drafts: 2,
    publishingJobs: 2,
    localPages: 0,
    outreachDrafts: 2,
  };
}

type RefreshSignals = {
  websiteTitle: string | null;
  websiteHasCta: boolean;
  websiteHasLocationClarity: boolean;
  placeRating: number | null;
  placeReviewCount: number | null;
  socialProfileCount: number;
  auditFindings: WebsiteAuditFinding[];
  websiteAudit: WebsiteAuditSummary;
};

async function refreshPublicSignals(input: {
  placeId: string | null;
  website: string | null;
}): Promise<RefreshSignals | null> {
  try {
    let placeRating: number | null = null;
    let placeReviewCount: number | null = null;
    let website = input.website;
    if (input.placeId) {
      const place = await getGooglePlaceDetails(input.placeId);
      website = website ?? place.website ?? null;
      placeRating = typeof place.rating === "number" ? place.rating : null;
      placeReviewCount = typeof place.reviewCount === "number" ? place.reviewCount : null;
    }
    const crawl = await runSiteCrawlAudit(website ?? undefined);
    const titleMatch = crawl.homepage?.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const homepageTitle = titleMatch?.[1]?.replace(/\s+/g, " ").trim() ?? null;
    const social = buildSocialPresence({
      primaryWebsite: website ?? undefined,
      html: crawl.homepage?.html,
      finalUrl: crawl.homepage?.finalUrl,
      fetchNotes: crawl.homepage
        ? undefined
        : crawl.audit.findings.find((f) => f.key === "crawl-error" || f.key === "crawl-no-website")?.detail,
    });
    return {
      websiteTitle: homepageTitle,
      websiteHasCta: crawl.audit.signals.ctaClarity,
      websiteHasLocationClarity: crawl.audit.signals.locationClarity,
      placeRating,
      placeReviewCount,
      socialProfileCount: social.profiles.length,
      auditFindings: crawl.audit.findings,
      websiteAudit: crawl.audit,
    };
  } catch (error) {
    console.error("[autopilot] public refresh failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

function detectSignalChanges(
  previous: RefreshSignals | null,
  current: RefreshSignals | null,
): { changes: string[]; summary: string } {
  if (!current) {
    return {
      changes: [],
      summary: "Refresh completed, but change detection was limited due to unavailable public fetch signals.",
    };
  }
  if (!previous) {
    return {
      changes: [
        `Website title: ${current.websiteTitle ?? "not found"}`,
        `CTA clarity detected: ${current.websiteHasCta ? "yes" : "no"}`,
        `Location/service-area clarity detected: ${current.websiteHasLocationClarity ? "yes" : "no"}`,
        `Social profiles found: ${current.socialProfileCount}`,
        current.placeReviewCount != null ? `Review count observed: ${current.placeReviewCount}` : "Review count unavailable",
      ],
      summary: "Initial automation refresh baseline captured from website, listing, and social footprint signals.",
    };
  }
  const changes: string[] = [];
  if (previous.websiteTitle !== current.websiteTitle) {
    changes.push(`Website title changed (${previous.websiteTitle ?? "none"} -> ${current.websiteTitle ?? "none"})`);
  }
  if (previous.websiteHasCta !== current.websiteHasCta) {
    changes.push(`CTA clarity changed (${previous.websiteHasCta ? "present" : "weak"} -> ${current.websiteHasCta ? "present" : "weak"})`);
  }
  if (previous.websiteHasLocationClarity !== current.websiteHasLocationClarity) {
    changes.push(
      `Location/service-area clarity changed (${previous.websiteHasLocationClarity ? "clear" : "unclear"} -> ${
        current.websiteHasLocationClarity ? "clear" : "unclear"
      })`,
    );
  }
  if (previous.socialProfileCount !== current.socialProfileCount) {
    changes.push(`Social profile coverage changed (${previous.socialProfileCount} -> ${current.socialProfileCount})`);
  }
  if (
    previous.placeReviewCount != null &&
    current.placeReviewCount != null &&
    previous.placeReviewCount !== current.placeReviewCount
  ) {
    changes.push(`Review count changed (${previous.placeReviewCount} -> ${current.placeReviewCount})`);
  }
  return {
    changes,
    summary: changes.length
      ? `Detected ${changes.length} meaningful public-footprint changes this run.`
      : "No major public-footprint changes detected in this refresh cycle.",
  };
}

function buildPublishBody(input: {
  title: string;
  changeSummary: string;
  changeSignals: string[];
  keyword: string | null;
  kind: string;
}) {
  return [
    `# ${input.title}`,
    "",
    "Generated and published automatically by GravyBlock recurring automation.",
    "",
    `Content type: ${input.kind}`,
    `Target keyword/topic: ${input.keyword ?? "local visibility cluster"}`,
    "",
    "## What changed this cycle",
    input.changeSignals.length ? input.changeSignals.map((x) => `- ${x}`).join("\n") : `- ${input.changeSummary}`,
    "",
    "## Story angle",
    "This asset focuses on current customer demand, local trust signals, and service-area relevance observed in the latest refresh.",
  ].join("\n");
}

function cityFromAddress(address: string | null | undefined): string {
  if (!address) return "your area";
  // "123 Main St, Austin, TX 78701" → "Austin"
  const parts = address.split(",");
  if (parts.length >= 2) return parts[1].trim();
  return address.trim();
}


export async function executeContentPublishPath(businessId: string) {
  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_URL is required for content execution path");
  }

  // Only website content is published here. Social/GBP kinds have their own
  // posters; the old query took the oldest queued row of ANY kind and
  // regenerated it as an article.
  const [queuedItem] = await db
    .select()
    .from(contentQueue)
    .where(and(eq(contentQueue.businessId, businessId), eq(contentQueue.status, "queued"), inArray(contentQueue.kind, ["article", "location_page"])))
    .orderBy(contentQueue.createdAt)
    .limit(1);

  if (!queuedItem) {
    return { ok: false, reason: "no_queued_content" as const };
  }

  // A real external destination is required: GravyBlock publishes to the
  // customer's OWN website. (It used to fall back to a noindex page on
  // gravyblock.com and count that as "published".)
  const [target] = await db
    .select()
    .from(publishingTargets)
    .where(
      and(
        eq(publishingTargets.businessId, businessId),
        eq(publishingTargets.active, "true"),
        inArray(publishingTargets.adapter, ["wordpress", "webflow", "shopify", "managed_feed"]),
      ),
    )
    .orderBy(publishingTargets.createdAt)
    .limit(1);

  if (!target || !target.config) {
    await db.update(contentQueue).set({ status: "awaiting_connection" }).where(eq(contentQueue.id, queuedItem.id));
    return { ok: false, reason: "no_publishing_target" as const, contentQueueId: queuedItem.id };
  }

  // Never write about the business from anything but verified first-party facts.
  const truth = await ensureFreshTruth(businessId);
  if (!truth.sufficient) {
    return { ok: false, reason: "insufficient_truth" as const, detail: truth.insufficientReason, contentQueueId: queuedItem.id };
  }

  await db.update(contentQueue).set({ status: "ready" }).where(eq(contentQueue.id, queuedItem.id));

  const publishJobId = randomUUID();
  await db.insert(publishingJobs).values({
    id: publishJobId,
    queueId: queuedItem.id,
    targetId: target.id,
    status: "pending",
    responseLog: "Publish attempt started by autopilot executor.",
  });

  const failItem = async (message: string) => {
    await db.update(contentQueue).set({ status: "failed" }).where(eq(contentQueue.id, queuedItem.id));
    await db.update(publishingJobs).set({ status: "failed", responseLog: message }).where(eq(publishingJobs.id, publishJobId));
  };

  try {
    const [biz] = await db
      .select({
        name: businesses.name,
        vertical: businesses.vertical,
        address: businesses.address,
        phone: businesses.phone,
        website: businesses.website,
        primaryCategory: businesses.primaryCategory,
        rating: businesses.rating,
        reviewCount: businesses.reviewCount,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);

    const [bizConfig] = await db
      .select({
        brandVoice: businessConfigs.brandVoice,
        serviceDescription: businessConfigs.serviceDescription,
        uniqueSellingPoints: businessConfigs.uniqueSellingPoints,
        tone: businessConfigs.tone,
        focusArea: businessConfigs.focusArea,
      })
      .from(businessConfigs)
      .where(eq(businessConfigs.businessId, businessId))
      .limit(1);

    // City comes only from verified facts; empty = write without naming a place.
    const generatorParams = {
      businessName: truth.businessName || biz?.name || "Local business",
      city: truth.verifiedCity ?? "",
      vertical: biz?.vertical && !/^other$/i.test(biz.vertical) ? biz.vertical : null,
      title: queuedItem.title,
      outline: queuedItem.outline ?? "",
      targetKeyword: queuedItem.targetKeyword ?? null,
      address: biz?.address ?? null,
      brandVoice: bizConfig?.brandVoice ?? null,
      serviceDescription: bizConfig?.serviceDescription ?? null,
      uniqueSellingPoints: bizConfig?.uniqueSellingPoints ?? null,
      tone: bizConfig?.tone ?? null,
      focusArea: bizConfig?.focusArea ?? "local",
      truthBlock: truth.promptBlock,
    };
    const aiBody = queuedItem.kind === "location_page"
      ? await generateLocalPageBody(generatorParams)
      : await generateArticleBody(generatorParams);
    if (!aiBody) {
      // Transient (model unavailable) — leave queued and retry next tick.
      await db.update(contentQueue).set({ status: "queued" }).where(eq(contentQueue.id, queuedItem.id));
      await db.update(publishingJobs).set({ status: "failed", responseLog: "AI generation returned nothing; will retry." }).where(eq(publishingJobs.id, publishJobId));
      return { ok: false, reason: "ai_generation_failed" as const };
    }
    if (containsPlaceholderArtifact(aiBody) || containsPlaceholderArtifact(queuedItem.title)) {
      await failItem("Rejected: output or title contained an unfilled placeholder.");
      return { ok: false, reason: "ai_generation_failed" as const };
    }
    // Substance gate: thin restatements of a site's own headings are not published anywhere.
    if (wordCount(aiBody) < 350) {
      await failItem(`Held: generated article too thin to publish (${wordCount(aiBody)} words).`);
      await db.insert(jobs).values({ businessId, type: "content_held_quality", status: "completed", payload: { title: queuedItem.title, words: wordCount(aiBody), reason: "too_thin" } });
      return { ok: false, reason: "ai_generation_failed" as const };
    }
    let body = aiBody;

    body = await addInternalLinks({ body, businessId, currentTitle: queuedItem.title }).catch(() => body);

    const metaTags = await generateMetaTags({
      title: queuedItem.title,
      body,
      targetKeyword: queuedItem.targetKeyword ?? null,
      businessName: generatorParams.businessName,
      city: truth.verifiedCity ?? "",
    }).catch(() => null);

    const photo = await getArticlePhoto(queuedItem.targetKeyword ?? queuedItem.title).catch(() => null);

    const artifactId = randomUUID();
    let publicUrl: string | null = null;
    let channel: "wordpress" | "webflow" | "shopify" | "managed_feed" | null = null;
    let publishError = "";

    const schemaBlock = buildSchemaScriptBlock({
      business: {
        name: generatorParams.businessName,
        address: biz?.address ?? null,
        phone: biz?.phone ?? null,
        website: biz?.website ?? null,
        vertical: biz?.vertical ?? null,
        primaryCategory: biz?.primaryCategory ?? null,
        rating: biz?.rating ?? null,
        reviewCount: biz?.reviewCount ?? null,
      },
      articleTitle: queuedItem.title,
      publishedAt: new Date(),
    });

    if (target.adapter === "wordpress") {
      const wpResult = await publishToWordPress({ config: target.config as unknown as WordPressConfig, title: queuedItem.title, body: injectSchemaIntoHtml(body, schemaBlock) });
      if (wpResult.ok) {
        publicUrl = wpResult.postUrl;
        channel = "wordpress";
      } else publishError = wpResult.error ?? "wordpress_publish_failed";
    } else if (target.adapter === "webflow") {
      const wfConfig = extractWebflowConfig(target.config);
      if (!wfConfig) publishError = "invalid_webflow_config";
      else {
        const wfResult = await publishToWebflow(wfConfig, { title: queuedItem.title, content: injectSchemaIntoHtml(body, schemaBlock) });
        if (wfResult.ok) {
          publicUrl = `https://webflow.com/item/${wfResult.itemId}`;
          channel = "webflow";
        } else publishError = wfResult.error ?? "webflow_publish_failed";
      }
    } else if (target.adapter === "shopify") {
      const sfConfig = extractShopifyConfig(target.config);
      if (!sfConfig) publishError = "invalid_shopify_config";
      else {
        const sfResult = await publishToShopify(sfConfig, { title: queuedItem.title, content: injectSchemaIntoHtml(body, schemaBlock) });
        if (sfResult.ok) {
          publicUrl = sfResult.url;
          channel = "shopify";
        } else publishError = sfResult.error ?? "shopify_publish_failed";
      }
    }

    if (target.adapter === "managed_feed") {
      const cfg = (target.config ?? {}) as { siteOrigin?: string; basePath?: string };
      if (!cfg.siteOrigin) publishError = "invalid_managed_feed_config";
      else {
        const slug = `${queuedItem.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)}-${artifactId.slice(0, 6)}`;
        publicUrl = `${cfg.siteOrigin.replace(/\/$/, "")}${cfg.basePath ?? "/insights"}/${slug}`;
        channel = "managed_feed";
        body = markdownToHtml(body);
      }
    }

    if (!channel || !publicUrl) {
      await failItem(`External publish failed: ${publishError || "unknown"}`);
      return { ok: false, reason: "publish_failed" as const, publishJobId, contentQueueId: queuedItem.id };
    }

    await db.insert(publishedContent).values({
      id: artifactId,
      businessId,
      locationId: queuedItem.locationId ?? null,
      queueId: queuedItem.id,
      title: queuedItem.title,
      body,
      channel,
      publicUrl,
      status: "published",
      metaTitle: metaTags?.metaTitle ?? null,
      metaDescription: metaTags?.metaDescription ?? null,
      coverImageUrl: photo?.url ?? null,
      coverImageCredit: photo?.credit ?? null,
    });
    await db.update(contentQueue).set({ status: "published" }).where(eq(contentQueue.id, queuedItem.id));

    // Verify the page is actually live on the customer's own domain — an API
    // "success" is not proof. Webflow item URLs are CMS admin URLs, not public pages.
    let verified = false;
    let verifiedStatus: number | null = null;
    if (channel !== "webflow") {
      // A connected first-party site pulls the signed feed on a short cache, so allow it a minute or two to show the page.
      const attempts = channel === "managed_feed" ? 6 : 1;
      for (let i = 0; i < attempts && !verified; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 20_000));
        const check = await safeFetchText(publicUrl, { timeoutMs: 10000 });
        verifiedStatus = check.ok ? check.status : null;
        verified = check.ok && check.status === 200 && (channel !== "managed_feed" || check.body.toLowerCase().includes((queuedItem.title.match(/[A-Za-z]{5,}/)?.[0] ?? "").toLowerCase()));
      }
    }
    await db
      .update(publishingJobs)
      .set({ status: "published", responseLog: `Published to ${publicUrl} (${channel}); live check: ${verified ? "HTTP 200 verified" : verifiedStatus ? `HTTP ${verifiedStatus}` : "not publicly verifiable"}` })
      .where(eq(publishingJobs.id, publishJobId));
    await db.insert(jobs).values({
      businessId,
      type: "content_publish_verified",
      status: verified ? "completed" : "unverified",
      payload: { publishedContentId: artifactId, publicUrl, channel, verified, httpStatus: verifiedStatus, title: queuedItem.title },
    });

    if (verified) {
      await recordProof({
        businessId,
        actionType: "content_published",
        engine: "content",
        proofCategory: "content",
        destination: publicUrl,
        summary: `GravyBlock published "${queuedItem.title}" to the business's own website (${channel}) and confirmed the page is live (HTTP 200).`,
        afterEvidence: { publicUrl, channel, httpStatus: verifiedStatus },
        dedupeKey: `content_published:${artifactId}`,
        findingType: "content",
      });
    }

    return { ok: true, publishJobId, contentQueueId: queuedItem.id, artifactId, publicUrl, verified };
  } catch (error) {
    await failItem(error instanceof Error ? error.message : "unknown publish failure");
    return { ok: false, reason: "publish_failed" as const, publishJobId, contentQueueId: queuedItem.id };
  }
}

export async function scheduleRecurringSnapshotJob(input: {
  businessId: string;
  runAfterMs?: number;
  type?: "entry_monthly_refresh" | "pro_recurring_refresh" | "recurring_snapshot_refresh";
}) {
  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_URL is required for recurring automation scheduling");
  }
  // Don't queue a second pending job if one already exists for this business.
  // Without this check, any double-run (race, restart, test account churn) causes
  // geometric job accumulation, sending multiple automation emails per cycle.
  const [existing] = await db
    .select({ id: jobs.id, runAfter: jobs.runAfter })
    .from(jobs)
    .where(
      and(
        eq(jobs.businessId, input.businessId),
        inArray(jobs.type, ["entry_monthly_refresh", "pro_recurring_refresh", "recurring_snapshot_refresh"]),
        eq(jobs.status, "pending"),
      ),
    )
    .limit(1);
  if (existing) {
    return { jobId: existing.id, runAfter: existing.runAfter?.toISOString() ?? null, skipped: true };
  }
  const runAfter = new Date(Date.now() + Math.max(0, input.runAfterMs ?? 0));
  const id = randomUUID();
  await db.insert(jobs).values({
    id,
    businessId: input.businessId,
    type: input.type ?? "recurring_snapshot_refresh",
    payload: { source: "manual_schedule", scheduledAt: new Date().toISOString() },
    status: "pending",
    runAfter,
  });
  return { jobId: id, runAfter: runAfter.toISOString(), skipped: false };
}

export async function schedulePlanRecurringSnapshotJob(input: { businessId: string; planTier: PlanTier }) {
  const feature = planFeatures(input.planTier);
  if (!feature.recurringRefresh || !feature.refreshIntervalDays) {
    return { scheduled: false as const };
  }
  const result = await scheduleRecurringSnapshotJob({
    businessId: input.businessId,
    runAfterMs: feature.refreshIntervalDays * 24 * 60 * 60 * 1000,
    type: recurringJobTypeForPlan(input.planTier),
  });
  return { scheduled: true as const, ...result };
}

export async function runPendingRecurringSnapshotJobs(limit = 10) {
  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_URL is required for recurring job execution");
  }

  const candidates = await db
    .select()
    .from(jobs)
    .where(
      and(
        inArray(jobs.type, ["recurring_snapshot_refresh", "entry_monthly_refresh", "pro_recurring_refresh"]),
        eq(jobs.status, "pending"),
        or(lte(jobs.runAfter, new Date()), isNull(jobs.runAfter)),
      ),
    )
    .orderBy(jobs.createdAt)
    .limit(limit * 5); // fetch extra so dedup doesn't starve the batch

  // One job per business per tick — prevents burst-sending when backlog builds up
  const seenBusinessIds = new Set<string>();
  const dueJobs = candidates.filter((job) => {
    if (!job.businessId || seenBusinessIds.has(job.businessId)) return false;
    seenBusinessIds.add(job.businessId);
    return true;
  }).slice(0, limit);

  const results: Array<{ jobId: string; businessId: string; snapshotId?: string; status: "completed" | "failed" }> = [];

  for (const job of dueJobs) {
    if (!job.businessId) {
      await db.update(jobs).set({ status: "failed" }).where(eq(jobs.id, job.id));
      results.push({ jobId: job.id, businessId: "unknown", status: "failed" });
      continue;
    }

    try {
      const businessId = job.businessId;
      const [latest] = await db
        .select()
        .from(visibilitySnapshots)
        .where(eq(visibilitySnapshots.businessId, businessId))
        .orderBy(desc(visibilitySnapshots.createdAt))
        .limit(1);

      const snapshotId = randomUUID();
      const runProfile = profileForJobType(job.type);
      const completedAt = new Date().toISOString();
      const publishedThisRun = 0;
      const outreachSentThisRun = 0;
      let aiChecksThisRun = 0;
      const [business] = await db
        .select({ id: businesses.id, name: businesses.name, planTier: businesses.planTier, accountType: businesses.accountType, vertical: businesses.vertical, address: businesses.address })
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .limit(1);
      const [businessSignals] = await db
        .select({ placeId: businesses.placeId, website: businesses.website })
        .from(businesses)
        .where(eq(businesses.id, businessId))
        .limit(1);
      const priorSignals =
        typeof job.payload === "object" && job.payload && "refreshSignals" in job.payload
          ? ((job.payload as { refreshSignals?: RefreshSignals }).refreshSignals ?? null)
          : null;
      const refreshedSignals = await refreshPublicSignals({
        placeId: businessSignals?.placeId ?? null,
        website: businessSignals?.website ?? null,
      });
      const changeResult = detectSignalChanges(priorSignals, refreshedSignals);

      if (refreshedSignals) {
        try {
          const issueSync = await syncBusinessIssues(businessId, refreshedSignals.auditFindings);
          if (issueSync.resolved > 0 || issueSync.newIssues > 0) {
            console.info("[autopilot] issue tracker synced", { businessId, ...issueSync });
          }
        } catch (error) {
          console.error("[autopilot] issue tracker sync failed", { businessId, error: error instanceof Error ? error.message : String(error) });
        }
      }

      // Automation Activity counter — never a scoring input (see
      // src/lib/scoring/visibility-score.ts header). Tracked here purely for
      // the "work completed" side of the run summary below.
      const [{ n: publishedContentCountForActivity }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(publishedContent)
        .where(and(eq(publishedContent.businessId, businessId), eq(publishedContent.status, "published")));

      // Visibility Score v2 (see src/lib/scoring/visibility-score.ts): every
      // input here is a real, independently observed signal — Google's own
      // rating/review count, AI-assistant probe results, and (carried
      // forward from the original scan report, not re-verified this cycle)
      // search-console/rank-estimate positions. Automation activity
      // (articles published, drafts sent, etc.) never enters this formula —
      // see the runSummary block below for where that's tracked instead.
      const [geoAudit, lastKnownSignals] = await Promise.all([
        getGeoAuditScore(businessId),
        lastKnownSearchAndRankSignals(db, latest?.reportId ?? null),
      ]);

      const visibilityResult = computeVisibilityScore({
        placeRating: refreshedSignals?.placeRating ?? null,
        placeReviewCount: refreshedSignals?.placeReviewCount ?? null,
        searchVisibilityPoints: lastKnownSignals.searchVisibilityPoints,
        searchVisibilitySource: lastKnownSignals.searchVisibilitySource,
        localRankingPoints: lastKnownSignals.localRankingPoints,
        aiDiscoveryPoints: geoAudit?.overallScore ?? null,
        aiDiscoveryProbeCount: geoAudit?.totalProbes ?? 0,
      });

      const optimizationHealthResult = computeOptimizationHealthScore({
        websiteTechnicalPoints: refreshedSignals?.websiteAudit.score ?? null,
        aeoReadinessPoints: refreshedSignals
          ? computeAeoScore({
              websiteAudit: refreshedSignals.websiteAudit,
              hasSchemaMarkup: publishedContentCountForActivity > 0,
              reviewCount: refreshedSignals.placeReviewCount ?? 0,
            }).score
          : null,
        // Entity completeness (citation/social/NAP data) is not gathered as
        // part of this refresh cycle today — honestly reported as not
        // measured here rather than guessed. Flagged as a follow-up: wire
        // citationIssues/social counts through so this composite is complete.
        entityCompletenessPoints: null,
      });

      // Fallback only for the narrow case where refresh failed on this
      // business's very first recurring cycle (no prior snapshot exists to
      // carry forward at all) — a real "we have nothing yet" state, not a
      // per-cycle default. Every other case uses either this cycle's real
      // measurement or the last real measurement on file.
      const nextScore = visibilityResult.score ?? latest?.overallScore ?? 50;

      const snapshotValues = {
        id: snapshotId,
        businessId,
        reportId: latest?.reportId ?? null,
        overallScore: nextScore,
        opportunityLevel: levelForScore(nextScore),
        sectionScores: {
          visibility: visibilityResult,
          optimizationHealth: optimizationHealthResult,
        },
        source: "automation",
      };
      // scoreMethodVersion is a recently-added column — if a deploy's schema
      // push hasn't landed on this DB yet, inserting a value for it would
      // throw and silently fail this business's entire recurring cycle
      // (job marked failed, automation stalls). Fall back to the
      // pre-versioning insert shape rather than let a schema-timing gap take
      // down the automation loop.
      await db
        .insert(visibilitySnapshots)
        .values({ ...snapshotValues, scoreMethodVersion: SCORE_METHOD_VERSION })
        .catch(() => db.insert(visibilitySnapshots).values(snapshotValues));

      {
        // AI probes are marketed as monthly for every plan ("runs monthly AI
        // probes... your score updates automatically each month"), but the
        // overall recurring refresh this block lives inside runs far more
        // often on higher tiers (every 7/3/1 days for Growth/Pro/Agency).
        // These are now real, paid model calls (see perplexity.ts) — gate on
        // the last probe's age so it truly runs once a month regardless of
        // how often the surrounding visibility refresh fires.
        const AI_PROBE_INTERVAL_DAYS = 30;
        const [lastProbe] = await db
          .select({ createdAt: aiVisibilityChecks.createdAt })
          .from(aiVisibilityChecks)
          .where(eq(aiVisibilityChecks.businessId, businessId))
          .orderBy(desc(aiVisibilityChecks.createdAt))
          .limit(1);
        const dueForProbe =
          !lastProbe || Date.now() - lastProbe.createdAt.getTime() >= AI_PROBE_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

        if (dueForProbe) {
          const city = cityFromAddress(business?.address);
          const realChecks = await checkBusinessVisibilityInAI({
            businessName: business?.name ?? "Local business",
            city,
            vertical: business?.vertical ?? null,
          });
          // No fabricated fallback: a customer-facing GEO score built on made-up
          // "mentioned"/confidence values derived from the unrelated visibility
          // score is not a real measurement of AI mentions. If the real probe
          // comes back empty (API unavailable or a transient failure), skip this
          // cycle and let the next recurring run try again — the same
          // "skip and retry" pattern already used for failed content generation.
          if (realChecks.length > 0) {
            aiChecksThisRun = Math.min(realChecks.length, runProfile.aiChecks);
            await db.insert(aiVisibilityChecks).values(
              realChecks.slice(0, runProfile.aiChecks).map((check) => ({
                businessId,
                locationId: null as string | null,
                prompt: check.query,
                engine: check.platform,
                mentionFound: check.mentioned ? "true" : "false",
                sentiment: check.sentiment,
                confidence: check.confidence,
              })),
            );
          } else {
            console.warn("[executor] AI visibility probe returned no results — skipping this cycle", { businessId });
          }
        }
      }

      // Content is planned from verified first-party facts only (Business
      // Truth layer) and published to the customer's own website by
      // executeContentPublishPath on the worker tick. Nothing is published
      // inline here, and no internal noindex pages are created — see
      // content-planner.ts for why.
      const contentPlan = await planTruthGroundedContent({
        businessId,
        maxItems: runProfile.contentIdeas,
        maxLocationPages: runProfile.localPages,
      }).catch((err) => {
        console.error("[autopilot] content planning failed", { businessId, error: err instanceof Error ? err.message : String(err) });
        return { state: "nothing_new" as const, queued: 0, titles: [] as string[] };
      });

      // Re-observe the public footprint (informational activity log entry, not a task).
      await db.insert(operatorTasks).values({
        id: randomUUID(),
        businessId,
        title: "Public-footprint refresh",
        detail: changeResult.summary,
        queue: "change_detection",
        status: "completed",
      });

      await db
        .update(jobs)
        .set({
          status: "completed",
          payload: {
            ...(typeof job.payload === "object" && job.payload ? job.payload : {}),
            completedAt,
            snapshotId,
            runSummary: {
              // Real outcomes only — these used to echo the plan's target
              // counts (e.g. "2 outreach drafts generated") regardless of
              // whether anything actually happened.
              contentQueuedFromVerifiedFacts: contentPlan.queued,
              contentEngineState: contentPlan.state,
              aiChecksCompleted: aiChecksThisRun,
              publishedThisRun,
              outreachSentThisRun,
              // Automation Activity — total work completed to date, never a
              // scoring input. See computeVisibilityScore's header for why
              // this is tracked separately from the score.
              totalPublishedContentCount: publishedContentCountForActivity,
              detectedChanges: changeResult.changes,
              changeSummary: changeResult.summary,
            },
            refreshSignals: refreshedSignals,
          },
        })
        .where(eq(jobs.id, job.id));

      const raw = business?.planTier as string | undefined;
      const normalized =
        raw === "entry" || raw === "base" ? "starter"
        : raw === "managed" ? "pro"
        : raw && (["starter", "growth", "pro", "agency"] as string[]).includes(raw) ? raw
        : undefined;
      const planTier =
        (normalized as PlanTier | undefined) ?? (job.type === "pro_recurring_refresh" ? "pro" : "starter");
      const features = planFeatures(planTier);
      const [lead] = await db
        .select({ email: leads.email })
        .from(leads)
        .where(eq(leads.businessId, businessId))
        .orderBy(desc(leads.lastSeenAt))
        .limit(1);
      if (lead?.email && features.monthlySummaryEmail && business?.accountType !== "house") {
        const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
        const workspaceUrl = `${base.replace(/\/$/, "")}/workspace/${businessId}`;
        void sendAutomationSummaryEmail({
          leadEmail: lead.email,
          businessName: business?.name ?? "Your business",
          planLabel: features.label,
          cadenceLabel: features.refreshCadenceLabel,
          score: nextScore,
          completedAt,
          highlights: [
            "Visibility score refreshed and history updated.",
            aiChecksThisRun > 0 ? `${aiChecksThisRun} AI visibility checks completed.` : "AI visibility checks run monthly (none due this cycle).",
            contentPlan.queued > 0
              ? `${contentPlan.queued} new page${contentPlan.queued === 1 ? "" : "s"} planned from your website's own information.`
              : contentPlan.state === "awaiting_publishing_connection"
                ? "Connect your website once so GravyBlock can publish for you."
                : "No new content was needed this cycle.",
            changeResult.summary,
          ],
          workspaceUrl,
        });
      }

      if (business?.planTier) {
        const planForSchedule = normalizePlanTierFromDb(business.planTier);
        if (planForSchedule !== "free") {
          // Was fire-and-forget (`void ...`, never awaited) — a failure here
          // silently ended the recurring chain forever for this business,
          // since nothing else ever re-schedules an existing business's next
          // cycle. Confirmed happening: PRO/BASE recurring jobs pending hit
          // 0 system-wide with businesses frozen for weeks. Now awaited and
          // logged so a failure is at least visible, and non-fatal so it
          // doesn't flip this job to "failed" after real work already
          // completed (backfillMissingRecurringJobs below is the safety net
          // that recovers from this class of failure automatically).
          try {
            await schedulePlanRecurringSnapshotJob({ businessId, planTier: planForSchedule });
          } catch (err) {
            console.error("[autopilot] failed to reschedule next recurring cycle", {
              businessId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      results.push({ jobId: job.id, businessId, snapshotId, status: "completed" });
    } catch {
      await db.update(jobs).set({ status: "failed" }).where(eq(jobs.id, job.id));
      results.push({ jobId: job.id, businessId: job.businessId, status: "failed" });
    }
  }

  return { processed: results.length, results };
}

/**
 * Safety net for the recurring-refresh chain: each cycle is supposed to
 * re-schedule its own successor (see the reschedule call above), but that
 * was fire-and-forget for a long time, so any single failure silently ended
 * the chain forever for that business — nothing else ever creates a new
 * recurring job for an already-existing business. Confirmed happening
 * system-wide (pending recurring jobs hit 0 with businesses frozen for
 * weeks). This sweeps every paid business without a pending recurring job
 * and schedules one immediately (not delayed by a full cycle), so a stall
 * is caught and recovered on the next run instead of staying broken
 * indefinitely.
 */
export async function backfillMissingRecurringJobs(batchSize = 50): Promise<{ scheduled: number; checked: number }> {
  const db = getDb();
  if (!db) return { scheduled: 0, checked: 0 };

  const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];
  const paidBusinesses = await db
    .select({ id: businesses.id, planTier: businesses.planTier })
    .from(businesses)
    .where(inArray(businesses.planTier, PAID_TIERS))
    .limit(2000);

  if (paidBusinesses.length === 0) return { scheduled: 0, checked: 0 };

  const businessIds = paidBusinesses.map((b) => b.id);
  const pendingRows = await db
    .select({ businessId: jobs.businessId })
    .from(jobs)
    .where(
      and(
        inArray(jobs.type, ["recurring_snapshot_refresh", "entry_monthly_refresh", "pro_recurring_refresh"]),
        eq(jobs.status, "pending"),
        inArray(jobs.businessId, businessIds),
      ),
    );
  const alreadyPending = new Set(pendingRows.map((r) => r.businessId).filter((id): id is string => Boolean(id)));

  const missing = paidBusinesses.filter((b) => !alreadyPending.has(b.id));

  let scheduled = 0;
  for (const biz of missing.slice(0, batchSize)) {
    const tier = normalizePlanTierFromDb(biz.planTier);
    if (tier === "free") continue;
    try {
      const result = await scheduleRecurringSnapshotJob({
        businessId: biz.id,
        runAfterMs: 0,
        type: recurringJobTypeForPlan(tier),
      });
      if (!result.skipped) scheduled++;
    } catch (err) {
      console.error("[autopilot] backfill schedule failed", {
        businessId: biz.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { scheduled, checked: missing.length };
}


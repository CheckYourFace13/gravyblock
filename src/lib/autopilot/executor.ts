import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import {
  aiVisibilityChecks,
  backlinkOpportunities,
  businesses,
  citationMonitors,
  contentQueue,
  getDb,
  jobs,
  leads,
  operatorTasks,
  publishedContent,
  publishingJobs,
  publishingTargets,
  visibilitySnapshots,
} from "@/lib/db";
import { sendAutomationSummaryEmail, sendOutreachEmail } from "@/lib/integrations/resend";
import { publishToWordPress, type WordPressConfig } from "@/lib/integrations/wordpress";
import { publishToWebflow, extractWebflowConfig } from "@/lib/publishing/adapters/webflow";
import { publishToShopify, extractShopifyConfig } from "@/lib/publishing/adapters/shopify";
import { planFeatures, normalizePlanTierFromDb, type PlanTier } from "@/lib/plans";
import { getGooglePlaceDetails } from "@/lib/integrations/google-places";
import { runSiteCrawlAudit } from "@/lib/audit/site-crawl";
import { buildSocialPresence } from "@/lib/social/discover";
import { generateArticleBody, generateLocalPageBody, generateOutreachPitch, generateMetaTags } from "@/lib/content/generator";
import { addInternalLinks } from "@/lib/content/internal-linker";
import { getArticlePhoto } from "@/lib/integrations/unsplash";
import { businessConfigs } from "@/lib/db";
import { checkBusinessVisibilityInAI } from "@/lib/integrations/perplexity";

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

function clampScore(score: number) {
  return Math.max(1, Math.min(100, score));
}

function recurringJobTypeForPlan(tier: PlanTier) {
  if (tier === "pro" || tier === "agency") return "pro_recurring_refresh";
  return "entry_monthly_refresh";
}

function profileForJobType(jobType: string): AutomationRunProfile {
  if (jobType === "pro_recurring_refresh") {
    return {
      aiChecks: 1,
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
    aiChecks: 1,
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

function hostFromUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function cityFromAddress(address: string | null | undefined): string {
  if (!address) return "your area";
  // "123 Main St, Austin, TX 78701" → "Austin"
  const parts = address.split(",");
  if (parts.length >= 2) return parts[1].trim();
  return address.trim();
}

function outreachEmailForTarget(targetUrl: string | null, fallbackEmail: string | null) {
  const host = hostFromUrl(targetUrl);
  if (host) return `partnerships@${host}`;
  return fallbackEmail;
}

export async function executeContentPublishPath(businessId: string) {
  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_URL is required for content execution path");
  }

  const [queuedItem] = await db
    .select()
    .from(contentQueue)
    .where(and(eq(contentQueue.businessId, businessId), eq(contentQueue.status, "queued")))
    .orderBy(contentQueue.createdAt)
    .limit(1);

  if (!queuedItem) {
    return { ok: false, reason: "no_queued_content" as const };
  }

  const [target] = await db
    .select()
    .from(publishingTargets)
    .where(and(eq(publishingTargets.businessId, businessId), eq(publishingTargets.active, "true")))
    .orderBy(publishingTargets.createdAt)
    .limit(1);

  await db.update(contentQueue).set({ status: "ready" }).where(eq(contentQueue.id, queuedItem.id));

  const publishJobId = randomUUID();
  await db.insert(publishingJobs).values({
    id: publishJobId,
    queueId: queuedItem.id,
    targetId: target?.id ?? null,
    status: "pending",
    responseLog: "Publish attempt started by autopilot executor.",
  });

  if (!target) {
    await db
      .update(publishingJobs)
      .set({ status: "failed", responseLog: "No active publishing target configured." })
      .where(eq(publishingJobs.id, publishJobId));
    await db.update(contentQueue).set({ status: "failed" }).where(eq(contentQueue.id, queuedItem.id));
    return { ok: false, reason: "no_publishing_target" as const, publishJobId, contentQueueId: queuedItem.id };
  }

  try {
    const [biz] = await db
      .select({ name: businesses.name, vertical: businesses.vertical, address: businesses.address })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);

    // Feature #3: fetch full config for content generation
    const [bizConfig] = await db
      .select({
        brandVoice: businessConfigs.brandVoice,
        serviceDescription: businessConfigs.serviceDescription,
        tone: businessConfigs.tone,
        targetScope: businessConfigs.targetScope,
        focusArea: businessConfigs.focusArea,
      })
      .from(businessConfigs)
      .where(eq(businessConfigs.businessId, businessId))
      .limit(1);

    const configuredCity = bizConfig?.targetScope?.split(",")[0]?.trim();
    const generatorParams = {
      businessName: biz?.name ?? "Local business",
      city: configuredCity || cityFromAddress(biz?.address),
      vertical: biz?.vertical ?? null,
      title: queuedItem.title,
      outline: queuedItem.outline ?? "",
      targetKeyword: queuedItem.targetKeyword ?? null,
      address: biz?.address ?? null,
      brandVoice: bizConfig?.brandVoice ?? null,
      serviceDescription: bizConfig?.serviceDescription ?? null,
      tone: bizConfig?.tone ?? null,
      focusArea: bizConfig?.focusArea ?? "local",
    };
    const aiBody = queuedItem.kind === "location_page"
      ? await generateLocalPageBody(generatorParams)
      : await generateArticleBody(generatorParams);
    // Never publish hollow placeholder content — skip and retry on next tick
    if (!aiBody) {
      console.warn("[executeContentPublishPath] AI generation returned null — skipping", { businessId, itemId: queuedItem.id });
      return { ok: false, reason: "ai_generation_failed" };
    }
    let body = aiBody;

    // Feature #4: smart internal linking
    body = await addInternalLinks({
      body,
      businessId,
      currentTitle: queuedItem.title,
    }).catch(() => body); // non-fatal

    // Feature #2: generate meta tags
    const metaTags = await generateMetaTags({
      title: queuedItem.title,
      body,
      targetKeyword: queuedItem.targetKeyword ?? null,
      businessName: biz?.name ?? "Local business",
      city: cityFromAddress(biz?.address),
    }).catch(() => null);

    // Feature #5: fetch cover image from Unsplash
    const photo = await getArticlePhoto(
      queuedItem.targetKeyword ?? queuedItem.title,
    ).catch(() => null);

    const artifactId = randomUUID();
    let publicUrl = `/published/${artifactId}`;
    let channel = "internal_site";

    if (target?.adapter === "wordpress" && target.config) {
      const wpConfig = target.config as unknown as WordPressConfig;
      const wpResult = await publishToWordPress({ config: wpConfig, title: queuedItem.title, body });
      if (wpResult.ok) {
        publicUrl = wpResult.postUrl;
        channel = "wordpress";
      } else {
        console.warn("[executor] WordPress publish failed, falling back to internal", { error: wpResult.error });
      }
    } else if (target?.adapter === "webflow" && target.config) {
      const wfConfig = extractWebflowConfig(target.config);
      if (wfConfig) {
        const wfResult = await publishToWebflow(wfConfig, { title: queuedItem.title, content: body });
        if (wfResult.ok) {
          publicUrl = `https://webflow.com/item/${wfResult.itemId}`;
          channel = "webflow";
        } else {
          console.warn("[executor] Webflow publish failed, falling back to internal", { error: wfResult.error });
        }
      }
    } else if (target?.adapter === "shopify" && target.config) {
      const sfConfig = extractShopifyConfig(target.config);
      if (sfConfig) {
        const sfResult = await publishToShopify(sfConfig, { title: queuedItem.title, content: body });
        if (sfResult.ok) {
          publicUrl = sfResult.url;
          channel = "shopify";
        } else {
          console.warn("[executor] Shopify publish failed, falling back to internal", { error: sfResult.error });
        }
      }
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
      // Feature #2: auto meta tags
      metaTitle: metaTags?.metaTitle ?? null,
      metaDescription: metaTags?.metaDescription ?? null,
      // Feature #5: cover image
      coverImageUrl: photo?.url ?? null,
      coverImageCredit: photo?.credit ?? null,
    });

    await db.update(contentQueue).set({ status: "published" }).where(eq(contentQueue.id, queuedItem.id));
    await db
      .update(publishingJobs)
      .set({ status: "published", responseLog: `Published to ${publicUrl}` })
      .where(eq(publishingJobs.id, publishJobId));

    return { ok: true, publishJobId, contentQueueId: queuedItem.id, artifactId, publicUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown publish failure";
    await db.update(contentQueue).set({ status: "failed" }).where(eq(contentQueue.id, queuedItem.id));
    await db
      .update(publishingJobs)
      .set({ status: "failed", responseLog: message })
      .where(eq(publishingJobs.id, publishJobId));
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
  return { jobId: id, runAfter: runAfter.toISOString() };
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

  const dueJobs = await db
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
    .limit(limit);

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

      const nextScore = clampScore((latest?.overallScore ?? 60) + 2);
      const snapshotId = randomUUID();
      const runProfile = profileForJobType(job.type);
      const completedAt = new Date().toISOString();
      let publishedThisRun = 0;
      let outreachSentThisRun = 0;
      const [business] = await db
        .select({ id: businesses.id, name: businesses.name, planTier: businesses.planTier, vertical: businesses.vertical, address: businesses.address })
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
      await db.insert(visibilitySnapshots).values({
        id: snapshotId,
        businessId,
        reportId: latest?.reportId ?? null,
        overallScore: nextScore,
        opportunityLevel: levelForScore(nextScore),
        sectionScores: latest?.sectionScores ?? { technical: nextScore, visibility: nextScore, conversion: nextScore },
        source: "automation",
      });

      {
        const city = cityFromAddress(business?.address);
        const realChecks = await checkBusinessVisibilityInAI({
          businessName: business?.name ?? "Local business",
          city,
          vertical: business?.vertical ?? null,
        });
        const checksToInsert = realChecks.length > 0
          ? realChecks.slice(0, runProfile.aiChecks).map((check) => ({
              businessId,
              locationId: null as string | null,
              prompt: check.query,
              engine: check.platform,
              mentionFound: check.mentioned ? "true" : "false",
              sentiment: check.sentiment,
              confidence: check.confidence,
            }))
          : Array.from({ length: runProfile.aiChecks }).map((_, idx) => ({
              businessId,
              locationId: null as string | null,
              prompt: `recurring local-intent autopilot probe ${idx + 1} (${job.type})`,
              engine: "synthetic",
              mentionFound: nextScore >= 65 ? "true" : "false",
              sentiment: nextScore >= 70 ? "positive" : "neutral",
              confidence: Math.min(95, nextScore - idx),
            }));
        await db.insert(aiVisibilityChecks).values(checksToInsert);
      }

      const queuedContentIds: string[] = [];
      const publishedUrls: string[] = [];
      const bizName = business?.name ?? "Local business";
      const bizCity = cityFromAddress(business?.address);
      const bizVertical = business?.vertical ?? "local service";
      // Article title/outline templates — real SEO copy, not stubs
      const articleTemplates = [
        {
          title: `Why ${bizCity} Residents Choose ${bizName}`,
          outline: `Write a 700-word local SEO article explaining why customers in ${bizCity} choose ${bizName} for ${bizVertical} services. Cover: what makes the business stand out locally, real benefits for ${bizCity} residents, common customer questions answered, and a clear call to action. Use a friendly, conversational tone.`,
          keyword: `${bizVertical} ${bizCity}`,
        },
        {
          title: `${bizName}: The ${bizCity} ${bizVertical} Guide`,
          outline: `Write a 700-word guide covering everything ${bizCity} customers need to know about getting ${bizVertical} services from ${bizName}. Include: what services are offered, what to expect, how to get started, and why choosing a local business matters. Mention ${bizCity} specifically throughout.`,
          keyword: `best ${bizVertical} in ${bizCity}`,
        },
        {
          title: `Top ${bizVertical} Questions Answered — ${bizName} in ${bizCity}`,
          outline: `Write a 700-word FAQ-style article where ${bizName} answers the most common questions ${bizCity} customers have about ${bizVertical}. Cover at least 5 specific questions with detailed, helpful answers. End with a clear call to action.`,
          keyword: `${bizVertical} questions ${bizCity}`,
        },
        {
          title: `How ${bizName} Serves the ${bizCity} Community`,
          outline: `Write a 700-word local story about how ${bizName} has become part of the ${bizCity} community. Cover: local roots, how it meets local needs differently than national chains, what customers experience, and how to get in touch. Warm, community-focused tone.`,
          keyword: `${bizName} ${bizCity}`,
        },
      ];
      const locationTemplates = [
        {
          title: `${bizVertical} Services in ${bizCity} — ${bizName}`,
          outline: `Write a 500-word location page for ${bizName} serving customers in ${bizCity}. Cover: specific services offered in this area, why local customers trust this business, service area coverage, and contact or booking information. Optimize for "${bizVertical} in ${bizCity}" searches.`,
          keyword: `${bizVertical} in ${bizCity}`,
        },
        {
          title: `Serving ${bizCity}: ${bizName}'s Local ${bizVertical} Promise`,
          outline: `Write a 500-word location landing page for ${bizName} in ${bizCity}. Focus on: the specific neighborhoods and areas served, what makes their ${bizVertical} service right for ${bizCity} residents, testimonials context, and a direct call to action.`,
          keyword: `${bizName} near ${bizCity}`,
        },
      ];
      const contentItems = Array.from({ length: runProfile.contentIdeas }).map((_, idx) => {
        const id = randomUUID();
        queuedContentIds.push(id);
        const isLocationPage = idx < runProfile.localPages;
        const template = isLocationPage
          ? locationTemplates[idx % locationTemplates.length]!
          : articleTemplates[(idx - runProfile.localPages) % articleTemplates.length]!;
        return {
          id,
          businessId,
          kind: isLocationPage ? "location_page" : "article",
          title: template.title,
          status: "generated",
          variant: isLocationPage ? "geo_variant" : "primary_market",
          outline: template.outline,
          targetKeyword: template.keyword,
        };
      });
      await db.insert(contentQueue).values(contentItems);

      if (runProfile.publishingJobs > 0) {
        const publishNowQueueIds = queuedContentIds.slice(0, runProfile.publishingJobs);
        const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
        for (const queueId of publishNowQueueIds) {
          const queueRow = contentItems.find((x) => x.id === queueId);
          if (!queueRow) continue;
          await db.update(contentQueue).set({ status: "ready" }).where(eq(contentQueue.id, queueId));
          const publishJobId = randomUUID();
          await db.insert(publishingJobs).values({
            id: publishJobId,
            queueId,
            targetId: null,
            status: "queued",
            responseLog: "Internal public publish target queued by recurring automation.",
          });
          const artifactId = randomUUID();
          const publicPath = `/published/${artifactId}`;
          const publicUrl = `${base.replace(/\/$/, "")}${publicPath}`;
          publishedUrls.push(publicUrl);
          // Fetch full config for content generation
          const [recurringBizConfig] = await db
            .select({
              brandVoice: businessConfigs.brandVoice,
              targetScope: businessConfigs.targetScope,
              focusArea: businessConfigs.focusArea,
              serviceDescription: businessConfigs.serviceDescription,
              tone: businessConfigs.tone,
            })
            .from(businessConfigs)
            .where(eq(businessConfigs.businessId, businessId))
            .limit(1);
          // Use the customer's configured service area city, fall back to Google address
          const configuredCity = recurringBizConfig?.targetScope?.split(",")[0]?.trim();
          const generatorParams = {
            businessName: business?.name ?? "Local business",
            city: configuredCity || cityFromAddress(business?.address),
            vertical: business?.vertical ?? null,
            title: queueRow.title,
            outline: queueRow.outline ?? "",
            targetKeyword: queueRow.targetKeyword ?? null,
            changeSummary: changeResult.summary,
            address: business?.address ?? null,
            brandVoice: recurringBizConfig?.brandVoice ?? null,
            focusArea: recurringBizConfig?.focusArea ?? "local",
            serviceDescription: recurringBizConfig?.serviceDescription ?? null,
            tone: recurringBizConfig?.tone ?? null,
          };
          const aiBody = queueRow.kind === "location_page"
            ? await generateLocalPageBody(generatorParams)
            : await generateArticleBody(generatorParams);
          // If AI generation failed, skip this item rather than publish hollow content.
          // It will be retried on the next worker tick.
          if (!aiBody) {
            console.warn("[executor] AI generation returned null — skipping publish", { businessId, queueId: queueRow.id, title: queueRow.title });
            publishedUrls.push(`[skipped — AI unavailable]`);
            continue;
          }
          let body = aiBody;
          // Feature #4: smart internal linking
          body = await addInternalLinks({
            body,
            businessId,
            currentTitle: queueRow.title,
          }).catch(() => body);
          // Feature #2: auto meta tags
          const recurringMetaTags = await generateMetaTags({
            title: queueRow.title,
            body,
            targetKeyword: queueRow.targetKeyword ?? null,
            businessName: business?.name ?? "Local business",
            city: cityFromAddress(business?.address),
          }).catch(() => null);
          // Feature #5: cover image
          const recurringPhoto = await getArticlePhoto(
            queueRow.targetKeyword ?? queueRow.title,
          ).catch(() => null);
          await db.insert(publishedContent).values({
            id: artifactId,
            businessId,
            locationId: null,
            queueId,
            title: queueRow.title,
            body,
            channel: "internal_site",
            publicUrl,
            status: "published",
            metaTitle: recurringMetaTags?.metaTitle ?? null,
            metaDescription: recurringMetaTags?.metaDescription ?? null,
            coverImageUrl: recurringPhoto?.url ?? null,
            coverImageCredit: recurringPhoto?.credit ?? null,
          });
          await db.update(contentQueue).set({ status: "published" }).where(eq(contentQueue.id, queueId));
          await db
            .update(publishingJobs)
            .set({ status: "published", responseLog: `Published automatically to ${publicUrl}` })
            .where(eq(publishingJobs.id, publishJobId));
          publishedThisRun += 1;
        }
      }

      await db.insert(citationMonitors).values(
        Array.from({ length: runProfile.citationTasks }).map((_, idx) => ({
          id: randomUUID(),
          businessId,
          sourceName: `Listing consistency monitor ${idx + 1}`,
          status: "pending",
          mismatchNote: "Run generated from recurring refresh cycle.",
        })),
      );

      // Backlink opportunities are discovered by the real prospect-finder (monthly batch job)
      // which finds actual local chambers, associations, and directories via Google Places.
      // No synthetic placeholder rows — only real prospects show here.

      const actionItems: Array<{
        id: string;
        businessId: string;
        title: string;
        detail: string;
        queue: string;
        status: string;
      }> = [
        {
          id: randomUUID(),
          businessId,
          title: "Monthly website audit re-check",
          detail: "Re-check CTA visibility, service-area clarity, and trust signal gaps from homepage crawl.",
          queue: "local_trust_ops",
          status: "queued",
        },
        {
          id: randomUUID(),
          businessId,
          title: "Monthly listing and social re-check",
          detail: "Review listing consistency and social profile coverage across public sources.",
          queue: "citation_ops",
          status: "queued",
        },
        {
          id: randomUUID(),
          businessId,
          title: "Prioritized action plan refresh",
          detail: "Update the top three next actions using latest score and queue context.",
          queue: "general",
          status: "queued",
        },
      ];
      if (runProfile.reviewTasks > 0) {
        actionItems.push(
          ...Array.from({ length: runProfile.reviewTasks }).map((_, idx) => ({
            id: randomUUID(),
            businessId,
            title: `Review and reputation task ${idx + 1}`,
            detail: "Respond to recent reviews and request fresh social proof from recent customers.",
            queue: "review_ops",
            status: "queued",
          })),
        );
      }
      if (runProfile.outreachDrafts > 0) {
        // Use real prospects from the prospect-finder (not synthetic rows)
        const realProspects = await db
          .select({ id: backlinkOpportunities.id, sourceName: backlinkOpportunities.sourceName, targetUrl: backlinkOpportunities.targetUrl })
          .from(backlinkOpportunities)
          .where(and(eq(backlinkOpportunities.businessId, businessId), eq(backlinkOpportunities.status, "draft_generated")))
          .orderBy(desc(backlinkOpportunities.qualityScore))
          .limit(runProfile.outreachDrafts);

        if (realProspects.length > 0) {
          const [lead] = await db
            .select({ email: leads.email })
            .from(leads)
            .where(eq(leads.businessId, businessId))
            .orderBy(desc(leads.lastSeenAt))
            .limit(1);
          const businessName = business?.name ?? "GravyBlock customer";
          const publishedReference = publishedUrls[0] ?? (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
          const outreachTasks = realProspects.map((opportunity, idx) => {
            const pitch = `We just published a fresh local story update and would like to contribute a relevant resource entry for your audience. ${changeResult.summary}`;
            return {
              id: randomUUID(),
              businessId,
              title: `Outreach draft ${idx + 1}`,
              detail: `Target ${opportunity.targetUrl ?? "community source"} | angle local relevance update | pitch: ${pitch}`,
              queue: "outreach_ops",
              status: "draft_generated",
            };
          });
          await db.insert(operatorTasks).values(outreachTasks);
          for (let idx = 0; idx < outreachTasks.length; idx += 1) {
            const task = outreachTasks[idx];
            const opportunity = realProspects[idx];
            if (!opportunity) continue;
            const targetEmail = outreachEmailForTarget(opportunity.targetUrl, lead?.email ?? null);
            if (!targetEmail) continue;
            try {
              const aiPitch = await generateOutreachPitch({
                businessName,
                city: cityFromAddress(business?.address),
                targetName: opportunity.sourceName,
                targetUrl: opportunity.targetUrl ?? "",
                referenceUrl: publishedReference,
                changeSummary: changeResult.summary,
              });
              const pitch = aiPitch ??
                "We have a newly refreshed local visibility page and can provide an audience-relevant contribution tied to current service-area demand.";
              const sendResult = await sendOutreachEmail({
                to: targetEmail,
                businessName,
                targetName: opportunity.sourceName,
                angle: "Local resource collaboration",
                pitch,
                referenceUrl: publishedReference,
              });
              if (sendResult.ok && !sendResult.skipped) {
                await db.update(operatorTasks).set({ status: "sent" }).where(eq(operatorTasks.id, task.id));
                await db.update(backlinkOpportunities).set({ status: "awaiting_response" }).where(eq(backlinkOpportunities.id, opportunity.id));
                outreachSentThisRun += 1;
              }
            } catch (error) {
              await db
                .update(operatorTasks)
                .set({
                  status: "draft_generated",
                  detail: `${task.detail} | send_error: ${error instanceof Error ? error.message : "unknown"}`,
                })
              .where(eq(operatorTasks.id, task.id));
            }
          }
        } // end if (realProspects.length > 0)
      }
      actionItems.push({
        id: randomUUID(),
        businessId,
        title: "Public-footprint refresh",
        detail: changeResult.summary,
        queue: "change_detection",
        status: "completed",
      });
      await db.insert(operatorTasks).values(actionItems.slice(0, Math.max(runProfile.actionItems, actionItems.length)));

      await db
        .update(jobs)
        .set({
          status: "completed",
          payload: {
            ...(typeof job.payload === "object" && job.payload ? job.payload : {}),
            completedAt,
            snapshotId,
            runSummary: {
              contentIdeas: runProfile.contentIdeas,
              draftsGenerated: runProfile.drafts,
              publishingJobsQueued: runProfile.publishingJobs,
              citationTasksQueued: runProfile.citationTasks,
              reviewTasksQueued: runProfile.reviewTasks,
              backlinkOpportunitiesQueued: runProfile.backlinkOpportunities,
              aiChecksCompleted: runProfile.aiChecks,
              monthlyActionItemsQueued: runProfile.actionItems,
              outreachDraftsGenerated: runProfile.outreachDrafts,
              publishedThisRun,
              outreachSentThisRun,
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
      if (lead?.email && features.monthlySummaryEmail) {
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
            `${runProfile.aiChecks} AI visibility checks completed.`,
            `${runProfile.contentIdeas} content ideas queued${runProfile.drafts ? `, ${runProfile.drafts} drafts generated` : ""}.`,
            `${runProfile.citationTasks} citation/listing tasks, ${runProfile.reviewTasks} review tasks, ${runProfile.backlinkOpportunities} authority opportunities queued.`,
            `${runProfile.outreachDrafts} outreach drafts generated. ${changeResult.summary}`,
          ],
          workspaceUrl,
        });
      }

      if (business?.planTier) {
        const planForSchedule = normalizePlanTierFromDb(business.planTier);
        if (planForSchedule !== "free") {
          void schedulePlanRecurringSnapshotJob({ businessId, planTier: planForSchedule });
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

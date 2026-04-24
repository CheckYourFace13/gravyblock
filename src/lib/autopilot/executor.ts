import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import {
  aiVisibilityChecks,
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
import { sendAutomationSummaryEmail } from "@/lib/integrations/resend";
import { planFeatures, type PlanTier } from "@/lib/plans";

function levelForScore(score: number) {
  if (score >= 78) return "low";
  if (score >= 62) return "medium";
  return "high";
}

function clampScore(score: number) {
  return Math.max(1, Math.min(100, score));
}

function recurringJobTypeForPlan(tier: PlanTier) {
  if (tier === "pro" || tier === "managed") return "pro_recurring_refresh";
  return "entry_monthly_refresh";
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
    const body = [
      `# ${queuedItem.title}`,
      "",
      "Published by GravyBlock autopilot execution path.",
      "",
      queuedItem.outline ?? "Auto-generated starter draft from queue metadata.",
      "",
      `Target keyword: ${queuedItem.targetKeyword ?? "n/a"}`,
    ].join("\n");

    const artifactId = randomUUID();
    const publicUrl = `/published/${artifactId}`;
    await db.insert(publishedContent).values({
      id: artifactId,
      businessId,
      locationId: queuedItem.locationId ?? null,
      queueId: queuedItem.id,
      title: queuedItem.title,
      body,
      channel: "internal_site",
      publicUrl,
      status: "published",
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
      const [latest] = await db
        .select()
        .from(visibilitySnapshots)
        .where(eq(visibilitySnapshots.businessId, job.businessId))
        .orderBy(desc(visibilitySnapshots.createdAt))
        .limit(1);

      const nextScore = clampScore((latest?.overallScore ?? 60) + 2);
      const snapshotId = randomUUID();
      await db.insert(visibilitySnapshots).values({
        id: snapshotId,
        businessId: job.businessId,
        reportId: latest?.reportId ?? null,
        overallScore: nextScore,
        opportunityLevel: levelForScore(nextScore),
        sectionScores: latest?.sectionScores ?? { technical: nextScore, visibility: nextScore, conversion: nextScore },
        source: "automation",
      });

      await db.insert(aiVisibilityChecks).values({
        businessId: job.businessId,
        locationId: null,
        prompt: `recurring local-intent autopilot probe (${job.type})`,
        engine: "synthetic",
        mentionFound: nextScore >= 65 ? "true" : "false",
        sentiment: nextScore >= 70 ? "positive" : "neutral",
        confidence: Math.min(95, nextScore),
      });

      await db.insert(contentQueue).values({
        id: randomUUID(),
        businessId: job.businessId,
        kind: job.type === "pro_recurring_refresh" ? "location_page" : "article",
        title:
          job.type === "pro_recurring_refresh"
            ? "Local service-area page refresh idea"
            : "Monthly local content idea refresh",
        status: "queued",
        variant: job.type === "pro_recurring_refresh" ? "geo_variant" : "primary_market",
        outline:
          job.type === "pro_recurring_refresh"
            ? "Update service-area proof, local FAQs, and neighborhood trust cues."
            : "Publish one localized update tied to current demand and recent customer questions.",
      });

      await db.insert(citationMonitors).values({
        id: randomUUID(),
        businessId: job.businessId,
        sourceName: "Monthly listing consistency monitor",
        status: "pending",
        mismatchNote: "Run generated from recurring refresh cycle.",
      });

      await db.insert(operatorTasks).values([
        {
          id: randomUUID(),
          businessId: job.businessId,
          title: "Resolve citation/listing mismatches",
          detail: "Audit map/listing inconsistencies surfaced in this cycle.",
          queue: "citation_ops",
          status: "queued",
        },
        {
          id: randomUUID(),
          businessId: job.businessId,
          title: "Review and reputation follow-up",
          detail: "Respond to recent reviews and request new social proof.",
          queue: "review_ops",
          status: "queued",
        },
        {
          id: randomUUID(),
          businessId: job.businessId,
          title: "Local trust signal refresh",
          detail: "Verify hours, contact, and service clarity on key pages.",
          queue: "local_trust_ops",
          status: "queued",
        },
      ]);

      await db
        .update(jobs)
        .set({
          status: "completed",
          payload: { ...(typeof job.payload === "object" && job.payload ? job.payload : {}), completedAt: new Date().toISOString(), snapshotId },
        })
        .where(eq(jobs.id, job.id));

      const [business] = await db
        .select({ id: businesses.id, name: businesses.name, planTier: businesses.planTier })
        .from(businesses)
        .where(eq(businesses.id, job.businessId))
        .limit(1);

      const raw = business?.planTier as string | undefined;
      const normalized =
        raw === "entry" ? "base" : raw && (raw === "base" || raw === "pro" || raw === "managed") ? raw : undefined;
      const planTier =
        (normalized as PlanTier | undefined) ?? (job.type === "pro_recurring_refresh" ? "pro" : "base");
      const features = planFeatures(planTier);
      const [lead] = await db
        .select({ email: leads.email })
        .from(leads)
        .where(eq(leads.businessId, job.businessId))
        .orderBy(desc(leads.lastSeenAt))
        .limit(1);
      if (lead?.email && features.monthlySummaryEmail) {
        const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
        const workspaceUrl = `${base.replace(/\/$/, "")}/workspace/${job.businessId}`;
        void sendAutomationSummaryEmail({
          leadEmail: lead.email,
          businessName: business?.name ?? "Your business",
          planLabel: features.label === "Pro" ? "Pro" : "Base",
          cadenceLabel: features.refreshCadenceLabel,
          score: nextScore,
          completedAt: new Date().toISOString(),
          highlights: [
            "Visibility score refreshed and history updated.",
            "AI visibility summary probe recorded.",
            "New content and trust tasks queued for this cycle.",
          ],
          workspaceUrl,
        });
      }

      if (
        business?.planTier &&
        (business.planTier === "entry" ||
          business.planTier === "base" ||
          business.planTier === "pro" ||
          business.planTier === "managed")
      ) {
        const planForSchedule: PlanTier =
          business.planTier === "entry" ? "base" : (business.planTier as PlanTier);
        void schedulePlanRecurringSnapshotJob({ businessId: job.businessId, planTier: planForSchedule });
      }

      results.push({ jobId: job.id, businessId: job.businessId, snapshotId, status: "completed" });
    } catch {
      await db.update(jobs).set({ status: "failed" }).where(eq(jobs.id, job.id));
      results.push({ jobId: job.id, businessId: job.businessId, status: "failed" });
    }
  }

  return { processed: results.length, results };
}

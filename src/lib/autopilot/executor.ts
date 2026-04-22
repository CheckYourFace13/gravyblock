import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, lte, or } from "drizzle-orm";
import {
  aiVisibilityChecks,
  contentQueue,
  getDb,
  jobs,
  publishedContent,
  publishingJobs,
  publishingTargets,
  visibilitySnapshots,
} from "@/lib/db";

function levelForScore(score: number) {
  if (score >= 78) return "low";
  if (score >= 62) return "medium";
  return "high";
}

function clampScore(score: number) {
  return Math.max(1, Math.min(100, score));
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

export async function scheduleRecurringSnapshotJob(input: { businessId: string; runAfterMs?: number }) {
  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_URL is required for recurring automation scheduling");
  }
  const runAfter = new Date(Date.now() + Math.max(0, input.runAfterMs ?? 0));
  const id = randomUUID();
  await db.insert(jobs).values({
    id,
    businessId: input.businessId,
    type: "recurring_snapshot_refresh",
    payload: { source: "manual_schedule", scheduledAt: new Date().toISOString() },
    status: "pending",
    runAfter,
  });
  return { jobId: id, runAfter: runAfter.toISOString() };
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
        eq(jobs.type, "recurring_snapshot_refresh"),
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
        prompt: "recurring local-intent autopilot probe",
        engine: "synthetic",
        mentionFound: nextScore >= 65 ? "true" : "false",
        sentiment: nextScore >= 70 ? "positive" : "neutral",
        confidence: Math.min(95, nextScore),
      });

      await db
        .update(jobs)
        .set({
          status: "completed",
          payload: { ...(typeof job.payload === "object" && job.payload ? job.payload : {}), completedAt: new Date().toISOString(), snapshotId },
        })
        .where(eq(jobs.id, job.id));

      results.push({ jobId: job.id, businessId: job.businessId, snapshotId, status: "completed" });
    } catch {
      await db.update(jobs).set({ status: "failed" }).where(eq(jobs.id, job.id));
      results.push({ jobId: job.id, businessId: job.businessId, status: "failed" });
    }
  }

  return { processed: results.length, results };
}

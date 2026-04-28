import { and, desc, eq, gte, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  contentQueue,
  operatorTasks,
  publishedContent,
  visibilitySnapshots,
} from "@/lib/db/schema";

export type ActivityItem = {
  id: string;
  type: "content_published" | "snapshot_taken" | "task_created" | "task_completed" | "outreach_sent" | "content_queued";
  label: string;
  detail?: string;
  score?: number;
  createdAt: Date;
};

export async function getBusinessActivity(businessId: string, limitDays = 30): Promise<ActivityItem[]> {
  const db = getDb();
  if (!db) return [];

  const since = new Date();
  since.setDate(since.getDate() - limitDays);

  const [published, snapshots, tasks, queued] = await Promise.all([
    db
      .select({
        id: publishedContent.id,
        title: publishedContent.title,
        channel: publishedContent.channel,
        publicUrl: publishedContent.publicUrl,
        createdAt: publishedContent.createdAt,
      })
      .from(publishedContent)
      .where(
        and(
          eq(publishedContent.businessId, businessId),
          gte(publishedContent.createdAt, since),
        ),
      )
      .orderBy(desc(publishedContent.createdAt))
      .limit(40),

    db
      .select({
        id: visibilitySnapshots.id,
        overallScore: visibilitySnapshots.overallScore,
        opportunityLevel: visibilitySnapshots.opportunityLevel,
        createdAt: visibilitySnapshots.createdAt,
      })
      .from(visibilitySnapshots)
      .where(
        and(
          eq(visibilitySnapshots.businessId, businessId),
          gte(visibilitySnapshots.createdAt, since),
        ),
      )
      .orderBy(desc(visibilitySnapshots.createdAt))
      .limit(40),

    db
      .select({
        id: operatorTasks.id,
        title: operatorTasks.title,
        detail: operatorTasks.detail,
        queue: operatorTasks.queue,
        status: operatorTasks.status,
        createdAt: operatorTasks.createdAt,
      })
      .from(operatorTasks)
      .where(
        and(
          eq(operatorTasks.businessId, businessId),
          gte(operatorTasks.createdAt, since),
        ),
      )
      .orderBy(desc(operatorTasks.createdAt))
      .limit(40),

    db
      .select({
        id: contentQueue.id,
        title: contentQueue.title,
        kind: contentQueue.kind,
        targetKeyword: contentQueue.targetKeyword,
        createdAt: contentQueue.createdAt,
      })
      .from(contentQueue)
      .where(
        and(
          eq(contentQueue.businessId, businessId),
          eq(contentQueue.status, "queued"),
          gte(contentQueue.createdAt, since),
        ),
      )
      .orderBy(desc(contentQueue.createdAt))
      .limit(40),
  ]);

  const items: ActivityItem[] = [];

  for (const row of published) {
    items.push({
      id: row.id,
      type: "content_published",
      label: `Content published: ${row.title}`,
      detail: row.publicUrl ?? row.channel,
      createdAt: row.createdAt,
    });
  }

  for (const row of snapshots) {
    items.push({
      id: row.id,
      type: "snapshot_taken",
      label: "Visibility snapshot recorded",
      detail: `Score: ${row.overallScore} · ${row.opportunityLevel}`,
      score: row.overallScore,
      createdAt: row.createdAt,
    });
  }

  for (const row of tasks) {
    const isOutreach = row.queue === "outreach_ops";
    const isDone = row.status === "done" || row.status === "completed";

    let type: ActivityItem["type"];
    if (isOutreach) {
      type = "outreach_sent";
    } else if (isDone) {
      type = "task_completed";
    } else {
      type = "task_created";
    }

    items.push({
      id: row.id,
      type,
      label: isOutreach
        ? `Outreach drafted: ${row.title}`
        : isDone
          ? `Task completed: ${row.title}`
          : `Task created: ${row.title}`,
      detail: row.detail ?? undefined,
      createdAt: row.createdAt,
    });
  }

  for (const row of queued) {
    items.push({
      id: row.id,
      type: "content_queued",
      label: `Content queued: ${row.title}`,
      detail: row.targetKeyword ? `Keyword: ${row.targetKeyword}` : row.kind,
      createdAt: row.createdAt,
    });
  }

  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return items.slice(0, 40);
}

/**
 * One-time cleanup of work items produced by the retired template engine:
 * generic auto-generated "tasks" that assigned recurring labor to customers,
 * and queued drafts/posts whose text was written without verified facts
 * (placeholder titles like "Why your area Residents Choose ...", invented
 * Q&As/GBP/social drafts). Nothing is deleted — rows are marked superseded so
 * they can never be published or shown as to-dos. Runs once (jobs marker).
 */

import { and, eq, inArray, ne } from "drizzle-orm";
import { contentQueue, getDb, jobs, operatorTasks, publishingJobs } from "@/lib/db";

const MARKER = "legacy_cleanup_truth_v1";

export async function runLegacyCleanupOnce(): Promise<{ ran: boolean; tasks?: number; content?: number; publishing?: number }> {
  const db = getDb();
  if (!db) return { ran: false };
  const [done] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.type, MARKER)).limit(1);
  if (done) return { ran: false };

  const tasks = await db
    .update(operatorTasks)
    .set({ status: "superseded" })
    .where(
      and(
        inArray(operatorTasks.queue, ["citation_ops", "review_ops", "local_trust_ops", "general", "gbp_ops", "authority_ops", "content_ops", "outreach_ops", "reputation_ops"]),
        inArray(operatorTasks.status, ["queued", "pending", "draft_generated"]),
      ),
    )
    .returning({ id: operatorTasks.id });

  const content = await db
    .update(contentQueue)
    .set({ status: "superseded" })
    .where(and(inArray(contentQueue.status, ["queued", "ready", "generated", "approved", "pending_approval", "awaiting_connection"]), ne(contentQueue.variant, "verified_truth")))
    .returning({ id: contentQueue.id });

  const publishing = await db
    .update(publishingJobs)
    .set({ status: "failed", responseLog: "Superseded: internal noindex publishing was retired; content now publishes only to the customer's own website." })
    .where(inArray(publishingJobs.status, ["queued", "pending"]))
    .returning({ id: publishingJobs.id });

  await db.insert(jobs).values({ type: MARKER, status: "completed", payload: { tasks: tasks.length, content: content.length, publishing: publishing.length } });
  return { ran: true, tasks: tasks.length, content: content.length, publishing: publishing.length };
}

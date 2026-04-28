"use server";

import { and, eq } from "drizzle-orm";
import { getDb, contentQueue, businesses } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth/customer-guards";

export type QueuedDraft = {
  id: string;
  kind: string;
  title: string;
  outline: string | null;
  targetKeyword: string | null;
  status: string;
  createdAt: string;
};

export async function getQueuedDrafts(businessId: string): Promise<QueuedDraft[]> {
  await requireBusinessAccess(businessId);
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: contentQueue.id,
      kind: contentQueue.kind,
      title: contentQueue.title,
      outline: contentQueue.outline,
      targetKeyword: contentQueue.targetKeyword,
      status: contentQueue.status,
      createdAt: contentQueue.createdAt,
    })
    .from(contentQueue)
    .where(
      and(
        eq(contentQueue.businessId, businessId),
        eq(contentQueue.status, "queued"),
      ),
    )
    .orderBy(contentQueue.createdAt)
    .limit(20);

  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Mark a queued item as "approved" so the autopilot prioritizes it next publish cycle. */
export async function approveQueuedDraft(
  businessId: string,
  queueItemId: string,
): Promise<{ ok: boolean }> {
  await requireBusinessAccess(businessId);
  const db = getDb();
  if (!db) return { ok: false };

  await db
    .update(contentQueue)
    .set({ status: "approved" })
    .where(
      and(
        eq(contentQueue.id, queueItemId),
        eq(contentQueue.businessId, businessId),
      ),
    );

  return { ok: true };
}

/** Dismiss a queued item so it won't be published. */
export async function dismissQueuedDraft(
  businessId: string,
  queueItemId: string,
): Promise<{ ok: boolean }> {
  await requireBusinessAccess(businessId);
  const db = getDb();
  if (!db) return { ok: false };

  await db
    .update(contentQueue)
    .set({ status: "dismissed" })
    .where(
      and(
        eq(contentQueue.id, queueItemId),
        eq(contentQueue.businessId, businessId),
      ),
    );

  return { ok: true };
}

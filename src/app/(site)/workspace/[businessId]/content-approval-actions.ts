"use server";

import { and, eq, or } from "drizzle-orm";
import { getDb, contentQueue, businesses } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth/customer-guards";

// Facebook and Instagram have a real posting integration (facebook-poster
// worker, Graph API) — approving them queues them for auto-posting.
const SOCIAL_KINDS = ["facebook_post", "instagram_caption"] as const;

export type QueuedDraft = {
  id: string;
  kind: string;
  title: string;
  outline: string | null;
  targetKeyword: string | null;
  status: string;
  variant: string;
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
      variant: contentQueue.variant,
      createdAt: contentQueue.createdAt,
    })
    .from(contentQueue)
    .where(
      and(
        eq(contentQueue.businessId, businessId),
        // Include regular queued drafts AND social posts awaiting approval
        or(
          eq(contentQueue.status, "queued"),
          eq(contentQueue.status, "pending_approval"),
          eq(contentQueue.status, "approved"),
        ),
      ),
    )
    .orderBy(contentQueue.createdAt)
    .limit(30);

  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Mark a queued item as approved.
 *  - Social posts (facebook_post, instagram_caption) → "queued"
 *    so the facebook-poster worker picks them up immediately.
 *  - Everything else → "approved" (autopilot priority flag).
 */
export async function approveQueuedDraft(
  businessId: string,
  queueItemId: string,
): Promise<{ ok: boolean }> {
  await requireBusinessAccess(businessId);
  const db = getDb();
  if (!db) return { ok: false };

  // Fetch the item kind to decide target status
  const [item] = await db
    .select({ kind: contentQueue.kind })
    .from(contentQueue)
    .where(and(eq(contentQueue.id, queueItemId), eq(contentQueue.businessId, businessId)))
    .limit(1);

  if (!item) return { ok: false };

  const isSocial = (SOCIAL_KINDS as readonly string[]).includes(item.kind);
  const nextStatus = isSocial ? "queued" : "approved";

  await db
    .update(contentQueue)
    .set({ status: nextStatus })
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

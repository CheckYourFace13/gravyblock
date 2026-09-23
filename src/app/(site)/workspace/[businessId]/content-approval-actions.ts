"use server";

import { and, eq, or } from "drizzle-orm";
import { getDb, contentQueue } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth/customer-guards";

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

// Everything with status "queued" publishes automatically — the WordPress/
// Webflow/Shopify publisher and the Facebook/Instagram posters both pick up
// "queued" items on their own schedule. There is no approval gate; this
// panel is read-only except for "Skip", which pulls an item out before it
// goes out.
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
        or(
          eq(contentQueue.status, "queued"),
          eq(contentQueue.status, "published"),
        ),
      ),
    )
    .orderBy(contentQueue.createdAt)
    .limit(30);

  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Pull a queued item out so it won't publish. */
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

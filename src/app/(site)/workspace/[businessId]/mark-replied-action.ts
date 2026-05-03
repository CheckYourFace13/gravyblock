"use server";

import { eq } from "drizzle-orm";
import { getDb, businessReviews } from "@/lib/db";

export async function markReviewReplied(reviewId: string): Promise<{ ok: boolean }> {
  const db = getDb();
  if (!db) return { ok: false };
  await db
    .update(businessReviews)
    .set({ status: "replied", repliedAt: new Date() })
    .where(eq(businessReviews.id, reviewId));
  return { ok: true };
}

export async function markReviewNew(reviewId: string): Promise<{ ok: boolean }> {
  const db = getDb();
  if (!db) return { ok: false };
  await db
    .update(businessReviews)
    .set({ status: "new", repliedAt: null })
    .where(eq(businessReviews.id, reviewId));
  return { ok: true };
}

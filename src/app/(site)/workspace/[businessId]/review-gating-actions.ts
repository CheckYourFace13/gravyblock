"use server";

import { eq, desc } from "drizzle-orm";
import { getDb, reviewRequestLinks, reviewRequestResponses, businesses } from "@/lib/db";

export type ReviewGatingData = {
  link: { id: string; token: string; positiveRedirectUrl: string | null; threshold: number; active: boolean } | null;
  responses: { id: string; rating: number; feedback: string | null; submittedAt: Date }[];
  reviewUrl: string | null;
};

/** Build the Google review URL from place_id */
function googleReviewUrl(placeId: string | null): string | null {
  if (!placeId) return null;
  return `https://search.google.com/local/writereview?placeid=${placeId}`;
}

export async function getReviewGatingData(businessId: string): Promise<ReviewGatingData> {
  const db = getDb();
  if (!db) return { link: null, responses: [], reviewUrl: null };

  const [biz] = await db
    .select({ placeId: businesses.placeId })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  const reviewUrl = googleReviewUrl(biz?.placeId ?? null);

  const [existingLink] = await db
    .select()
    .from(reviewRequestLinks)
    .where(eq(reviewRequestLinks.businessId, businessId))
    .orderBy(desc(reviewRequestLinks.createdAt))
    .limit(1);

  const responses = existingLink
    ? await db
        .select({
          id: reviewRequestResponses.id,
          rating: reviewRequestResponses.rating,
          feedback: reviewRequestResponses.feedback,
          submittedAt: reviewRequestResponses.submittedAt,
        })
        .from(reviewRequestResponses)
        .where(eq(reviewRequestResponses.businessId, businessId))
        .orderBy(desc(reviewRequestResponses.submittedAt))
        .limit(50)
    : [];

  return {
    link: existingLink
      ? {
          id: existingLink.id,
          token: existingLink.token,
          positiveRedirectUrl: existingLink.positiveRedirectUrl,
          threshold: existingLink.threshold,
          active: existingLink.active === "true",
        }
      : null,
    responses,
    reviewUrl,
  };
}

export async function createReviewGatingLink(businessId: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "Database unavailable" };

  // Deactivate any existing links
  await db
    .update(reviewRequestLinks)
    .set({ active: "false" })
    .where(eq(reviewRequestLinks.businessId, businessId));

  const [biz] = await db
    .select({ placeId: businesses.placeId })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  const [newLink] = await db
    .insert(reviewRequestLinks)
    .values({
      businessId,
      positiveRedirectUrl: googleReviewUrl(biz?.placeId ?? null),
      threshold: 4,
      active: "true",
    })
    .returning({ token: reviewRequestLinks.token });

  if (!newLink) return { ok: false, error: "Failed to create link" };
  return { ok: true, token: newLink.token };
}

export async function deactivateReviewGatingLink(businessId: string): Promise<{ ok: boolean }> {
  const db = getDb();
  if (!db) return { ok: false };
  await db
    .update(reviewRequestLinks)
    .set({ active: "false" })
    .where(eq(reviewRequestLinks.businessId, businessId));
  return { ok: true };
}

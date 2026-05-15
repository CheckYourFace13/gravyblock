/**
 * ─── Feature #9: Facebook & Instagram Auto-Posting ───────────────────────────
 * Finds queued facebook_post and instagram_caption content items and posts them
 * automatically via the Facebook Graph API.
 *
 * Reads credentials from businessConfigs:
 *   facebookPageId        — Facebook Page ID
 *   facebookAccessToken   — long-lived Page access token
 *   instagramAccountId    — Instagram Business Account ID
 *   instagramHandle       — (used as fallback identifier)
 *
 * Called by the worker once per tick. Max 3 posts per run.
 */

import { randomUUID } from "crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { getDb, businesses, businessConfigs, contentQueue, publishedContent } from "@/lib/db";
import { postToFacebookPage, postToInstagram } from "@/lib/integrations/facebook";
import { getArticlePhoto } from "@/lib/integrations/unsplash";

const PAID_TIERS = ["growth", "pro", "agency", "managed"];
const MAX_PER_RUN = 3;

type FacebookConfig = {
  pageId: string | null;
  accessToken: string | null;
  igAccountId: string | null;
};

function getFacebookConfig(config: Record<string, unknown> | null): FacebookConfig {
  if (!config) return { pageId: null, accessToken: null, igAccountId: null };
  return {
    pageId: (config.facebookPageId as string) ?? null,
    accessToken: (config.facebookAccessToken as string) ?? null,
    igAccountId: (config.instagramAccountId as string) ?? null,
  };
}

export type FacebookPostBatchResult = {
  attempted: number;
  posted: number;
  skipped: number;
  errors: number;
};

export async function runFacebookPostingBatch(): Promise<FacebookPostBatchResult> {
  const db = getDb();
  if (!db) return { attempted: 0, posted: 0, skipped: 0, errors: 0 };

  // Find queued social content for paid businesses
  const items = await db
    .select({
      id: contentQueue.id,
      businessId: contentQueue.businessId,
      title: contentQueue.title,
      outline: contentQueue.outline,
      kind: contentQueue.kind,
      targetKeyword: contentQueue.targetKeyword,
    })
    .from(contentQueue)
    .innerJoin(businesses, eq(businesses.id, contentQueue.businessId))
    .where(
      and(
        or(
          eq(contentQueue.kind, "facebook_post"),
          eq(contentQueue.kind, "instagram_caption"),
        ),
        eq(contentQueue.status, "queued"),
        inArray(businesses.planTier, PAID_TIERS),
      ),
    )
    .limit(MAX_PER_RUN);

  const result: FacebookPostBatchResult = {
    attempted: items.length,
    posted: 0,
    skipped: 0,
    errors: 0,
  };

  for (const item of items) {
    if (!item.businessId || !item.outline) {
      await db.update(contentQueue).set({ status: "failed" }).where(eq(contentQueue.id, item.id));
      result.errors++;
      continue;
    }

    // Fetch business config for social credentials
    const [configRow] = await db
      .select({ config: businessConfigs })
      .from(businessConfigs)
      .where(eq(businessConfigs.businessId, item.businessId))
      .limit(1);

    const fbConfig = getFacebookConfig(configRow?.config as Record<string, unknown> | null);

    // Mark as ready
    await db.update(contentQueue).set({ status: "ready" }).where(eq(contentQueue.id, item.id));

    let postResult: { ok: boolean; postId?: string; error?: string; skipped?: boolean } = { ok: false, error: "no_credentials", skipped: true };
    let channel = item.kind === "instagram_caption" ? "instagram" : "facebook";

    try {
      if (item.kind === "facebook_post" && fbConfig.pageId && fbConfig.accessToken) {
        postResult = await postToFacebookPage({
          pageId: fbConfig.pageId,
          accessToken: fbConfig.accessToken,
          message: item.outline,
        });
      } else if (item.kind === "instagram_caption" && fbConfig.igAccountId && fbConfig.accessToken) {
        // Try to get a relevant image for Instagram (image required)
        const photo = await getArticlePhoto(item.targetKeyword ?? item.title).catch(() => null);
        postResult = await postToInstagram({
          igAccountId: fbConfig.igAccountId,
          accessToken: fbConfig.accessToken,
          caption: item.outline,
          imageUrl: photo?.url,
        });
      } else {
        postResult = { ok: false, error: "no_credentials", skipped: true };
      }

      if (postResult.ok) {
        const artifactId = randomUUID();
        const postUrl = item.kind === "facebook_post"
          ? `https://facebook.com/${fbConfig.pageId}/posts/${postResult.postId}`
          : `https://instagram.com/p/${postResult.postId}`;

        await db.insert(publishedContent).values({
          id: artifactId,
          businessId: item.businessId,
          locationId: null,
          queueId: item.id,
          title: item.title,
          body: item.outline,
          channel,
          publicUrl: postUrl,
          status: "published",
        });

        await db.update(contentQueue).set({ status: "published" }).where(eq(contentQueue.id, item.id));
        result.posted++;

        console.info("[facebook-poster] posted", { businessId: item.businessId, channel, kind: item.kind });
      } else if (postResult.skipped) {
        await db.update(contentQueue).set({ status: "queued" }).where(eq(contentQueue.id, item.id));
        result.skipped++;
      } else {
        await db.update(contentQueue).set({ status: "failed" }).where(eq(contentQueue.id, item.id));
        console.warn("[facebook-poster] post failed", { businessId: item.businessId, error: postResult.error });
        result.errors++;
      }
    } catch (err) {
      await db.update(contentQueue).set({ status: "failed" }).where(eq(contentQueue.id, item.id));
      console.error("[facebook-poster] unexpected error", { error: String(err) });
      result.errors++;
    }
  }

  return result;
}

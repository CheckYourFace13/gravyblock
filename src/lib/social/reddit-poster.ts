/**
 * Reddit posting orchestrator.
 *
 * Finds queued reddit_post content items for paid businesses and
 * submits them to the appropriate subreddit via the Reddit API.
 *
 * Called by the worker once per tick. Max 3 posts per run to stay
 * well within Reddit's rate limits.
 *
 * Requires: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD
 */

import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, businesses, contentQueue, publishedContent } from "@/lib/db";
import { submitRedditPost, selectSubreddit, redditConfigured } from "@/lib/integrations/reddit";

const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];
const MAX_PER_RUN = 3;

function cityFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",");
  if (parts.length >= 2) return parts[1].trim();
  return null;
}

export type RedditPostBatchResult = {
  attempted: number;
  posted: number;
  skipped: number;
  errors: number;
};

export async function runRedditPostingBatch(): Promise<RedditPostBatchResult> {
  if (!redditConfigured()) {
    return { attempted: 0, posted: 0, skipped: 0, errors: 0 };
  }

  const db = getDb();
  if (!db) return { attempted: 0, posted: 0, skipped: 0, errors: 0 };

  // Find queued reddit_post items for paid businesses
  const items = await db
    .select({
      id: contentQueue.id,
      businessId: contentQueue.businessId,
      title: contentQueue.title,
      outline: contentQueue.outline,
      targetKeyword: contentQueue.targetKeyword,
    })
    .from(contentQueue)
    .innerJoin(businesses, eq(businesses.id, contentQueue.businessId))
    .where(
      and(
        eq(contentQueue.kind, "reddit_post"),
        eq(contentQueue.status, "queued"),
        inArray(businesses.planTier, PAID_TIERS),
      ),
    )
    .limit(MAX_PER_RUN);

  const result: RedditPostBatchResult = {
    attempted: items.length,
    posted: 0,
    skipped: 0,
    errors: 0,
  };

  for (const item of items) {
    if (!item.businessId || !item.outline) {
      // Mark as failed — nothing to post
      await db.update(contentQueue).set({ status: "failed" }).where(eq(contentQueue.id, item.id));
      result.errors++;
      continue;
    }

    // Fetch business details for subreddit selection
    const [biz] = await db
      .select({
        name: businesses.name,
        address: businesses.address,
        vertical: businesses.vertical,
        primaryCategory: businesses.primaryCategory,
      })
      .from(businesses)
      .where(eq(businesses.id, item.businessId))
      .limit(1);

    if (!biz) {
      result.errors++;
      continue;
    }

    const city = cityFromAddress(biz.address);
    const subreddit = selectSubreddit({
      city,
      vertical: biz.vertical,
      primaryCategory: biz.primaryCategory,
    });

    // Mark as "ready" to signal an attempt is in progress
    await db.update(contentQueue).set({ status: "ready" }).where(eq(contentQueue.id, item.id));

    try {
      const postResult = await submitRedditPost({
        subreddit,
        title: item.title,
        text: item.outline,
      });

      if (postResult.ok) {
        const artifactId = randomUUID();

        await db.insert(publishedContent).values({
          id: artifactId,
          businessId: item.businessId,
          locationId: null,
          queueId: item.id,
          title: item.title,
          body: item.outline,
          channel: "reddit",
          publicUrl: postResult.postUrl,
          status: "published",
        });

        await db.update(contentQueue).set({ status: "published" }).where(eq(contentQueue.id, item.id));

        console.info("[reddit-poster] posted", {
          businessId: item.businessId,
          subreddit: `r/${subreddit}`,
          postUrl: postResult.postUrl,
        });

        result.posted++;
      } else if (postResult.skipped) {
        // Credentials not configured — revert to queued
        await db.update(contentQueue).set({ status: "queued" }).where(eq(contentQueue.id, item.id));
        result.skipped++;
      } else {
        // API error — mark failed so it doesn't loop forever
        await db
          .update(contentQueue)
          .set({ status: "failed" })
          .where(eq(contentQueue.id, item.id));

        console.warn("[reddit-poster] post failed", {
          businessId: item.businessId,
          subreddit: `r/${subreddit}`,
          error: postResult.error,
        });

        result.errors++;
      }
    } catch (err) {
      await db.update(contentQueue).set({ status: "failed" }).where(eq(contentQueue.id, item.id));
      console.error("[reddit-poster] unexpected error", {
        businessId: item.businessId,
        error: err instanceof Error ? err.message : String(err),
      });
      result.errors++;
    }
  }

  return result;
}

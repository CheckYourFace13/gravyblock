/**
 * ─── Feature #1: Rank Tracking Sync Batch ────────────────────────────────────
 * Fetches keyword rankings from Google Search Console for all businesses
 * with an active Google OAuth connection and a Search Console property.
 *
 * Stores results in keyword_rankings table.
 * Worker calls this once per day.
 */

import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb, businesses, googleOauthConnections, keywordRankings } from "@/lib/db";
import { fetchKeywordRankings } from "@/lib/integrations/search-console";

const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];

export type RankSyncResult = {
  synced: number;
  keywords: number;
};

export async function runRankTrackingBatch(limit = 10): Promise<RankSyncResult> {
  const db = getDb();
  if (!db) return { synced: 0, keywords: 0 };

  // Find paid businesses with GSC connected
  const connections = await db
    .select({
      businessId: googleOauthConnections.businessId,
      siteUrl: googleOauthConnections.searchConsoleProperty,
    })
    .from(googleOauthConnections)
    .innerJoin(businesses, eq(businesses.id, googleOauthConnections.businessId))
    .where(
      and(
        inArray(businesses.planTier, PAID_TIERS),
        // Only fetch if they have a search console property set
      ),
    )
    .limit(limit);

  const eligible = connections.filter((c) => Boolean(c.siteUrl));

  let synced = 0;
  let totalKeywords = 0;

  // Check which ones haven't been synced today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const conn of eligible) {
    if (!conn.siteUrl) continue;

    // Skip if we already synced rankings today for this business
    const [recent] = await db
      .select({ id: keywordRankings.id })
      .from(keywordRankings)
      .where(
        and(
          eq(keywordRankings.businessId, conn.businessId),
          gte(keywordRankings.createdAt, today),
        ),
      )
      .limit(1);

    if (recent) continue;

    try {
      const rankings = await fetchKeywordRankings({
        businessId: conn.businessId,
        siteUrl: conn.siteUrl,
        days: 28,
      });

      if (rankings.length === 0) continue;

      // Delete yesterday's data before inserting fresh
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      // Insert new rankings
      const dateStr = new Date().toISOString().slice(0, 10);
      await db.insert(keywordRankings).values(
        rankings.map((r) => ({
          businessId: conn.businessId,
          keyword: r.keyword,
          position: String(r.position),
          clicks: r.clicks,
          impressions: r.impressions,
          ctr: String(r.ctr),
          date: dateStr,
        })),
      );

      synced++;
      totalKeywords += rankings.length;
    } catch (err) {
      console.error("[rank-tracker] sync failed", {
        businessId: conn.businessId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { synced, keywords: totalKeywords };
}

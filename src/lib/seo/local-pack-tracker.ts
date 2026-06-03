/**
 * Real local pack rank tracking via DataForSEO SERP API.
 *
 * Uses the Google Maps "live advanced" endpoint which returns the actual
 * local pack (#1, #2, #3) for any keyword in any city — real SERP data,
 * not a Places API estimate.
 *
 * Requires: DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD in .env
 * Cost: ~$0.003 per keyword check
 *
 * Stores results in keyword_rankings table alongside GSC data.
 * Worker calls this weekly (not daily — more expensive than GSC).
 */

import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb, businesses, businessConfigs, keywordRankings } from "@/lib/db";

const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];

type DataForSeoMapsItem = {
  type: string;
  rank_group: number;
  rank_absolute: number;
  title: string;
  url?: string;
  rating?: { value: number; votes_count: number };
  place_id?: string;
};

type DataForSeoTask = {
  status_code: number;
  result?: Array<{
    items?: DataForSeoMapsItem[];
  }>;
};

type DataForSeoResponse = {
  tasks?: DataForSeoTask[];
};

function getAuth(): string | null {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return null;
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

function extractCity(address: string | null | undefined): string {
  if (!address) return "";
  const parts = address.split(",");
  if (parts.length >= 2) return parts[1].trim();
  return "";
}

/** Checks local pack position for a business for a single keyword. Returns 1-based rank or null. */
async function checkLocalPackRank(params: {
  keyword: string;
  city: string;
  state: string;
  businessName: string;
}): Promise<{ rank: number | null; packSize: number }> {
  const auth = getAuth();
  if (!auth) return { rank: null, packSize: 0 };

  const locationString = `${params.city},${params.state},United States`;

  try {
    const res = await fetch("https://api.dataforseo.com/v3/serp/google/maps/live/advanced", {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          keyword: `${params.keyword} ${params.city}`,
          location_name: locationString,
          language_code: "en",
          depth: 20,
        },
      ]),
    });

    if (!res.ok) {
      console.warn("[local-pack-tracker] DataForSEO API error", { status: res.status });
      return { rank: null, packSize: 0 };
    }

    const data = (await res.json()) as DataForSeoResponse;
    const items = data.tasks?.[0]?.result?.[0]?.items ?? [];
    const mapItems = items.filter((i) => i.type === "maps_search_item");

    const nameLower = params.businessName.toLowerCase();
    const match = mapItems.find((item) =>
      item.title?.toLowerCase().includes(nameLower) ||
      nameLower.includes(item.title?.toLowerCase() ?? "NOMATCH"),
    );

    return {
      rank: match ? match.rank_group + 1 : null, // rank_group is 0-based
      packSize: mapItems.length,
    };
  } catch (err) {
    console.error("[local-pack-tracker] fetch failed", { error: err instanceof Error ? err.message : String(err) });
    return { rank: null, packSize: 0 };
  }
}

export async function runLocalPackTrackingBatch(limit = 5): Promise<{ synced: number; keywords: number }> {
  const auth = getAuth();
  if (!auth) {
    console.warn("[local-pack-tracker] DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD not set — skipping");
    return { synced: 0, keywords: 0 };
  }

  const db = getDb();
  if (!db) return { synced: 0, keywords: 0 };

  // Run weekly — skip if already ran this week
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const bizList = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      address: businesses.address,
      vertical: businesses.vertical,
      primaryCategory: businesses.primaryCategory,
    })
    .from(businesses)
    .where(inArray(businesses.planTier, PAID_TIERS))
    .limit(limit * 3);

  let synced = 0;
  let totalKeywords = 0;

  for (const biz of bizList.slice(0, limit)) {
    // Skip if we already ran local pack tracking this week
    const [recent] = await db
      .select({ id: keywordRankings.id })
      .from(keywordRankings)
      .where(
        and(
          eq(keywordRankings.businessId, biz.id),
          eq(keywordRankings.source, "dataforseo"),
          gte(keywordRankings.createdAt, weekAgo),
        ),
      )
      .limit(1)
      .catch(() => []);

    if (recent) continue;

    const city = extractCity(biz.address);
    const statePart = biz.address?.split(",")?.[2]?.trim()?.split(" ")?.[0] ?? "";
    if (!city) continue;

    const industry = biz.vertical ?? biz.primaryCategory ?? "local business";

    // Check 3 core keywords per business
    const keywords = [
      industry,
      `${industry} near me`,
      `best ${industry}`,
    ];

    const dateStr = new Date().toISOString().slice(0, 10);

    for (const keyword of keywords) {
      const { rank, packSize } = await checkLocalPackRank({
        keyword,
        city,
        state: statePart,
        businessName: biz.name,
      });

      await db.insert(keywordRankings).values({
        businessId: biz.id,
        keyword: `${keyword} ${city}`,
        position: rank != null ? String(rank) : null,
        clicks: 0,
        impressions: packSize,
        ctr: "0",
        date: dateStr,
        source: "dataforseo",
      }).catch(() => null);

      totalKeywords++;
      // Small delay between DataForSEO calls
      await new Promise((r) => setTimeout(r, 300));
    }

    synced++;
  }

  return { synced, keywords: totalKeywords };
}

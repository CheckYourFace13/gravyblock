/**
 * ─── Feature #1: Rank Tracking via Google Search Console ─────────────────────
 * Uses the existing Google OAuth connection (no new credentials needed).
 * Fetches top keyword positions from Search Console Search Analytics API.
 *
 * Docs: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
 */

import { getFreshAccessToken } from "@/lib/integrations/google-oauth";

export type KeywordRanking = {
  keyword: string;
  position: number;   // Average position (1 = top)
  clicks: number;
  impressions: number;
  ctr: number;        // 0–1
};

type GSCRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type GSCResponse = {
  rows?: GSCRow[];
  error?: { message?: string };
};

/**
 * Fetch top keyword rankings for a business using their connected GSC property.
 * Returns up to 20 keywords sorted by impressions desc.
 */
export async function fetchKeywordRankings(params: {
  businessId: string;
  siteUrl: string;
  days?: number;
}): Promise<KeywordRanking[]> {
  const token = await getFreshAccessToken(params.businessId);
  if (!token) return [];

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - (params.days ?? 28));

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  try {
    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(params.siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ["query"],
          rowLimit: 25,
          dimensionFilterGroups: [],
        }),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      console.warn("[search-console] query failed", { status: res.status });
      return [];
    }

    const json = (await res.json()) as GSCResponse;
    if (json.error) {
      console.warn("[search-console] api error", { msg: json.error.message });
      return [];
    }

    return (json.rows ?? []).map((row): KeywordRanking => ({
      keyword: row.keys?.[0] ?? "",
      position: Math.round((row.position ?? 0) * 10) / 10,
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: Math.round((row.ctr ?? 0) * 1000) / 1000,
    }));
  } catch (err) {
    console.error("[search-console] fetch error", { error: String(err) });
    return [];
  }
}

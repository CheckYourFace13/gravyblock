import type { SearchConsoleMetricRow } from "@/lib/report/types";
import { getFreshAccessToken, getGoogleConnection, updateGoogleConnectionProperty } from "./google-oauth";

type SearchConsoleRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type SearchConsoleResponse = {
  rows?: SearchConsoleRow[];
  siteEntry?: { permissionLevel?: string };
};

function endpointForProperty(propertyUrl: string) {
  return `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`;
}

async function querySearchConsole(input: {
  accessToken: string;
  propertyUrl: string;
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit: number;
}): Promise<SearchConsoleRow[]> {
  const res = await fetch(endpointForProperty(input.propertyUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      startDate: input.startDate,
      endDate: input.endDate,
      dimensions: input.dimensions,
      rowLimit: input.rowLimit,
    }),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as SearchConsoleResponse;
  return json.rows ?? [];
}

async function listVerifiedProperties(accessToken: string): Promise<string[]> {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { siteEntry?: Array<{ siteUrl?: string }> };
  return (json.siteEntry ?? []).map((s) => s.siteUrl ?? "").filter(Boolean);
}

function toMetricRows(rows: SearchConsoleRow[]): SearchConsoleMetricRow[] {
  return rows.map((r) => ({
    query: r.keys?.[0] ?? "",
    clicks: Math.round(r.clicks ?? 0),
    impressions: Math.round(r.impressions ?? 0),
    ctr: Number((r.ctr ?? 0).toFixed(4)),
    position: Number((r.position ?? 0).toFixed(2)),
  }));
}

export async function pullSearchConsoleMetrics(input: {
  propertyUrl?: string;
  days?: number;
  businessId?: string;
}) {
  const empty = {
    verified: false,
    propertyUrl: input.propertyUrl,
    topQueries: [] as SearchConsoleMetricRow[],
    topPages: [] as Array<{ page: string; clicks: number; impressions: number; ctr: number; position: number }>,
    aggregate: undefined as { clicks: number; impressions: number; ctr: number; averagePosition: number } | undefined,
    note: "Search Console not connected. Connect Google in your workspace settings.",
  };

  // Prefer per-business OAuth token
  let accessToken: string | null = null;
  let propertyUrl = input.propertyUrl?.trim() ?? "";

  if (input.businessId) {
    accessToken = await getFreshAccessToken(input.businessId);
    // Auto-detect property from stored connection if not provided
    if (accessToken && !propertyUrl) {
      const conn = await getGoogleConnection(input.businessId);
      if (conn?.searchConsoleProperty) {
        propertyUrl = conn.searchConsoleProperty;
      } else if (accessToken) {
        // Try to find the right property automatically
        const properties = await listVerifiedProperties(accessToken);
        if (properties.length > 0) {
          propertyUrl = properties[0];
          await updateGoogleConnectionProperty(input.businessId, { searchConsoleProperty: propertyUrl });
        }
      }
    }
  }

  // Fall back to static env token (legacy support)
  if (!accessToken) {
    accessToken = process.env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN ?? null;
  }

  if (!accessToken || !propertyUrl) return empty;

  const days = input.days ?? 28;
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - days);
  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);

  const [queryRows, pageRows] = await Promise.all([
    querySearchConsole({ accessToken, propertyUrl, startDate: start, endDate: end, dimensions: ["query"], rowLimit: 12 }),
    querySearchConsole({ accessToken, propertyUrl, startDate: start, endDate: end, dimensions: ["page"], rowLimit: 8 }),
  ]);

  const totalClicks = queryRows.reduce((sum, r) => sum + (r.clicks ?? 0), 0);
  const totalImpressions = queryRows.reduce((sum, r) => sum + (r.impressions ?? 0), 0);
  const weightedPos = queryRows.reduce((sum, r) => sum + (r.position ?? 0) * (r.impressions ?? 0), 0);
  const avgPos = totalImpressions ? weightedPos / totalImpressions : 0;

  return {
    verified: queryRows.length > 0 || pageRows.length > 0,
    propertyUrl,
    topQueries: toMetricRows(queryRows),
    topPages: pageRows.map((r) => ({
      page: r.keys?.[0] ?? "",
      clicks: Math.round(r.clicks ?? 0),
      impressions: Math.round(r.impressions ?? 0),
      ctr: Number((r.ctr ?? 0).toFixed(4)),
      position: Number((r.position ?? 0).toFixed(2)),
    })),
    aggregate: totalImpressions > 0
      ? { clicks: Math.round(totalClicks), impressions: Math.round(totalImpressions), ctr: Number((totalClicks / totalImpressions).toFixed(4)), averagePosition: Number(avgPos.toFixed(2)) }
      : undefined,
    note: queryRows.length || pageRows.length
      ? "Verified Google Search Console metrics."
      : "Search Console connected but no data yet for this property.",
  };
}

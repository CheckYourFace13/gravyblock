import type { SearchConsoleMetricRow } from "@/lib/report/types";

type SearchConsoleRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type SearchConsoleResponse = {
  rows?: SearchConsoleRow[];
};

function token() {
  return process.env.GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN ?? "";
}

function endpointForProperty(propertyUrl: string) {
  return `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`;
}

async function querySearchConsole(input: {
  propertyUrl: string;
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit: number;
}): Promise<SearchConsoleRow[]> {
  const accessToken = token();
  if (!accessToken) return [];

  const res = await fetch(endpointForProperty(input.propertyUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
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
}) {
  const propertyUrl = input.propertyUrl?.trim();
  const accessToken = token();

  if (!propertyUrl || !accessToken) {
    return {
      verified: false,
      propertyUrl,
      topQueries: [] as SearchConsoleMetricRow[],
      topPages: [] as Array<{
        page: string;
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
      }>,
      aggregate: undefined,
      note: accessToken
        ? "Search Console token present, but no property URL was connected."
        : "No Search Console token connected; showing estimated local visibility only.",
    };
  }

  const days = input.days ?? 28;
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - days);
  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);

  const [queryRows, pageRows] = await Promise.all([
    querySearchConsole({
      propertyUrl,
      startDate: start,
      endDate: end,
      dimensions: ["query"],
      rowLimit: 12,
    }),
    querySearchConsole({
      propertyUrl,
      startDate: start,
      endDate: end,
      dimensions: ["page"],
      rowLimit: 8,
    }),
  ]);

  const totalClicks = queryRows.reduce((sum, row) => sum + (row.clicks ?? 0), 0);
  const totalImpressions = queryRows.reduce((sum, row) => sum + (row.impressions ?? 0), 0);
  const weightedPosNumerator = queryRows.reduce(
    (sum, row) => sum + (row.position ?? 0) * (row.impressions ?? 0),
    0,
  );
  const avgPos = totalImpressions ? weightedPosNumerator / totalImpressions : 0;

  return {
    verified: queryRows.length > 0 || pageRows.length > 0,
    propertyUrl,
    topQueries: toMetricRows(queryRows),
    topPages: pageRows.map((row) => ({
      page: row.keys?.[0] ?? "",
      clicks: Math.round(row.clicks ?? 0),
      impressions: Math.round(row.impressions ?? 0),
      ctr: Number((row.ctr ?? 0).toFixed(4)),
      position: Number((row.position ?? 0).toFixed(2)),
    })),
    aggregate:
      totalImpressions > 0
        ? {
            clicks: Math.round(totalClicks),
            impressions: Math.round(totalImpressions),
            ctr: Number((totalClicks / totalImpressions).toFixed(4)),
            averagePosition: Number(avgPos.toFixed(2)),
          }
        : undefined,
    note:
      queryRows.length || pageRows.length
        ? "Verified Google Search Console metrics."
        : "Search Console is connected but returned no recent rows for this property.",
  };
}

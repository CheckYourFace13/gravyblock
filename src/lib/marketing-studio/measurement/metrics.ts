/**
 * Measurement vocabulary. Every number is labelled by how we know it:
 *   confirmed  the platform reported it for this post
 *   estimated  derived or inferred (never presented as a platform fact)
 *   unknown    the platform did not give it to us; stored as null, never as zero
 */
export type MetricStatus = "confirmed" | "estimated" | "unknown";
export type Metric = { value: number | null; status: MetricStatus; note?: string };
export type MetricSet = Partial<Record<MetricKey, Metric>>;

export const METRIC_KEYS = ["impressions", "views", "reach", "reactions", "comments", "shares", "link_clicks", "video_watch_seconds", "avg_watch_seconds", "site_visits", "conversions"] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export const confirmed = (value: number, note?: string): Metric => ({ value, status: "confirmed", note });
export const estimated = (value: number, note: string): Metric => ({ value, status: "estimated", note });
export const unknown = (note: string): Metric => ({ value: null, status: "unknown", note });

/** Fills every key that was not collected with an explicit unknown, so a missing number can never be read as zero. */
export function completeSet(set: MetricSet, why = "not reported by the platform"): Record<MetricKey, Metric> {
  const out = {} as Record<MetricKey, Metric>;
  for (const k of METRIC_KEYS) out[k] = set[k] ?? unknown(why);
  return out;
}

/** The confirmed value of a metric, or null when it is estimated or unknown. Learning only ever uses this. */
export const confirmedValue = (set: Partial<Record<MetricKey, Metric>> | null | undefined, k: MetricKey): number | null => {
  const m = set?.[k];
  return m && m.status === "confirmed" && typeof m.value === "number" ? m.value : null;
};

/** Merges snapshots from different sources; the newest confirmed value per key wins, otherwise the newest estimate, otherwise unknown. */
export function mergeSets(sets: MetricSet[]): Record<MetricKey, Metric> {
  const rank = { confirmed: 2, estimated: 1, unknown: 0 } as const;
  const out = completeSet({});
  for (const s of sets) {
    for (const k of METRIC_KEYS) {
      const m = s[k];
      if (!m) continue;
      if (rank[m.status] >= rank[out[k].status]) out[k] = m;
    }
  }
  return out;
}

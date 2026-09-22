/**
 * Generic measurement-plan evaluator. Runs on a schedule (no client monitoring): reads every
 * opportunity whose measurement window has arrived, pulls the after-value from the real data
 * source for its metric, and records TOO_EARLY / NO_MATERIAL_CHANGE / POSITIVE / NEGATIVE /
 * INCONCLUSIVE. On POSITIVE it matures the matching Level-1 Proof Ledger row in place (same
 * dedupeKey) to Level-2, preserving history — it never creates a second proof row for the same
 * real-world action.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb, pagePerformance } from "@/lib/db";
import { dueForMeasurementEvaluation, recordMeasuredResult } from "./queue";
import { evaluateChange } from "./measurement";
import { matureProof } from "@/lib/proof/ledger";
import type { MeasurementPlan } from "./types";

async function currentPagePerformance(businessId: string, pageUrl: string): Promise<{ clicks: number; impressions: number; periodStart: string } | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db
    .select({ clicks: pagePerformance.clicks, impressions: pagePerformance.impressions, periodStart: pagePerformance.periodStart })
    .from(pagePerformance)
    .where(and(eq(pagePerformance.businessId, businessId), eq(pagePerformance.pageUrl, pageUrl)))
    .orderBy(desc(pagePerformance.periodStart));
  if (rows.length === 0) return null;
  // Sum across queries for the most recent period.
  const latestPeriod = rows[0]!.periodStart;
  const latest = rows.filter((r) => r.periodStart === latestPeriod);
  return { clicks: latest.reduce((s, r) => s + r.clicks, 0), impressions: latest.reduce((s, r) => s + r.impressions, 0), periodStart: latestPeriod };
}

export async function evaluateMeasurementPlans(limit = 20): Promise<{ evaluated: number; positive: number; matured: number }> {
  const db = getDb();
  if (!db) return { evaluated: 0, positive: 0, matured: 0 };
  const due = await dueForMeasurementEvaluation(limit);
  let evaluated = 0;
  let positive = 0;
  let matured = 0;
  for (const opp of due) {
    try {
      const plan = opp.measurementPlan as MeasurementPlan | null;
      if (!plan) continue;
      const evidence = (opp.evidence ?? {}) as { url?: string; path?: string; prospect?: string; targetUrl?: string; sourceUrl?: string };

      if (plan.metric === "gsc_impressions_clicks" || plan.metric === "gsc_ctr") {
        const url = evidence.url ?? null;
        const perf = url ? await currentPagePerformance(opp.businessId, url) : null;
        if (!perf) {
          // GSC data isn't available (or the connection lapsed) — leave "acted", never claim a result on missing data.
          continue;
        }
        const afterValue = plan.metric === "gsc_ctr" ? (perf.impressions > 0 ? perf.clicks / perf.impressions : 0) : perf.clicks;
        const status = evaluateChange(plan.baselineValue, afterValue, 0.1, plan.metric === "gsc_ctr" ? 0.01 : 3);
        evaluated++;
        await recordMeasuredResult(opp.id, status, { metric: plan.metric, before: plan.baselineValue, after: afterValue, period: perf.periodStart });
        if (status === "positive") {
          positive++;
          const dedupeKey = opp.actionId ? `seo_basic:${opp.actionId}` : null;
          if (dedupeKey) {
            const m = await matureProof(dedupeKey, {
              summary: `following this change, ${plan.metric === "gsc_ctr" ? "click-through rate" : "clicks"} on the page improved (measured via Search Console)`,
              metricName: plan.metric === "gsc_ctr" ? "search_ctr" : "search_clicks",
              metricBefore: plan.baselineValue ?? 0,
              metricAfter: afterValue,
              afterEvidence: { url, period: perf.periodStart, impressions: perf.impressions, clicks: perf.clicks },
              methodVersion: "gsc_28d_vs_baseline_v1",
            });
            if (m.matured) matured++;
          }
        }
      } else if (plan.metric === "gbp_profile_activity" || plan.metric === "review_count_rating") {
        // No data source built yet for these — left unresolved rather than guessed. Documented as a real gap.
        continue;
      }
      // ai_mention_rate (AEO) and referring_domain_live (authority) resolve through their own
      // engine's existing recheck/verify loop, which calls recordMeasuredResult directly at the
      // moment it has real data — they are not polled generically here to avoid duplicating work.
    } catch (err) {
      console.error("[opportunity-evaluate] failed", { id: opp.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { evaluated, positive, matured };
}

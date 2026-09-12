/**
 * Autonomous A/B allocation for the initial cold-outreach email.
 *
 * State is persisted as the newest `jobs` row of type
 * "outreach_experiment_state" (same append-only-log pattern already used for
 * outreach-health alert markers and the cold_outreach_restart marker) — no
 * schema migration needed, survives restarts/deploys, and the row history
 * doubles as an audit trail of every allocation/promotion change.
 *
 * Evaluation runs inline at the top of each outreach batch (see
 * run-outreach-batch.ts) rather than on a separate cron — it's a handful of
 * cheap reads, gated so it only does real work once per "generation" (once
 * promoted or once classified as a stalled engagement problem, it stops
 * re-evaluating and just returns the stored terminal state).
 */

import { getDb, jobs, outreachSends, funnelEvents } from "@/lib/db";
import { and, desc, eq, isNotNull } from "drizzle-orm";

const EXPERIMENT_JOB_TYPE = "outreach_experiment_state";

export type ExperimentState = {
  variantBAllocation: number; // fraction (0..1) of NEW initial sends that get variant B
  promoted: boolean;
  promotedVariant?: "A" | "B";
  promotedAt?: string;
  promotedReason?: string;
  evaluatedNoWinner?: boolean;
  evaluatedNoWinnerAt?: string;
  evaluatedNoWinnerReason?: string;
};

const DEFAULT_STATE: ExperimentState = { variantBAllocation: 0.8, promoted: false };

export async function getExperimentState(): Promise<ExperimentState> {
  const db = getDb();
  if (!db) return DEFAULT_STATE;
  const [row] = await db
    .select({ payload: jobs.payload })
    .from(jobs)
    .where(eq(jobs.type, EXPERIMENT_JOB_TYPE))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  if (!row) return DEFAULT_STATE;
  return { ...DEFAULT_STATE, ...((row.payload as Partial<ExperimentState>) ?? {}) };
}

async function persistExperimentState(state: ExperimentState): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.insert(jobs).values({ type: EXPERIMENT_JOB_TYPE, status: "done", payload: state });
}

export function pickVariant(state: ExperimentState): "A" | "B" {
  return Math.random() < state.variantBAllocation ? "B" : "A";
}

type VariantStats = { delivered: number; visits: number; rate: number };

async function computeVariantStats(): Promise<{ A: VariantStats; B: VariantStats }> {
  const empty = { A: { delivered: 0, visits: 0, rate: 0 }, B: { delivered: 0, visits: 0, rate: 0 } };
  const db = getDb();
  if (!db) return empty;

  const sentRows = await db
    .select({ payload: jobs.payload })
    .from(jobs)
    .where(eq(jobs.type, "cold_outreach_sent"));

  const variantByResendId = new Map<string, "A" | "B">();
  const variantByToken = new Map<string, "A" | "B">();
  for (const row of sentRows) {
    const p = (row.payload ?? {}) as Record<string, unknown>;
    const v = p.variant;
    if (v !== "A" && v !== "B") continue; // only sends made under this experiment carry a variant
    if (typeof p.resendEmailId === "string") variantByResendId.set(p.resendEmailId, v);
    if (typeof p.attributionToken === "string") variantByToken.set(p.attributionToken, v);
  }

  const deliveredRows = await db
    .select({ resendEmailId: outreachSends.resendEmailId })
    .from(outreachSends)
    .where(and(eq(outreachSends.campaign, "cold_outreach"), isNotNull(outreachSends.deliveredAt)));

  const delivered = { A: 0, B: 0 };
  for (const row of deliveredRows) {
    const v = row.resendEmailId ? variantByResendId.get(row.resendEmailId) : undefined;
    if (v) delivered[v]++;
  }

  const visitRows = await db
    .select({ metadata: funnelEvents.metadata })
    .from(funnelEvents)
    .where(eq(funnelEvents.eventType, "report_landed"));

  const visits = { A: 0, B: 0 };
  for (const row of visitRows) {
    const token = (row.metadata as Record<string, unknown> | null)?.attributionToken;
    const v = typeof token === "string" ? variantByToken.get(token) : undefined;
    if (v) visits[v]++;
  }

  return {
    A: { delivered: delivered.A, visits: visits.A, rate: delivered.A ? visits.A / delivered.A : 0 },
    B: { delivered: delivered.B, visits: visits.B, rate: delivered.B ? visits.B / delivered.B : 0 },
  };
}

// Evaluation thresholds — deliberately simple, not a statistics framework.
const B_EVAL_THRESHOLD = 30; // don't evaluate until B has this many delivered
const A_MIN_SAMPLE = 10; // don't trust the A side of the comparison below this
const MIN_WINNING_VISITS = 3; // a single accidental click can't win the test
const WINNING_RATE_MULTIPLE = 2; // B must beat A by at least 2x, not just edge ahead
// Prior full-system baseline was 1/138 = ~0.72% delivered->report-visit.
// "Materially improved" means clearing 2x that baseline.
const HISTORICAL_BASELINE_RATE = 1 / 138;
const ENGAGEMENT_FLOOR_MULTIPLE = 2;
const POST_PROMOTION_CONTROL_ALLOCATION = 0.1; // keep 10% on A after promoting B

/**
 * Runs once per outreach batch. No-ops immediately if the experiment already
 * reached a terminal state (promoted, or classified as an engagement
 * problem) — never re-litigates a decision once made.
 */
export async function evaluateExperiment(): Promise<ExperimentState> {
  const state = await getExperimentState();
  if (state.promoted || state.evaluatedNoWinner) return state;

  const stats = await computeVariantStats();
  if (stats.B.delivered < B_EVAL_THRESHOLD || stats.A.delivered < A_MIN_SAMPLE) {
    return state; // not enough data yet — keep the current split, try again next batch
  }

  const bWinsClearly =
    stats.B.visits >= MIN_WINNING_VISITS &&
    (stats.A.rate === 0 ? stats.B.visits >= MIN_WINNING_VISITS : stats.B.rate >= WINNING_RATE_MULTIPLE * stats.A.rate);

  if (bWinsClearly) {
    const newState: ExperimentState = {
      variantBAllocation: 1 - POST_PROMOTION_CONTROL_ALLOCATION,
      promoted: true,
      promotedVariant: "B",
      promotedAt: new Date().toISOString(),
      promotedReason: `B delivered->report-visit ${(stats.B.rate * 100).toFixed(2)}% (${stats.B.visits}/${stats.B.delivered}) vs A ${(stats.A.rate * 100).toFixed(2)}% (${stats.A.visits}/${stats.A.delivered}) — B kept as default with a ${(POST_PROMOTION_CONTROL_ALLOCATION * 100).toFixed(0)}% A control allocation.`,
    };
    await persistExperimentState(newState);
    return newState;
  }

  const neitherMateriallyImproved =
    stats.A.rate < HISTORICAL_BASELINE_RATE * ENGAGEMENT_FLOOR_MULTIPLE &&
    stats.B.rate < HISTORICAL_BASELINE_RATE * ENGAGEMENT_FLOOR_MULTIPLE;

  if (neitherMateriallyImproved) {
    const newState: ExperimentState = {
      ...state,
      evaluatedNoWinner: true,
      evaluatedNoWinnerAt: new Date().toISOString(),
      evaluatedNoWinnerReason: `Neither variant cleared 2x the ${(HISTORICAL_BASELINE_RATE * 100).toFixed(2)}% historical baseline (A ${(stats.A.rate * 100).toFixed(2)}% [${stats.A.visits}/${stats.A.delivered}], B ${(stats.B.rate * 100).toFixed(2)}% [${stats.B.visits}/${stats.B.delivered}]). OUTREACH ENGAGEMENT PROBLEM: TARGETING / CONTACT QUALITY — copy is not the bottleneck; investigate contact type, vertical, finding strength, and business quality instead of rewriting email copy again.`,
    };
    await persistExperimentState(newState);
    return newState;
  }

  // Ambiguous — neither a clear win nor a clear "nothing worked." Keep the
  // current split and re-evaluate on the next batch once more data exists.
  return state;
}

/** Read-only status for the admin view — does not run evaluation itself. */
export async function getExperimentStatus(): Promise<{ state: ExperimentState; stats: { A: VariantStats; B: VariantStats } }> {
  const [state, stats] = await Promise.all([getExperimentState(), computeVariantStats()]);
  return { state, stats };
}

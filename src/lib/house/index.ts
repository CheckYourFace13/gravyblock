/**
 * House-account autopilot. A house account (businesses.account_type = 'house') is an owner-run
 * site that gets the full GravyBlock loop but is never a customer, MRR or conversion.
 *
 * This module does not add a second registry or any site-specific logic. It schedules the
 * EXISTING generic engines per house account, so none can sit dormant:
 *
 *   light check (cheap, conditional requests, no model)  ~daily
 *   deep Business Truth refresh                          at least weekly
 *   CHANGE (new/changed/retired facts or pages) or stale discovery
 *     -> invalidate facts-based opportunities -> rediscover -> rerank
 *     -> orchestrator (handlers keep their own cooldowns / measurement windows, so a refresh
 *        alone never causes site churn)
 *
 * Every step writes a per-business `jobs` row, which is the evidence the admin panel and the
 * watchdog read. A failed step leaves the account due, retried after a short backoff.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { businesses, getDb, jobs, proofLedger, publishingTargets } from "@/lib/db";
import { refreshBusinessTruth } from "@/lib/truth";
import { createOpportunitiesFromTruth, invalidateStaleTruthOpportunities } from "@/lib/opportunities/truth-opportunities";
import { scanCrossEngineOpportunities } from "@/lib/opportunities/scan";
import { allOpenRanked } from "@/lib/opportunities/queue";
import { runOrchestrator } from "@/lib/opportunities/orchestrator";
import { getOperatingMode } from "@/lib/business-mode";
import { getCapabilityProfile } from "@/lib/capability-profile";
import { SITE_ADAPTERS } from "@/lib/site-publish/adapters";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const HOUSE_CADENCE = {
  lightEveryHours: 20,
  deepEveryDays: 6.5,
  discoveryEveryHours: 22,
  orchestratorEveryHours: 22,
  /** After a change, the orchestrator may run sooner, but never more often than this. */
  orchestratorMinGapHours: 6,
  retryBackoffHours: 2,
  /** Health thresholds. */
  redIfRefreshOlderThanDays: 3,
  redIfDeepOlderThanDays: 9,
  redIfLoopOlderThanDays: 3,
} as const;

export const HOUSE_JOB = {
  discovery: "house_discovery",
  orchestrator: "house_orchestrator",
  cycle: "house_cycle",
  watchdog: "house_watchdog",
} as const;

export type HouseAccount = { id: string; name: string; website: string | null; planTier: string; subscriptionStatus: string | null };

export async function listHouseAccounts(): Promise<HouseAccount[]> {
  const db = getDb();
  if (!db) return [];
  return db
    .select({ id: businesses.id, name: businesses.name, website: businesses.website, planTier: businesses.planTier, subscriptionStatus: businesses.subscriptionStatus })
    .from(businesses)
    .where(eq(businesses.accountType, "house"))
    .orderBy(businesses.name);
}

/**
 * A house account is full-featured by definition (setHouseAccount grants a paid tier). Older rows
 * were left on 'free', which silently excluded them from every paid-tier batch. Idempotent; never
 * touches billing fields, and house accounts are excluded from MRR and customer emails.
 */
export async function normalizeHouseEntitlements(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const rows = await db
    .update(businesses)
    .set({ planTier: "pro" })
    .where(and(eq(businesses.accountType, "house"), eq(businesses.planTier, "free")))
    .returning({ id: businesses.id });
  return rows.length;
}

type JobRow = { businessId: string | null; type: string; status: string; createdAt: Date; payload: unknown };

/** Latest rows per (business, job type) for the house accounts. */
async function loadJobs(ids: string[]): Promise<Map<string, JobRow[]>> {
  const db = getDb();
  const out = new Map<string, JobRow[]>();
  if (!db || ids.length === 0) return out;
  const types = ["truth_refresh", HOUSE_JOB.discovery, HOUSE_JOB.orchestrator, HOUSE_JOB.cycle, "site_connector_connected", "basic_seo_applied", "page_improved"];
  const rows = await db
    .select({ businessId: jobs.businessId, type: jobs.type, status: jobs.status, createdAt: jobs.createdAt, payload: jobs.payload })
    .from(jobs)
    .where(and(inArray(jobs.businessId, ids), inArray(jobs.type, types)))
    .orderBy(desc(jobs.createdAt))
    .limit(4000);
  for (const r of rows) {
    if (!r.businessId) continue;
    const list = out.get(r.businessId) ?? [];
    list.push(r);
    out.set(r.businessId, list);
  }
  return out;
}

const latest = (rows: JobRow[] | undefined, pred: (r: JobRow) => boolean) => rows?.find(pred) ?? null;
const modeOf = (r: JobRow) => (r.payload as { mode?: string } | null)?.mode;

export type HouseState = {
  lastLight: Date | null;
  lastDeep: Date | null;
  lastDiscovery: Date | null;
  lastOrchestrator: Date | null;
  lastFailedCycle: Date | null;
  lastRefreshNote: string | null;
};

export function stateFromJobs(rows: JobRow[] | undefined): HouseState {
  // Any truth refresh attempt counts as the latest check (a partial one is flagged through its note).
  const refresh = latest(rows, (r) => r.type === "truth_refresh");
  const deep = latest(rows, (r) => r.type === "truth_refresh" && modeOf(r) !== "light" && r.status === "completed");
  return {
    lastLight: refresh?.createdAt ?? null,
    lastDeep: deep?.createdAt ?? null,
    lastDiscovery: latest(rows, (r) => r.type === HOUSE_JOB.discovery && r.status === "completed")?.createdAt ?? null,
    lastOrchestrator: latest(rows, (r) => r.type === HOUSE_JOB.orchestrator && r.status === "completed")?.createdAt ?? null,
    lastFailedCycle: latest(rows, (r) => r.type === HOUSE_JOB.cycle && r.status === "partial")?.createdAt ?? null,
    lastRefreshNote: ((refresh?.payload as { note?: string } | null)?.note ?? null) as string | null,
  };
}

const age = (d: Date | null) => (d ? Date.now() - d.getTime() : Infinity);

export function dueSteps(s: HouseState) {
  const backoff = s.lastFailedCycle && age(s.lastFailedCycle) < HOUSE_CADENCE.retryBackoffHours * HOUR;
  return {
    backoff: Boolean(backoff),
    deep: age(s.lastDeep) > HOUSE_CADENCE.deepEveryDays * DAY,
    // A failed homepage read is re-checked within hours instead of waiting a day.
    light: age(s.lastLight) > (s.lastRefreshNote === "homepage_unreachable" ? 2 : HOUSE_CADENCE.lightEveryHours) * HOUR,
    discovery: age(s.lastDiscovery) > HOUSE_CADENCE.discoveryEveryHours * HOUR,
    orchestrator: age(s.lastOrchestrator) > HOUSE_CADENCE.orchestratorEveryHours * HOUR,
  };
}

async function record(businessId: string, type: string, status: "completed" | "partial", payload: Record<string, unknown>) {
  const db = getDb();
  if (!db) return;
  await db.insert(jobs).values({ businessId, type, status, payload });
}

export type CycleReport = {
  businessId: string;
  refreshed: "none" | "light" | "deep";
  changed: boolean;
  discovered: boolean;
  orchestrated: boolean;
  acted: number;
  errors: string[];
};

/**
 * One pass for one house account. Safe to call at any time (all steps are idempotent and the
 * engines enforce their own cooldowns). `force` ignores the due checks.
 */
export async function runHouseAccountCycle(businessId: string, opts: { force?: boolean } = {}): Promise<CycleReport> {
  const db = getDb();
  const report: CycleReport = { businessId, refreshed: "none", changed: false, discovered: false, orchestrated: false, acted: 0, errors: [] };
  if (!db) return { ...report, errors: ["no_db"] };
  const jobMap = await loadJobs([businessId]);
  const state = stateFromJobs(jobMap.get(businessId));
  const due = dueSteps(state);
  if (due.backoff && !opts.force) return report;

  // 1. Refresh Business Truth from first-party sources.
  let changed = false;
  if (opts.force || due.light || due.deep) {
    const mode = opts.force || due.deep ? "deep" : "light";
    try {
      const r = await refreshBusinessTruth(businessId, mode);
      report.refreshed = mode;
      // First-ever refresh counts as a change: everything it learned is new information.
      changed = r.added > 0 || r.superseded > 0 || r.expired > 0 || r.pagesChanged > 0 || state.lastLight === null;
      if (!r.ok) report.errors.push(`truth_refresh:${r.note}`);
    } catch (err) {
      report.errors.push(`truth_refresh:${err instanceof Error ? err.message : String(err)}`);
    }
  }
  report.changed = changed;

  // 2. New or changed information, or stale discovery, reruns opportunity discovery.
  let discovered = false;
  if (opts.force || changed || due.discovery) {
    try {
      const retired = changed ? await invalidateStaleTruthOpportunities() : { expired: 0 };
      const fromTruth = await createOpportunitiesFromTruth(businessId);
      const fromScan = await scanCrossEngineOpportunities(businessId);
      await record(businessId, HOUSE_JOB.discovery, "completed", { changed, expiredFromSupersededFacts: retired.expired, recorded: fromTruth.recorded + fromScan.recorded });
      discovered = true;
    } catch (err) {
      report.errors.push(`discovery:${err instanceof Error ? err.message : String(err)}`);
    }
  }
  report.discovered = discovered;

  // 3. Act on the best safe opportunities. The engines own cooldowns and measurement windows,
  //    so running here after a refresh never means "edit a page just because a week passed".
  const sinceOrch = age(state.lastOrchestrator);
  const orchDue = opts.force || due.orchestrator || (changed && sinceOrch > HOUSE_CADENCE.orchestratorMinGapHours * HOUR);
  if (orchDue) {
    try {
      const steps = await runOrchestrator(businessId, 5);
      const acted = steps.filter((s) => s.result.outcome === "acted").length;
      report.orchestrated = true;
      report.acted = acted;
      await record(businessId, HOUSE_JOB.orchestrator, "completed", {
        trigger: changed ? "business_truth_changed" : opts.force ? "forced" : "scheduled",
        acted,
        steps: steps.map((s) => ({ type: s.opportunityType, eligibility: s.eligibility, outcome: s.result.outcome, ...("reason" in s.result ? { reason: s.result.reason } : {}) })),
      });
    } catch (err) {
      report.errors.push(`orchestrator:${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await record(businessId, HOUSE_JOB.cycle, report.errors.length ? "partial" : "completed", { ...report });
  return report;
}

/** Worker entry: process the most overdue house accounts first, a few per tick. */
export async function runHouseFleetTick(maxPerTick = 3): Promise<{ accounts: number; ran: number; acted: number; errors: number }> {
  const db = getDb();
  if (!db) return { accounts: 0, ran: 0, acted: 0, errors: 0 };
  await normalizeHouseEntitlements();
  const accounts = await listHouseAccounts();
  const jobMap = await loadJobs(accounts.map((a) => a.id));
  const queue = accounts
    .map((a) => {
      const s = stateFromJobs(jobMap.get(a.id));
      const d = dueSteps(s);
      const anyDue = d.light || d.deep || d.discovery || d.orchestrator;
      const oldest = Math.min(s.lastLight?.getTime() ?? 0, s.lastOrchestrator?.getTime() ?? 0, s.lastDiscovery?.getTime() ?? 0);
      return { a, anyDue: anyDue && !d.backoff, oldest };
    })
    .filter((x) => x.anyDue && x.a.website)
    .sort((x, y) => x.oldest - y.oldest)
    .slice(0, maxPerTick);
  let acted = 0;
  let errors = 0;
  for (const q of queue) {
    try {
      const r = await runHouseAccountCycle(q.a.id);
      acted += r.acted;
      errors += r.errors.length;
    } catch (err) {
      errors++;
      console.error("[house] cycle failed", { businessId: q.a.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { accounts: accounts.length, ran: queue.length, acted, errors };
}

export type HouseHealth = "GREEN" | "YELLOW" | "RED";

export type HouseAccountStatus = {
  id: string;
  name: string;
  domain: string | null;
  mode: string;
  connector: string;
  state: HouseState;
  nextDeepDue: Date | null;
  topOpportunity: string | null;
  openOpportunities: number;
  measuring: number;
  verifiedActions: number;
  lastAction: { at: Date; summary: string } | null;
  blocked: string[];
  proof: { level1: number; level2: number; level3: number };
  health: HouseHealth;
  reasons: string[];
};

const domainOf = (w: string | null) => {
  if (!w) return null;
  try {
    return new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`).hostname.replace(/^www\./, "");
  } catch {
    return w;
  }
};

/** Everything the admin panel and the watchdog need, read-only. */
export async function getHouseFleetStatus(): Promise<HouseAccountStatus[]> {
  const db = getDb();
  if (!db) return [];
  const accounts = await listHouseAccounts();
  if (accounts.length === 0) return [];
  const ids = accounts.map((a) => a.id);
  const jobMap = await loadJobs(ids);

  const proofRows = (await db.execute(sql`select business_id, proof_level, count(*)::int as n from proof_ledger where business_id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) group by business_id, proof_level`)) as unknown as Array<{ business_id: string; proof_level: number; n: number }>;
  const oppRows = (await db.execute(sql`select business_id, status, count(*)::int as n from growth_opportunities where business_id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) group by business_id, status`)) as unknown as Array<{ business_id: string; status: string; n: number }>;
  const lastProof = await db
    .select({ businessId: proofLedger.businessId, verifiedAt: proofLedger.verifiedAt, summary: proofLedger.summary })
    .from(proofLedger)
    .where(inArray(proofLedger.businessId, ids))
    .orderBy(desc(proofLedger.verifiedAt))
    .limit(300);
  const targets = await db.select({ businessId: publishingTargets.businessId, adapter: publishingTargets.adapter }).from(publishingTargets).where(and(inArray(publishingTargets.businessId, ids), eq(publishingTargets.active, "true")));

  const out: HouseAccountStatus[] = [];
  for (const a of accounts) {
    const state = stateFromJobs(jobMap.get(a.id));
    const reasons: string[] = [];
    let health = "GREEN" as HouseHealth;
    const red = (r: string) => {
      health = "RED";
      reasons.push(r);
    };
    const yellow = (r: string) => {
      if (health === "GREEN") health = "YELLOW";
      reasons.push(r);
    };

    let mode = "unknown";
    const blocked: string[] = [];
    let topOpportunity: string | null = null;
    try {
      mode = (await getOperatingMode(a.id)).mode;
      const profile = await getCapabilityProfile(a.id);
      if (!profile.website.connected) blocked.push("website write connector");
      if (!profile.search.gscConnected) blocked.push("Search Console");
      if (!profile.gbp.connected) blocked.push("Google Business Profile");
      if (!profile.social.facebook) blocked.push("social");
      const ranked = await allOpenRanked(a.id, 5);
      const top = ranked.find((r) => r.eligibility === "AUTO_ELIGIBLE") ?? ranked[0];
      topOpportunity = top ? `${top.opportunityType}${top.subtype ? `: ${top.subtype}` : ""} (${top.eligibility})` : null;
    } catch (err) {
      yellow(`status read failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const opps = oppRows.filter((r) => r.business_id === a.id);
    const count = (s: string) => opps.filter((o) => o.status === s).reduce((n, o) => n + Number(o.n), 0);
    const proofs = proofRows.filter((r) => r.business_id === a.id);
    const lvl = (l: number) => proofs.filter((p) => Number(p.proof_level) === l).reduce((n, p) => n + Number(p.n), 0);
    const lp = lastProof.find((p) => p.businessId === a.id);
    // Only adapters that can actually write to the live site count as a connector (not "manual"/"internal" placeholders).
    const connectorKind = targets.find((t) => t.businessId === a.id && t.adapter in SITE_ADAPTERS)?.adapter ?? null;

    if (!a.website) red("no website on the account");
    if (age(state.lastLight) > HOUSE_CADENCE.redIfRefreshOlderThanDays * DAY) red("Business Truth refresh overdue");
    if (age(state.lastDeep) > HOUSE_CADENCE.redIfDeepOlderThanDays * DAY) red("deep refresh older than 9 days");
    if (age(state.lastDiscovery) > HOUSE_CADENCE.redIfLoopOlderThanDays * DAY) red("opportunity discovery overdue");
    if (age(state.lastOrchestrator) > HOUSE_CADENCE.redIfLoopOlderThanDays * DAY) red("orchestrator not running");
    if (state.lastRefreshNote === "homepage_unreachable") red("homepage unreachable on last refresh");
    if (health !== "RED") {
      if (state.lastFailedCycle && age(state.lastFailedCycle) < DAY) yellow("last cycle had a failing step (auto-retrying)");
      if (!connectorKind) yellow("no website write connector: content/page edits blocked, other work continues");
    }

    out.push({
      id: a.id,
      name: a.name,
      domain: domainOf(a.website),
      mode,
      connector: connectorKind ?? "none",
      state,
      nextDeepDue: state.lastDeep ? new Date(state.lastDeep.getTime() + HOUSE_CADENCE.deepEveryDays * DAY) : null,
      topOpportunity,
      openOpportunities: count("open"),
      measuring: count("acted"),
      verifiedActions: count("verified") + count("acted"),
      lastAction: lp ? { at: lp.verifiedAt, summary: lp.summary } : null,
      blocked,
      proof: { level1: lvl(1), level2: lvl(2), level3: lvl(3) },
      health,
      reasons,
    });
  }
  return out;
}

/**
 * Daily watchdog: recompute health, force-retry any RED account once (recoverable problems such
 * as a missed cycle heal here), and record the result. Only unrecoverable states stay RED.
 */
export async function runHouseWatchdog(): Promise<{ checked: number; retried: number; stillRed: Array<{ name: string; reasons: string[] }> }> {
  const db = getDb();
  if (!db) return { checked: 0, retried: 0, stillRed: [] };
  await normalizeHouseEntitlements();
  let status = await getHouseFleetStatus();
  const red = status.filter((s) => s.health === "RED" && s.domain);
  let retried = 0;
  for (const r of red) {
    try {
      await runHouseAccountCycle(r.id, { force: true });
      retried++;
    } catch (err) {
      console.error("[house-watchdog] retry failed", { businessId: r.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (retried) status = await getHouseFleetStatus();
  const stillRed = status.filter((s) => s.health === "RED").map((s) => ({ name: s.name, reasons: s.reasons }));
  await db.insert(jobs).values({ type: HOUSE_JOB.watchdog, status: "completed", payload: { checked: status.length, retried, green: status.filter((s) => s.health === "GREEN").length, yellow: status.filter((s) => s.health === "YELLOW").length, red: stillRed.length, stillRed } });
  return { checked: status.length, retried, stillRed };
}

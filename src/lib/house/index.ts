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
import { allOpenRanked, blockedByCapability } from "@/lib/opportunities/queue";
import { runOrchestrator } from "@/lib/opportunities/orchestrator";
import { getOperatingMode } from "@/lib/business-mode";
import { runCompetitorGapForBusiness } from "@/lib/competitors/gap-engine";
import { runAeoActionForBusiness } from "@/lib/ai-visibility/aeo-actions";
import { runBasicSeoForBusiness } from "@/lib/seo/basic-autopilot";
import { discoverAndQualify, discoverBrokenLinkOpportunities, discoverUnlinkedMentions } from "@/lib/authority/engine";
import { SITE_ADAPTERS, autoConnectManagedSites, capabilitiesFor, detectConnector, type SiteAdapterKind } from "@/lib/site-publish/adapters";
import { evaluateMeasurementPlans } from "@/lib/opportunities/evaluate";
import { runConnectorSelfTest } from "@/lib/site-publish/connector-selftest";

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
  requested: "house_cycle_requested",
  connectorCheck: "house_connector_check",
  selftestRequested: "house_selftest_requested",
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
 * Entitlement no longer depends on plan_tier (see lib/entitlement.ts). Rows I earlier set to 'pro' as a
 * scheduler workaround are put back exactly as they were (free + canceled), once, to prove it.
 */
export async function revertWorkaroundPlans(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const [done] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.type, "house_entitlement_revert_v1")).limit(1);
  if (done) return 0;
  const rows = await db
    .update(businesses)
    .set({ planTier: "free" })
    .where(and(eq(businesses.accountType, "house"), eq(businesses.planTier, "pro"), eq(businesses.subscriptionStatus, "canceled")))
    .returning({ id: businesses.id });
  await db.insert(jobs).values({ type: "house_entitlement_revert_v1", status: "completed", payload: { reverted: rows.length } });
  return rows.length;
}

/** Queue a forced cycle for one account (or all). The worker runs it within one tick; the admin UI never blocks on it. */
export async function requestHouseCycle(businessId?: string): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const accounts = businessId ? [{ id: businessId }] : await listHouseAccounts();
  let n = 0;
  for (const a of accounts) {
    const [open] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.businessId, a.id), eq(jobs.type, HOUSE_JOB.requested), eq(jobs.status, "pending"))).limit(1);
    if (open) continue;
    await db.insert(jobs).values({ businessId: a.id, type: HOUSE_JOB.requested, status: "pending", payload: { force: true, requestedAt: new Date().toISOString() } });
    n++;
  }
  return n;
}

type JobRow = { businessId: string | null; type: string; status: string; createdAt: Date; payload: unknown };

/** Latest rows per (business, job type) for the house accounts. */
async function loadJobs(ids: string[]): Promise<Map<string, JobRow[]>> {
  const db = getDb();
  const out = new Map<string, JobRow[]>();
  if (!db || ids.length === 0) return out;
  const types = ["truth_refresh", HOUSE_JOB.discovery, HOUSE_JOB.orchestrator, HOUSE_JOB.cycle, HOUSE_JOB.requested, HOUSE_JOB.connectorCheck, "site_connector_connected", "basic_seo_applied", "page_improved"];
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
  lastCycle: { at: Date; status: string; errors: string[]; acted: number } | null;
  cycleRequested: boolean;
  recentOrchestratorErrors: number;
  connectorCheck: { at: Date; ok: boolean } | null;
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
    lastCycle: (() => {
      const c = latest(rows, (r) => r.type === HOUSE_JOB.cycle);
      const p = (c?.payload ?? {}) as { errors?: string[]; acted?: number };
      return c ? { at: c.createdAt, status: c.status, errors: p.errors ?? [], acted: p.acted ?? 0 } : null;
    })(),
    cycleRequested: Boolean(latest(rows, (r) => r.type === HOUSE_JOB.requested && r.status === "pending")),
    // Steps that errored in each of the last two orchestrator runs = a stuck executor, not a quiet queue.
    recentOrchestratorErrors: (rows ?? [])
      .filter((r) => r.type === HOUSE_JOB.orchestrator)
      .slice(0, 2)
      .filter((r) => ((r.payload as { steps?: Array<{ outcome: string }> } | null)?.steps ?? []).some((x) => x.outcome === "error")).length,
    connectorCheck: (() => {
      const c = latest(rows, (r) => r.type === HOUSE_JOB.connectorCheck);
      return c ? { at: c.createdAt, ok: (c.payload as { ok?: boolean } | null)?.ok === true } : null;
    })(),
  };
}

const age = (d: Date | null) => (d ? Date.now() - d.getTime() : Infinity);

export function dueSteps(s: HouseState) {
  const backoff = s.lastFailedCycle && age(s.lastFailedCycle) < HOUSE_CADENCE.retryBackoffHours * HOUR;
  return {
    requested: s.cycleRequested,
    backoff: Boolean(backoff) && !s.cycleRequested,
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

/**
 * Per-account opportunity DISCOVERY for every engine (scan only, nothing is sent or edited here). The
 * generic daily batches only reach a handful of accounts each, so the house loop owns discovery for its
 * own accounts. Each engine keeps its own cadence; a changed Business Truth shortens it.
 */
const ENGINE_DISCOVERY: Array<{ name: string; everyDays: number; afterChangeDays: number; run: (id: string) => Promise<unknown> }> = [
  { name: "basic_seo", everyDays: 7, afterChangeDays: 0, run: (id) => runBasicSeoForBusiness(id, { scanOnly: true }) },
  { name: "authority", everyDays: 7, afterChangeDays: 1, run: (id) => discoverAndQualify(id) },
  { name: "authority_mentions", everyDays: 7, afterChangeDays: 3, run: async (id) => ({ mentions: await discoverUnlinkedMentions(id), brokenLinks: await discoverBrokenLinkOpportunities(id) }) },
  { name: "aeo", everyDays: 7, afterChangeDays: 3, run: (id) => runAeoActionForBusiness(id, { scanOnly: true }) },
  { name: "competitor_gap", everyDays: 30, afterChangeDays: 7, run: (id) => runCompetitorGapForBusiness(id, { scanOnly: true }) },
];

async function discoverEngineOpportunities(businessId: string, opts: { force: boolean; changed: boolean }): Promise<{ ran: string[]; errors: string[] }> {
  const db = getDb();
  const out = { ran: [] as string[], errors: [] as string[] };
  if (!db) return out;
  const rows = await db
    .select({ type: jobs.type, createdAt: jobs.createdAt })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), sql`${jobs.type} like 'house_engine:%'`))
    .orderBy(desc(jobs.createdAt))
    .limit(60);
  for (const e of ENGINE_DISCOVERY) {
    const last = rows.find((r) => r.type === `house_engine:${e.name}`)?.createdAt ?? null;
    const gapDays = last ? (Date.now() - last.getTime()) / DAY : Infinity;
    const needed = opts.force || gapDays >= (opts.changed ? e.afterChangeDays : e.everyDays);
    if (!needed) continue;
    try {
      const r = await e.run(businessId);
      await record(businessId, `house_engine:${e.name}`, "completed", { result: JSON.stringify(r).slice(0, 500) });
      out.ran.push(e.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await record(businessId, `house_engine:${e.name}`, "partial", { error: msg.slice(0, 300) });
      out.errors.push(`${e.name}:${msg.slice(0, 80)}`);
    }
  }
  return out;
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
  const force = Boolean(opts.force) || due.requested;
  if (due.backoff && !force) return report;
  const startedAt = Date.now();

  // 0. Attach a write connector as soon as the site announces one (cheap probe; no-op when already attached).
  try {
    await autoConnectManagedSites(1, businessId);
  } catch (err) {
    report.errors.push(`connector_probe:${err instanceof Error ? err.message : String(err)}`);
  }

  // 1. Refresh Business Truth from first-party sources.
  let changed = false;
  if (force || due.light || due.deep) {
    const mode = force || due.deep ? "deep" : "light";
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
  if (force || changed || due.discovery) {
    try {
      const retired = changed ? await invalidateStaleTruthOpportunities() : { expired: 0 };
      const fromTruth = await createOpportunitiesFromTruth(businessId);
      const fromScan = await scanCrossEngineOpportunities(businessId);
      const engines = await discoverEngineOpportunities(businessId, { force, changed });
      report.errors.push(...engines.errors.map((e) => `engine:${e}`));
      await record(businessId, HOUSE_JOB.discovery, "completed", { changed, expiredFromSupersededFacts: retired.expired, recorded: fromTruth.recorded + fromScan.recorded, engines: engines.ran, engineErrors: engines.errors });
      discovered = true;
    } catch (err) {
      report.errors.push(`discovery:${err instanceof Error ? err.message : String(err)}`);
    }
  }
  report.discovered = discovered;

  // 3. Act on the best safe opportunities. The engines own cooldowns and measurement windows,
  //    so running here after a refresh never means "edit a page just because a week passed".
  const sinceOrch = age(state.lastOrchestrator);
  const orchDue = force || due.orchestrator || (changed && sinceOrch > HOUSE_CADENCE.orchestratorMinGapHours * HOUR);
  if (orchDue) {
    try {
      // Forced/manual cycles (admin button, watchdog retry) never run authority outreach; only the scheduled cycle does, under its own caps.
      const steps = await runOrchestrator(businessId, 5, force ? { skipTypes: ["backlink"] } : {});
      const acted = steps.filter((s) => s.result.outcome === "acted").length;
      report.orchestrated = true;
      report.acted = acted;
      await record(businessId, HOUSE_JOB.orchestrator, "completed", {
        trigger: changed ? "business_truth_changed" : force ? "forced" : "scheduled",
        acted,
        steps: steps.map((s) => ({
          type: s.opportunityType,
          opportunityId: s.opportunityId,
          rankScore: Math.round(s.rankScore),
          eligibility: s.eligibility,
          why: s.selectedWhy,
          outcome: s.result.outcome,
          ...("reason" in s.result ? { reason: s.result.reason } : {}),
          ...("detail" in s.result && s.result.detail !== undefined ? { detail: JSON.stringify(s.result.detail).slice(0, 700) } : {}),
        })),
      });
    } catch (err) {
      report.errors.push(`orchestrator:${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await record(businessId, HOUSE_JOB.cycle, report.errors.length ? "partial" : "completed", { ...report, forced: force, durationMs: Date.now() - startedAt });
  if (due.requested) await db.update(jobs).set({ status: "completed" }).where(and(eq(jobs.businessId, businessId), eq(jobs.type, HOUSE_JOB.requested), eq(jobs.status, "pending")));
  return report;
}

const inFlight = new Set<string>();

/** Runs a cycle unless that account is already mid-cycle in this process (tick and request poller can overlap). */
async function runGuarded(businessId: string): Promise<CycleReport | null> {
  if (inFlight.has(businessId)) return null;
  inFlight.add(businessId);
  try {
    return await runHouseAccountCycle(businessId);
  } finally {
    inFlight.delete(businessId);
  }
}

/** Queue a connector self-test (inert marker write, live verify, rollback). Runs in the worker; never sends email or records proof. */
export async function requestConnectorSelfTest(businessId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [open] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.businessId, businessId), eq(jobs.type, HOUSE_JOB.selftestRequested), eq(jobs.status, "pending"))).limit(1);
  if (open) return false;
  await db.insert(jobs).values({ businessId, type: HOUSE_JOB.selftestRequested, status: "pending", payload: { requestedAt: new Date().toISOString() } });
  return true;
}

/** Queue an on-demand watchdog pass (same code as the daily 16:00 UTC run). Safe: retries only RED accounts, never sends outreach. */
export async function requestWatchdog(): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [open] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.type, "house_watchdog_requested"), eq(jobs.status, "pending"))).limit(1);
  if (open) return false;
  await db.insert(jobs).values({ type: "house_watchdog_requested", status: "pending", payload: { requestedAt: new Date().toISOString() } });
  return true;
}

let watchdogRunning = false;

/** Worker poller for requested watchdog passes. */
export async function runRequestedWatchdog(): Promise<number> {
  const db = getDb();
  if (!db || watchdogRunning) return 0;
  const [next] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.type, "house_watchdog_requested"), eq(jobs.status, "pending"))).orderBy(jobs.createdAt).limit(1);
  if (!next) return 0;
  watchdogRunning = true;
  try {
    await db.update(jobs).set({ status: "running" }).where(eq(jobs.id, next.id));
    await runHouseWatchdog();
    return 1;
  } catch (err) {
    console.error("[house] requested watchdog failed", { error: err instanceof Error ? err.message : String(err) });
    return 0;
  } finally {
    await db.update(jobs).set({ status: "completed" }).where(eq(jobs.id, next.id));
    watchdogRunning = false;
  }
}

let selfTestRunning = false;

/** Worker poller: runs queued self-tests one at a time (each can take up to ~25 minutes of polling). */
export async function runRequestedSelfTests(): Promise<number> {
  const db = getDb();
  if (!db || selfTestRunning) return 0;
  const [next] = await db.select({ id: jobs.id, businessId: jobs.businessId }).from(jobs).where(and(eq(jobs.type, HOUSE_JOB.selftestRequested), eq(jobs.status, "pending"))).orderBy(jobs.createdAt).limit(1);
  if (!next?.businessId) return 0;
  selfTestRunning = true;
  try {
    await db.update(jobs).set({ status: "running" }).where(eq(jobs.id, next.id));
    await runConnectorSelfTest(next.businessId);
    await db.update(jobs).set({ status: "completed" }).where(eq(jobs.id, next.id));
    return 1;
  } catch (err) {
    console.error("[house] self-test failed", { businessId: next.businessId, error: err instanceof Error ? err.message : String(err) });
    await db.update(jobs).set({ status: "completed" }).where(eq(jobs.id, next.id));
    return 0;
  } finally {
    selfTestRunning = false;
  }
}

/** Polled every minute by the worker so an admin "Run cycle now" starts within about a minute, not at the next 15-minute tick. */
export async function runRequestedHouseCycles(max = 2): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const pending = await db.select({ businessId: jobs.businessId }).from(jobs).where(and(eq(jobs.type, HOUSE_JOB.requested), eq(jobs.status, "pending"))).orderBy(jobs.createdAt).limit(max);
  let n = 0;
  for (const p of pending) {
    if (!p.businessId) continue;
    const r = await runGuarded(p.businessId).catch((err) => {
      console.error("[house] requested cycle failed", { businessId: p.businessId, error: err instanceof Error ? err.message : String(err) });
      return null;
    });
    if (r) n++;
  }
  return n;
}

/** Worker entry: process the most overdue house accounts first, a few per tick. */
export async function runHouseFleetTick(maxPerTick = 3): Promise<{ accounts: number; ran: number; acted: number; errors: number }> {
  const db = getDb();
  if (!db) return { accounts: 0, ran: 0, acted: 0, errors: 0 };
  await revertWorkaroundPlans();
  const accounts = await listHouseAccounts();
  const jobMap = await loadJobs(accounts.map((a) => a.id));
  const queue = accounts
    .map((a) => {
      const s = stateFromJobs(jobMap.get(a.id));
      const d = dueSteps(s);
      const anyDue = d.requested || d.light || d.deep || d.discovery || d.orchestrator;
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
      const r = await runGuarded(q.a.id);
      if (!r) continue;
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
  connectorCapabilities: string[];
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
  const targets = await db.select({ businessId: publishingTargets.businessId, adapter: publishingTargets.adapter, config: publishingTargets.config }).from(publishingTargets).where(and(inArray(publishingTargets.businessId, ids), eq(publishingTargets.active, "true")));

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
    let websiteWorkPending = 0;
    let eligibleNow = 0;
    let stuckEligible = 0;
    try {
      mode = (await getOperatingMode(a.id)).mode;
      const ranked = await allOpenRanked(a.id, 25);
      const blockedRows = await blockedByCapability(a.id, 25);
      // Only capabilities that relevant, auto-eligible work is actually waiting on count as blocked.
      for (const r of blockedRows) if (r.requiredCapability && !blocked.includes(r.requiredCapability)) blocked.push(r.requiredCapability);
      const eligible = ranked.filter((r) => r.eligibility === "AUTO_ELIGIBLE");
      eligibleNow = eligible.length;
      const top = eligible[0];
      topOpportunity = top ? `${top.opportunityType}${top.subtype ? `: ${top.subtype}` : ""} (rank ${Math.round(top.rankScore)})` : ranked[0] ? `none eligible now; best open is ${ranked[0].opportunityType} (${ranked[0].eligibility})` : null;
      // Only auto-eligible page work counts as "waiting" on a connector; rows no engine may auto-fix are not blocked by a missing connector.
      websiteWorkPending = ranked.filter((r) => r.status === "open" && r.requiredCapability === "website_write" && r.autoEligible === "true").length;
      eligibleNow = eligible.length;
      stuckEligible = eligible.filter((r) => Date.now() - r.createdAt.getTime() > 10 * DAY).length;
    } catch (err) {
      yellow(`status read failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const opps = oppRows.filter((r) => r.business_id === a.id);
    const count = (st: string) => opps.filter((o) => o.status === st).reduce((n, o) => n + Number(o.n), 0);
    const proofs = proofRows.filter((r) => r.business_id === a.id);
    const lvl = (l: number) => proofs.filter((p) => Number(p.proof_level) === l).reduce((n, p) => n + Number(p.n), 0);
    const lp = lastProof.find((p) => p.businessId === a.id);
    // Only adapters that can actually write to the live site count as a connector (not "manual"/"internal" placeholders).
    const connectorKind = targets.find((t) => t.businessId === a.id && t.adapter in SITE_ADAPTERS)?.adapter ?? null;

    // RED = the core loop is stale, broken or repeatedly failing.
    if (!a.website) red("no website on the account");
    if (age(state.lastLight) > HOUSE_CADENCE.redIfRefreshOlderThanDays * DAY) red("Business Truth refresh overdue");
    if (age(state.lastDeep) > HOUSE_CADENCE.redIfDeepOlderThanDays * DAY) red("deep refresh older than 9 days");
    if (age(state.lastDiscovery) > HOUSE_CADENCE.redIfLoopOlderThanDays * DAY) red("opportunity discovery overdue");
    if (age(state.lastOrchestrator) > HOUSE_CADENCE.redIfLoopOlderThanDays * DAY) red("orchestrator not running");
    if (state.lastRefreshNote === "homepage_unreachable") red("homepage unreachable on last refresh");
    if (state.recentOrchestratorErrors >= 2) red("executor errored in each of the last two runs");
    if (connectorKind && state.connectorCheck && !state.connectorCheck.ok) red("site connector failing its handshake");
    // GREEN additionally needs the deep refresh within 7 days; slightly overdue is YELLOW, not green.
    if (health !== "RED") {
      if (age(state.lastDeep) > 7 * DAY) yellow("deep refresh older than 7 days");
      if (state.lastFailedCycle && age(state.lastFailedCycle) < DAY) yellow("last cycle had a failing step (auto-retrying)");
      if (!connectorKind && websiteWorkPending > 0) yellow(`no website write connector: ${websiteWorkPending} page/content opportunities waiting, other work continues`);
      if (blocked.filter((b) => b !== "website_write").length) yellow(`relevant work waiting on: ${blocked.filter((b) => b !== "website_write").join(", ")}`);
    }
    // Eligible work that has sat open for 10+ days while the loop kept running is a stuck queue (the watchdog retries; still stuck = visible).
    if (health !== "RED" && stuckEligible > 0 && state.lastOrchestrator && age(state.lastOrchestrator) < 3 * DAY) yellow(`${stuckEligible} auto-eligible opportunities open for over 10 days without being worked`);
    void eligibleNow;

    out.push({
      id: a.id,
      name: a.name,
      domain: domainOf(a.website),
      mode,
      connector: connectorKind ?? "none",
      connectorCapabilities: connectorKind ? Object.entries(capabilitiesFor(connectorKind as SiteAdapterKind, targets.find((t) => t.businessId === a.id && t.adapter === connectorKind)?.config)).filter(([, v]) => v).map(([k]) => k) : [],
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
  await revertWorkaroundPlans();

  // Connector handshake for every site that has a write connector (detectConnector reads the signed marker).
  const accounts = await listHouseAccounts();
  const withTarget = await db.select({ businessId: publishingTargets.businessId }).from(publishingTargets).where(and(inArray(publishingTargets.businessId, accounts.map((a) => a.id)), eq(publishingTargets.adapter, "managed_feed"), eq(publishingTargets.active, "true")));
  for (const t of withTarget) {
    const acct = accounts.find((a) => a.id === t.businessId);
    if (!acct?.website) continue;
    const found = await detectConnector(acct.website).catch(() => null);
    await record(acct.id, HOUSE_JOB.connectorCheck, "completed", { ok: found?.businessId === acct.id });
  }

  // The measurement evaluator is global; if it has not run for 36h, run it now (idempotent).
  const [lastEval] = await db.select({ createdAt: jobs.createdAt }).from(jobs).where(eq(jobs.type, "opportunity_measurement_eval")).orderBy(desc(jobs.createdAt)).limit(1);
  let evaluatorRetried = false;
  if (!lastEval || age(lastEval.createdAt) > 36 * HOUR) {
    await evaluateMeasurementPlans(20).catch((e) => console.error("[house-watchdog] evaluator retry failed", e));
    evaluatorRetried = true;
  }

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
  await db.insert(jobs).values({ type: HOUSE_JOB.watchdog, status: "completed", payload: { checked: status.length, retried, evaluatorRetried, green: status.filter((s) => s.health === "GREEN").length, yellow: status.filter((s) => s.health === "YELLOW").length, red: stillRed.length, stillRed } });
  return { checked: status.length, retried, stillRed };
}

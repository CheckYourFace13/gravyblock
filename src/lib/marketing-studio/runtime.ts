/**
 * Studio runtime: settings, emergency disable, resource governor, usage accounting, queue and worker health.
 * Kept in one file because they are the worker's operating loop; none of it touches any non-ms_ table.
 */
import { promises as fs, existsSync } from "node:fs";
import os from "node:os";
import { and, eq, lt, sql } from "drizzle-orm";
import { audit } from "./audit";
import { DISABLE_FILE, LIMITS, SELF_DEPLOY_LOCK, studioEnabledByEnv } from "./config";
import { ms, requireStudioDb, type StudioDb } from "./db";
import { diskStatus, measureStudioUsage } from "./storage";

// ---- Settings ------------------------------------------------------------------------------------------------------

export async function getSetting<T>(key: string, fallback: T, db: StudioDb = requireStudioDb()): Promise<T> {
  const [row] = await db.select().from(ms.msSettings).where(eq(ms.msSettings.key, key)).limit(1);
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown, actor: string, db: StudioDb = requireStudioDb(), opts: { audited?: boolean } = {}): Promise<void> {
  await db
    .insert(ms.msSettings)
    .values({ key, value: value as never, updatedBy: actor, updatedAt: new Date() })
    .onConflictDoUpdate({ target: ms.msSettings.key, set: { value: value as never, updatedBy: actor, updatedAt: new Date() } });
  if (opts.audited !== false) await audit(db, { actor, action: "setting.set", entity: "setting", entityId: key, detail: { value } });
}

// ---- Emergency global disable --------------------------------------------------------------------------------------

export type DisableState = { disabled: boolean; reasons: string[] };

/**
 * Three layers, any one stops the studio: (1) the DISABLE file, (2) the ms_settings kill switch, (3) the master env flag
 * being off. FAILS CLOSED: if the settings row cannot be read, the studio counts as disabled for that decision.
 */
export async function disableState(db: StudioDb | null = null): Promise<DisableState> {
  const reasons: string[] = [];
  if (!studioEnabledByEnv()) reasons.push("MARKETING_STUDIO_ENABLED is not 1");
  if (existsSync(DISABLE_FILE)) reasons.push("DISABLE file present");
  try {
    const handle = db ?? requireStudioDb();
    const kill = await getSetting<boolean>("kill_switch", false, handle);
    if (kill === true) reasons.push("kill switch is on");
  } catch {
    reasons.push("settings unreadable (failing closed)");
  }
  return { disabled: reasons.length > 0, reasons };
}

export async function setKillSwitch(on: boolean, actor: string, db: StudioDb = requireStudioDb()): Promise<void> {
  await setSetting("kill_switch", on, actor, db);
}

// ---- Resource governor ---------------------------------------------------------------------------------------------

async function memAvailableBytes(): Promise<number> {
  try {
    const txt = await fs.readFile("/proc/meminfo", "utf8");
    const m = /MemAvailable:\s+(\d+)\s+kB/.exec(txt);
    if (m) return Number(m[1]) * 1024;
  } catch {
    /* not Linux */
  }
  return os.freemem();
}

export type GovernorInput = { heavy: boolean };
export type GovernorSnapshot = { availableRamBytes: number; load1: number; freeDiskBytes: number; deployRunning: boolean };

/** Pure decision, separated from measurement so it is testable. */
export function governorDecision(snap: GovernorSnapshot, input: GovernorInput): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (snap.freeDiskBytes < LIMITS.freeDiskFloorBytes) reasons.push("free disk below the safety floor");
  if (input.heavy) {
    if (snap.availableRamBytes < LIMITS.minAvailableRamBytes) reasons.push("available RAM below the safety floor");
    if (snap.load1 > LIMITS.maxLoad1) reasons.push("host load is high");
    if (snap.deployRunning) reasons.push("a GravyBlock deploy is running");
  }
  return { allowed: reasons.length === 0, reasons };
}

export async function governorSnapshot(): Promise<GovernorSnapshot> {
  const [mem, disk] = await Promise.all([memAvailableBytes(), diskStatus()]);
  return { availableRamBytes: mem, load1: os.loadavg()[0], freeDiskBytes: disk.freeBytes, deployRunning: existsSync(SELF_DEPLOY_LOCK) };
}

export async function evaluateGovernor(input: GovernorInput) {
  const snap = await governorSnapshot();
  return { ...governorDecision(snap, input), snapshot: snap };
}

// ---- Usage accounting ----------------------------------------------------------------------------------------------

export async function recordUsage(resource: string, amount: number, opts: { productId?: string | null; period?: string; cap?: number | null } = {}, db: StudioDb = requireStudioDb()) {
  const period = opts.period ?? new Date().toISOString().slice(0, 10);
  await db.insert(ms.msUsage).values({ productId: opts.productId ?? null, period, resource, amount: Math.round(amount), cap: opts.cap ?? null });
}

export async function usageSummary(db: StudioDb = requireStudioDb()) {
  const month = new Date().toISOString().slice(0, 7);
  const rows = await db
    // bigint: a month of byte-sized resources (for example render output) sums past the 32-bit integer range, which made this query, and with it the whole dashboard, fail
    .select({ resource: ms.msUsage.resource, total: sql<string>`coalesce(sum(${ms.msUsage.amount}),0)::bigint` })
    .from(ms.msUsage)
    .where(sql`${ms.msUsage.period} like ${month + "%"}`)
    .groupBy(ms.msUsage.resource);
  return Object.fromEntries(rows.map((r) => [r.resource, Number(r.total)])) as Record<string, number>;
}

// ---- Queue ---------------------------------------------------------------------------------------------------------

export type Job = typeof ms.msMediaJobs.$inferSelect;
export type JobKind = "noop_probe" | "storage_audit" | "cleanup_tmp" | "render_creatives" | "render_video" | "render_demo_video" | "benchmark_video" | "review_replacement" | "library_video";

/** 2, 10, 45 minutes with jitter, then dead. */
export function backoffMs(attempt: number): number {
  const base = [2, 10, 45][Math.min(Math.max(attempt, 1), 3) - 1] * 60_000;
  return Math.round(base * (0.85 + Math.random() * 0.3));
}

export async function enqueue(
  input: { kind: JobKind; weight?: "light" | "heavy"; priority?: number; productId?: string | null; dedupeKey?: string; input?: Record<string, unknown>; runAfter?: Date; maxAttempts?: number },
  db: StudioDb = requireStudioDb(),
): Promise<{ id: string | null }> {
  const [row] = await db
    .insert(ms.msMediaJobs)
    .values({
      kind: input.kind,
      weight: input.weight ?? "light",
      priority: input.priority ?? 5,
      productId: input.productId ?? null,
      dedupeKey: input.dedupeKey ?? null,
      input: input.input ?? {},
      runAfter: input.runAfter ?? new Date(),
      maxAttempts: input.maxAttempts ?? 3,
    })
    .onConflictDoNothing({ target: ms.msMediaJobs.dedupeKey })
    .returning({ id: ms.msMediaJobs.id });
  return { id: row?.id ?? null };
}

/** Atomically claims the next runnable job. FOR UPDATE SKIP LOCKED makes concurrent workers safe. */
export async function claimNext(workerId: string, opts: { allowHeavy: boolean }, db: StudioDb = requireStudioDb()): Promise<Job | null> {
  const leaseSql = sql`now() + (${LIMITS.jobLeaseMs} * interval '1 millisecond')`;
  const rows = (await db.execute(sql`
    update ms_media_jobs set status = 'running', locked_by = ${workerId}, locked_until = ${leaseSql}, heartbeat_at = now(), attempts = attempts + 1
    where id = (
      select id from ms_media_jobs
      where status = 'queued' and run_after <= now() and (weight = 'light' or ${opts.allowHeavy})
      order by priority asc, run_after asc
      limit 1
      for update skip locked
    )
    returning *`)) as unknown as Array<Record<string, unknown>>;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id as string,
    productId: (r.product_id as string | null) ?? null,
    kind: r.kind as string,
    weight: r.weight as string,
    priority: r.priority as number,
    status: r.status as string,
    attempts: r.attempts as number,
    maxAttempts: r.max_attempts as number,
    runAfter: new Date(r.run_after as string),
    lockedBy: (r.locked_by as string | null) ?? null,
    lockedUntil: r.locked_until ? new Date(r.locked_until as string) : null,
    heartbeatAt: r.heartbeat_at ? new Date(r.heartbeat_at as string) : null,
    dedupeKey: (r.dedupe_key as string | null) ?? null,
    input: (r.input as Record<string, unknown>) ?? {},
    output: (r.output as Record<string, unknown> | null) ?? null,
    error: (r.error as string | null) ?? null,
    wallMs: (r.wall_ms as number | null) ?? null,
    createdAt: new Date(r.created_at as string),
    finishedAt: r.finished_at ? new Date(r.finished_at as string) : null,
  };
}

export async function heartbeat(jobId: string, db: StudioDb = requireStudioDb()) {
  await db
    .update(ms.msMediaJobs)
    .set({ heartbeatAt: new Date(), lockedUntil: sql`now() + (${LIMITS.jobLeaseMs} * interval '1 millisecond')` })
    .where(and(eq(ms.msMediaJobs.id, jobId), eq(ms.msMediaJobs.status, "running")));
}

export async function completeJob(jobId: string, output: Record<string, unknown>, wallMs: number, db: StudioDb = requireStudioDb()) {
  await db.update(ms.msMediaJobs).set({ status: "done", output, wallMs, finishedAt: new Date(), lockedBy: null, lockedUntil: null }).where(eq(ms.msMediaJobs.id, jobId));
}

/** Failure: retry with backoff until maxAttempts, then dead-letter. Never an immediate retry loop. */
export async function failJob(job: Pick<Job, "id" | "attempts" | "maxAttempts">, error: string, wallMs: number, db: StudioDb = requireStudioDb()) {
  const dead = job.attempts >= job.maxAttempts;
  await db
    .update(ms.msMediaJobs)
    .set({
      status: dead ? "dead" : "queued",
      error: error.slice(0, 1000),
      wallMs,
      runAfter: dead ? new Date() : new Date(Date.now() + backoffMs(job.attempts)),
      finishedAt: dead ? new Date() : null,
      lockedBy: null,
      lockedUntil: null,
    })
    .where(eq(ms.msMediaJobs.id, job.id));
}

/** Requeues (or dead-letters) running jobs whose lease expired, for example after a worker crash. */
export async function reapExpired(db: StudioDb = requireStudioDb()): Promise<number> {
  const stale = await db.select().from(ms.msMediaJobs).where(and(eq(ms.msMediaJobs.status, "running"), lt(ms.msMediaJobs.lockedUntil, new Date())));
  for (const j of stale) await failJob(j, "lease expired (worker stopped or crashed)", 0, db);
  return stale.length;
}

export async function runningHeavyCount(db: StudioDb = requireStudioDb()): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(ms.msMediaJobs).where(and(eq(ms.msMediaJobs.status, "running"), eq(ms.msMediaJobs.weight, "heavy")));
  return r?.n ?? 0;
}

export async function queueStats(db: StudioDb = requireStudioDb()) {
  const rows = await db.select({ status: ms.msMediaJobs.status, n: sql<number>`count(*)::int` }).from(ms.msMediaJobs).groupBy(ms.msMediaJobs.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

// ---- Worker health -------------------------------------------------------------------------------------------------

export type WorkerHeartbeat = { at: string; pid: number; workerId: string; state: "running" | "idle" | "disabled" | "stopping"; reasons?: string[]; lastJobKind?: string | null };

export async function writeHeartbeat(hb: WorkerHeartbeat, db: StudioDb = requireStudioDb()) {
  await setSetting("worker_heartbeat", hb, "worker", db, { audited: false });
}

export async function readWorkerHealth(db: StudioDb = requireStudioDb()) {
  const hb = await getSetting<WorkerHeartbeat | null>("worker_heartbeat", null, db);
  const ageMs = hb ? Date.now() - new Date(hb.at).getTime() : null;
  const alive = hb !== null && ageMs !== null && ageMs < LIMITS.heartbeatStaleMs;
  const [disk, usage, queue] = await Promise.all([diskStatus(), measureStudioUsage(), queueStats(db)]);
  return { heartbeat: hb, alive, ageMs, disk, usage, queue };
}

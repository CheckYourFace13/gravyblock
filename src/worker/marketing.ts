/**
 * gravyblock-marketing-worker: the Marketing Studio's own process. It is isolated from the web app and from the
 * growth worker (src/worker/index.ts): its own queue (ms_media_jobs), its own logs and temp/media directories under
 * /var/lib/gravyblock-marketing, its own DB pool and least-privilege role, its own kill switch and health state.
 *
 * Phase 1 runs NO heavy work: only a probe, a storage audit and temp cleanup. It never imports site-publish code, never
 * writes any non-ms_ table (the gb_studio role cannot), and never calls an external API or model.
 */
import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { LIMITS, STUDIO_DIRS, studioEnabledByEnv } from "@/lib/marketing-studio/config";
import { closeStudioDb, getStudioDb } from "@/lib/marketing-studio/db";
import {
  claimNext,
  completeJob,
  disableState,
  enqueue,
  evaluateGovernor,
  failJob,
  heartbeat,
  reapExpired,
  recordUsage,
  runningHeavyCount,
  setSetting,
  writeHeartbeat,
  type Job,
} from "@/lib/marketing-studio/runtime";
import { cleanupTmp, ensureStorageDirs, measureStudioUsage } from "@/lib/marketing-studio/storage";

const WORKER_ID = `marketing-${process.pid}-${randomUUID().slice(0, 8)}`;
const JOB_TIMEOUT_MS = 60_000;
const MAX_JOBS_PER_LOOP = 3;
const LOG_FILE = path.join(STUDIO_DIRS.logs, "worker.log");
const LOG_MAX_BYTES = 5 * 1024 * 1024;

let stopping = false;
let lastJobKind: string | null = null;
let lastStandbyLog = 0;

async function log(msg: string, extra?: Record<string, unknown>) {
  const line = `${new Date().toISOString()} ${msg}${extra ? " " + JSON.stringify(extra) : ""}`;
  console.info(`[marketing-worker] ${line}`);
  try {
    await mkdir(STUDIO_DIRS.logs, { recursive: true });
    const st = await stat(LOG_FILE).catch(() => null);
    if (st && st.size > LOG_MAX_BYTES) await rename(LOG_FILE, `${LOG_FILE}.1`);
    await appendFile(LOG_FILE, line + "\n");
  } catch {
    /* logging must never stop the loop */
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function runJob(job: Job): Promise<Record<string, unknown>> {
  switch (job.kind) {
    case "noop_probe":
      return { ok: true, at: new Date().toISOString() };
    case "storage_audit": {
      const usage = await measureStudioUsage();
      await recordUsage("disk_bytes", usage.totalBytes);
      // Over the ceiling: stop accepting render jobs (a later phase reads this flag) rather than touching production headroom.
      const over = usage.totalBytes > LIMITS.totalDiskCeilingBytes;
      await setSetting("accepting_renders", !over, "worker", undefined, { audited: false });
      return { ...usage, ceilingBytes: LIMITS.totalDiskCeilingBytes, acceptingRenders: !over };
    }
    case "cleanup_tmp": {
      const r = await cleanupTmp();
      return { ...r };
    }
    default:
      throw new Error(`unknown job kind: ${job.kind}`);
  }
}

async function scheduleRecurring() {
  const now = new Date();
  await enqueue({ kind: "storage_audit", dedupeKey: `storage_audit:${now.toISOString().slice(0, 13)}`, priority: 8 });
  await enqueue({ kind: "cleanup_tmp", dedupeKey: `cleanup_tmp:${Math.floor(now.getTime() / (15 * 60_000))}`, priority: 9 });
}

async function loopOnce() {
  const db = getStudioDb();
  if (!db) return;
  const state = await disableState(db);
  if (state.disabled) {
    await writeHeartbeat({ at: new Date().toISOString(), pid: process.pid, workerId: WORKER_ID, state: "disabled", reasons: state.reasons, lastJobKind }, db).catch(() => {});
    return;
  }

  await reapExpired(db);
  await scheduleRecurring();

  let ran = 0;
  while (ran < MAX_JOBS_PER_LOOP && !stopping) {
    // A global disable arriving mid-loop stops further claims immediately.
    if ((await disableState(db)).disabled) break;
    const heavyRunning = await runningHeavyCount(db);
    const gov = await evaluateGovernor({ heavy: false });
    if (!gov.allowed && gov.reasons.some((r) => r.includes("disk"))) {
      await log("deferring: low disk", { reasons: gov.reasons });
      break;
    }
    const job = await claimNext(WORKER_ID, { allowHeavy: heavyRunning < LIMITS.maxHeavyConcurrent && (await evaluateGovernor({ heavy: true })).allowed }, db);
    if (!job) break;
    ran++;
    lastJobKind = job.kind;
    const started = Date.now();
    const beat = setInterval(() => void heartbeat(job.id, db).catch(() => {}), 15_000);
    try {
      const output = await withTimeout(runJob(job), JOB_TIMEOUT_MS, job.kind);
      await completeJob(job.id, output, Date.now() - started, db);
      await recordUsage("jobs_run", 1, { productId: job.productId }, db);
      await log("job done", { id: job.id, kind: job.kind, ms: Date.now() - started });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await failJob(job, msg, Date.now() - started, db);
      await log("job failed", { id: job.id, kind: job.kind, attempt: job.attempts, error: msg });
    } finally {
      clearInterval(beat);
    }
  }
  await writeHeartbeat({ at: new Date().toISOString(), pid: process.pid, workerId: WORKER_ID, state: ran > 0 ? "running" : "idle", lastJobKind }, db).catch(() => {});
}

async function main() {
  await log("starting", { workerId: WORKER_ID, enabled: studioEnabledByEnv() });
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => {
      stopping = true;
      void log(`received ${sig}, stopping after the current job`);
    });
  }
  const standby = !studioEnabledByEnv() || !getStudioDb();
  if (!standby) await ensureStorageDirs().catch((e) => log("storage init failed", { error: String(e) }));

  while (!stopping) {
    if (standby) {
      // Not enabled or not configured: touch nothing (no database, no disk), just wait.
      if (Date.now() - lastStandbyLog > 10 * 60_000) {
        lastStandbyLog = Date.now();
        await log("standby: Marketing Studio is not enabled or its database is not configured");
      }
    } else {
      try {
        await loopOnce();
      } catch (err) {
        await log("loop error", { error: err instanceof Error ? err.message : String(err) });
      }
    }
    // Interruptible sleep so a stop signal ends the process promptly instead of after the full loop interval.
    for (let waited = 0; waited < LIMITS.workerLoopMs && !stopping; waited += 500) await new Promise((r) => setTimeout(r, 500));
  }
  await closeStudioDb();
  await log("stopped");
  process.exit(0);
}

void main();

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
import { cancelActiveWork } from "@/lib/marketing-studio/active-work";
import { LIMITS, STUDIO_DIRS, studioEnabledByEnv } from "@/lib/marketing-studio/config";
import { renderConcept } from "@/lib/marketing-studio/creative/pipeline";
import { collectDueMetrics } from "@/lib/marketing-studio/measurement/collect";
import { runDuePublications } from "@/lib/marketing-studio/publishing/queue";
import { reconcileGameLaunchState } from "@/lib/marketing-studio/video/demo/launch-state";
import { INTERNAL_SCOPE } from "@/lib/marketing-studio/scope";
import { SIZE_KEYS, type SizeKey } from "@/lib/marketing-studio/creative/theme";
import { renderDemoVideoJob } from "@/lib/marketing-studio/video/demo/run";
import { runReviewReplacement } from "@/lib/marketing-studio/publishing/review-pipeline";
import { runLibraryVideo } from "@/lib/marketing-studio/library-production";
import { renderVideoJob, runBenchmarkJob } from "@/lib/marketing-studio/video/jobs";
import { portfolioTick } from "@/lib/marketing-studio/portfolio-loop";
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
/** Heavy jobs get a longer hard limit; at the limit the real child processes are killed, not just abandoned. */
const HEAVY_TIMEOUT_MS: Record<string, number> = { render_creatives: 10 * 60_000, render_video: 15 * 60_000, render_demo_video: 30 * 60_000, benchmark_video: 20 * 60_000, portfolio_tick: 40 * 60_000, review_replacement: 45 * 60_000, library_video: 45 * 60_000 };
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
    case "render_creatives": {
      const input = job.input as { conceptId?: string; sizes?: string[] };
      if (!input.conceptId) throw new Error("render_creatives needs a conceptId");
      const sizes = (input.sizes ?? SIZE_KEYS).filter((s): s is SizeKey => (SIZE_KEYS as readonly string[]).includes(s));
      return { ...(await renderConcept(input.conceptId, sizes)) };
    }
    case "render_video":
      return { ...(await renderVideoJob(job.input as { videoId?: string })) };
    case "render_demo_video":
      return { ...(await renderDemoVideoJob(job.input as { videoId?: string })) };
    case "review_replacement": {
      // The owner asked for changes: understand the note, render a corrected video, run QA, upload it UNLISTED and email the new review link. Never publishes.
      const input = job.input as { publicationId?: string };
      if (!input.publicationId) throw new Error("review_replacement needs a publicationId");
      return { ...(await runReviewReplacement(getStudioDb()!, { publicationId: input.publicationId, attempt: job.attempts, maxAttempts: job.maxAttempts }, (m) => void log(m))) };
    }
    case "library_video": {
      // One planned library video: duplicate gate, render, QA, upload UNLISTED, review email. Never publishes.
      const input = job.input as { specId?: string };
      if (!input.specId) throw new Error("library_video needs a specId");
      return { ...(await runLibraryVideo(getStudioDb()!, { specId: input.specId, attempt: job.attempts, maxAttempts: job.maxAttempts }, (m) => void log(m))) };
    }
    case "portfolio_tick": {
      // The permanent loop: queue the next distinct video for every active product, generate when nothing is ready, wait honestly when nothing passes.
      const rep = await portfolioTick(getStudioDb()!, (m) => void log(m));
      return { products: rep.length, report: rep };
    }
    case "benchmark_video":
      return { ...(await runBenchmarkJob(job.input as { targetSeconds?: number; label?: string })) };
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
  await enqueue({ kind: "portfolio_tick", weight: "heavy", priority: 6, dedupeKey: `portfolio_tick:${Math.floor(now.getTime() / (30 * 60_000))}` });
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
    // Kill-switch watchdog: while a job runs, an emergency disable ends the real child processes within seconds.
    const watchdog = setInterval(() => {
      void disableState(db).then((s) => {
        if (s.disabled) {
          const n = cancelActiveWork();
          if (n > 0) void log("emergency disable: killed active child processes", { reasons: s.reasons, killed: n });
        }
      }).catch(() => {});
    }, 3_000);
    try {
      const limit = HEAVY_TIMEOUT_MS[job.kind] ?? JOB_TIMEOUT_MS;
      const output = await withTimeout(runJob(job), limit, job.kind).catch((e) => {
        // A hard timeout ends the real child processes (Chromium, FFmpeg), not just the promise.
        cancelActiveWork();
        throw e;
      });
      await completeJob(job.id, output, Date.now() - started, db);
      await recordUsage("jobs_run", 1, { productId: job.productId }, db);
      await log("job done", { id: job.id, kind: job.kind, ms: Date.now() - started });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await failJob(job, msg, Date.now() - started, db);
      await log("job failed", { id: job.id, kind: job.kind, attempt: job.attempts, error: msg });
    } finally {
      clearInterval(beat);
      clearInterval(watchdog);
    }
  }
  // Launch transition: a game that gained a verified live store listing has its unpublished pre-launch videos flagged stale before anything is sent.
  const launch = await reconcileGameLaunchState(db).catch((e) => [{ slug: "error", phase: "pre_launch" as const, stale: [], cancelled: 0, replacement: null, skipped: [e instanceof Error ? e.message : String(e)] }]);
  if (launch.some((r) => r.stale.length > 0)) await log("launch state: stale pre-launch creative flagged", { launch });
  // Due direct publications. This does nothing at all unless live publishing has been switched on by an operator (default off).
  const due = await runDuePublications(INTERNAL_SCOPE, undefined, db).catch((e) => ({ skipped: `error: ${e instanceof Error ? e.message : String(e)}`, attempted: 0 }));
  if (due.attempted > 0) await log("publications processed", due);
  // Read-only measurement of already published posts; makes no platform call when nothing has been published.
  const metrics = await collectDueMetrics(INTERNAL_SCOPE, undefined, db).catch(() => ({ checked: 0, collected: 0 }));
  if (metrics.collected > 0) await log("metrics collected", metrics);
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

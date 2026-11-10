/**
 * "Request changes" becomes a durable replacement job in the Studio's own queue (ms_media_jobs), run by the existing isolated Marketing Studio worker:
 *   request submitted -> exact note stored -> job enqueued at once (one per publication, so a repeated submit cannot make a second one) -> the worker
 *   claims it when the resource governor allows a heavy job -> the note is interpreted (review-intent.ts) -> corrected video rendered -> full QA ->
 *   uploaded as a NEW unlisted YouTube video -> old version superseded (still unlisted) -> owner emailed the new review link.
 * The queue gives restart safety (an interrupted job's lease expires and it is claimed again), retries with backoff, and a dead letter. Every step here is
 * safe to repeat. A job that is genuinely blocked, or that has used up its retries, ends as NEEDS ATTENTION and the owner is told; nothing is ever published.
 */
import { createHash } from "node:crypto";
import { like } from "drizzle-orm";
import { ms, type StudioDb } from "../db";
import { enqueue, getSetting, setSetting } from "../runtime";
import { trackEvent, type ReviewState } from "./video-review";

export const JOB_PREFIX = "video_review_job_";
export const jobKey = (id: string) => `${JOB_PREFIX}${id}`;
export const REPLACEMENT_JOB_KIND = "review_replacement" as const;
export const MAX_ATTEMPTS = 3;

export type JobStatus = "queued" | "rendering" | "uploading" | "done" | "needs_attention";
export type ReplacementJob = {
  id: string; // the publication being replaced
  productId: string;
  productName: string;
  note: string;
  status: JobStatus;
  /** bumped when someone re-queues a finished or blocked job, so the queue accepts it as new work */
  generation: number;
  queuedAt: string;
  updatedAt: string;
  attempts: number;
  detail?: string;
  /** what was understood from the note and will change */
  understood?: string[];
  newPublicationId?: string;
  newVideoId?: string;
};

/** A fingerprint of everything the owner sees and hears in a demo (including accepted edits), so a replacement that changes nothing is recognised. */
export function specFingerprint(spec: { title: string; cta: unknown; narration: unknown; claims: unknown; onScreen: unknown; sceneMeta: unknown }, extra?: unknown): string {
  return createHash("sha256").update(JSON.stringify([spec.title, spec.cta, spec.narration, spec.claims, spec.onScreen, spec.sceneMeta, extra ?? null])).digest("hex").slice(0, 16);
}

async function put(db: StudioDb, job: ReplacementJob): Promise<ReplacementJob> {
  await setSetting(jobKey(job.id), job, "review-worker", db, { audited: false });
  return job;
}

/** Enqueues the worker job for this job record. Duplicate-safe: the queue holds one job per publication and generation. */
async function enqueueFor(db: StudioDb, job: ReplacementJob): Promise<string | null> {
  const r = await enqueue({ kind: REPLACEMENT_JOB_KIND, weight: "heavy", priority: 1, productId: job.productId, dedupeKey: `${REPLACEMENT_JOB_KIND}:${job.id}:${job.generation}`, input: { publicationId: job.id }, maxAttempts: MAX_ATTEMPTS }, db);
  return r.id;
}

/** Stores the job record and wakes the worker by enqueueing the job. A second call for the same request returns the same job and queues nothing new. */
export async function queueReplacement(db: StudioDb, actor: string, review: ReviewState): Promise<ReplacementJob> {
  const existing = await getSetting<ReplacementJob | null>(jobKey(review.publicationId), null, db);
  if (existing) {
    await enqueueFor(db, existing); // harmless if already queued; repairs a request whose enqueue was interrupted
    return existing;
  }
  const now = new Date().toISOString();
  const job = await put(db, { id: review.publicationId, productId: review.productId, productName: review.productName, note: review.changesNote ?? "", status: "queued", generation: 1, queuedAt: now, updatedAt: now, attempts: 0 });
  await enqueueFor(db, job);
  return job;
}

/** Puts a blocked or finished job back in the queue (for example after the script was edited by hand). */
export async function requeueReplacement(db: StudioDb, publicationId: string): Promise<ReplacementJob> {
  const job = await getSetting<ReplacementJob | null>(jobKey(publicationId), null, db);
  if (!job) throw new Error("No replacement job for that review");
  const next = await put(db, { ...job, status: "queued", generation: job.generation + 1, attempts: 0, detail: undefined, updatedAt: new Date().toISOString() });
  await enqueueFor(db, next);
  return next;
}

export async function listJobs(db: StudioDb): Promise<ReplacementJob[]> {
  const rows = await db.select().from(ms.msSettings).where(like(ms.msSettings.key, `${JOB_PREFIX}%`));
  return rows.map((r) => r.value as ReplacementJob).filter((j) => j && typeof j.id === "string").sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function patchJob(db: StudioDb, job: ReplacementJob, patch: Partial<ReplacementJob>): Promise<ReplacementJob> {
  return put(db, { ...job, ...patch, updatedAt: new Date().toISOString() });
}

export type ReplacementDeps = {
  /** The fingerprint of the script, with the owner's accepted edits applied, as it would render now. */
  currentSpecHash: (productSlug: string) => Promise<string> | string;
  slugFor: (productId: string) => Promise<string>;
  /** Renders a corrected video and runs QA. Reuses an unfinished render from an earlier attempt. Never uploads. */
  render: (productSlug: string) => Promise<{ ok: true; videoRowId: string } | { ok: false; reason: string }>;
  /** Uploads that video as a NEW unlisted YouTube video, verifies it, records the review (superseding the old one) and emails the owner. Resumes a half-finished upload. */
  upload: (input: { productSlug: string; videoRowId: string; old: ReviewState; specHash: string }) => Promise<{ publicationId: string; videoId: string; emailed: boolean }>;
};

export type RunOutcome = { job: ReplacementJob; retry: boolean };

/**
 * Runs the render, QA and upload for one job. `final` says no retries remain. A transient failure returns retry=true (the worker then lets the queue back off
 * and try again); a final one, or a blocked one, ends as NEEDS ATTENTION.
 */
export async function runReplacementJob(db: StudioDb, job: ReplacementJob, old: ReviewState, deps: ReplacementDeps, opts: { final: boolean }): Promise<RunOutcome> {
  if (job.status === "done" || job.status === "needs_attention") return { job, retry: false };
  const slug = await deps.slugFor(job.productId);
  const specHash = await deps.currentSpecHash(slug);
  if (old.specHash && old.specHash === specHash) {
    await trackEvent(db, "review-worker", job.id, "FAILED", "nothing changed in the video");
    return { job: await patchJob(db, job, { status: "needs_attention", detail: "The accepted change does not alter the video, so a replacement would be identical. Nothing was uploaded." }), retry: false };
  }
  let cur = await patchJob(db, job, { status: "rendering", attempts: job.attempts + 1, detail: undefined });
  await trackEvent(db, "review-worker", job.id, "REPLACEMENT_RENDERING", cur.note.slice(0, 200));
  const fail = async (message: string): Promise<RunOutcome> => {
    await trackEvent(db, "review-worker", job.id, "FAILED", message);
    return opts.final ? { job: await patchJob(db, cur, { status: "needs_attention", detail: message.slice(0, 400) }), retry: false } : { job: await patchJob(db, cur, { status: "queued", detail: `Attempt ${cur.attempts} failed, will retry: ${message.slice(0, 300)}` }), retry: true };
  };
  try {
    const r = await deps.render(slug);
    if (!r.ok) return await fail(r.reason);
    cur = await patchJob(db, cur, { status: "uploading" });
    const up = await deps.upload({ productSlug: slug, videoRowId: r.videoRowId, old, specHash });
    await trackEvent(db, "review-worker", job.id, "REPLACEMENT_READY", up.videoId);
    return { job: await patchJob(db, cur, { status: "done", newPublicationId: up.publicationId, newVideoId: up.videoId, detail: up.emailed ? "New review email sent." : "Uploaded, but the review email could not be sent." }), retry: false };
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e));
  }
}

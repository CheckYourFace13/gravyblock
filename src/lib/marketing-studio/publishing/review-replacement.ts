/**
 * "Request changes" turns into a replacement job. The owner's exact note is stored and the flawed version stays UNLISTED. A worker then renders a
 * corrected video, runs QA, uploads it as a NEW unlisted YouTube video, verifies it, supersedes the old one and emails the owner a new review link.
 *
 * A replacement is only rendered once the script actually changed (its fingerprint differs from the version being replaced). Rendering the same script
 * again would just produce the same flawed video, so a job whose script has not changed waits in "awaiting_edit" with the owner's note attached, and
 * continues by itself the moment the script is updated. Studio uses no AI, so turning a free-text note into a script edit is a development change,
 * never a silent guess.
 */
import { createHash } from "node:crypto";
import { like } from "drizzle-orm";
import { ms, type StudioDb } from "../db";
import { getSetting, setSetting } from "../runtime";
import { trackEvent, type ReviewState } from "./video-review";

export const JOB_PREFIX = "video_review_job_";
export const jobKey = (id: string) => `${JOB_PREFIX}${id}`;

export type JobStatus = "queued" | "awaiting_edit" | "rendering" | "uploading" | "done" | "failed";
export type ReplacementJob = {
  id: string; // the publication being replaced
  productId: string;
  productName: string;
  note: string;
  status: JobStatus;
  queuedAt: string;
  updatedAt: string;
  attempts: number;
  detail?: string;
  newPublicationId?: string;
  newVideoId?: string;
};

/** A fingerprint of everything the owner sees and hears in a demo. */
export function specFingerprint(spec: { title: string; cta: unknown; narration: unknown; claims: unknown; onScreen: unknown; sceneMeta: unknown }): string {
  return createHash("sha256").update(JSON.stringify([spec.title, spec.cta, spec.narration, spec.claims, spec.onScreen, spec.sceneMeta])).digest("hex").slice(0, 16);
}

export async function queueReplacement(db: StudioDb, actor: string, review: ReviewState): Promise<ReplacementJob> {
  const now = new Date().toISOString();
  const existing = await getSetting<ReplacementJob | null>(jobKey(review.publicationId), null, db);
  if (existing && existing.status !== "failed") return existing;
  const job: ReplacementJob = { id: review.publicationId, productId: review.productId, productName: review.productName, note: review.changesNote ?? "", status: "queued", queuedAt: now, updatedAt: now, attempts: 0 };
  await setSetting(jobKey(review.publicationId), job, actor, db, { audited: false });
  return job;
}

export async function listJobs(db: StudioDb): Promise<ReplacementJob[]> {
  const rows = await db.select().from(ms.msSettings).where(like(ms.msSettings.key, `${JOB_PREFIX}%`));
  return rows.map((r) => r.value as ReplacementJob).filter((j) => j && typeof j.id === "string").sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

async function save(db: StudioDb, job: ReplacementJob, patch: Partial<ReplacementJob>): Promise<ReplacementJob> {
  const next = { ...job, ...patch, updatedAt: new Date().toISOString() };
  await setSetting(jobKey(job.id), next, "review-worker", db, { audited: false });
  return next;
}

export type ReplacementDeps = {
  /** The fingerprint of the script as it stands now for this product. */
  currentSpecHash: (productSlug: string) => string;
  slugFor: (productId: string) => Promise<string>;
  /** Renders a corrected video and runs QA. Never uploads. */
  render: (productSlug: string) => Promise<{ ok: true; videoRowId: string } | { ok: false; reason: string }>;
  /** Uploads that video as a NEW unlisted YouTube video, verifies it, records the review (superseding the old one) and emails the owner. */
  upload: (input: { productSlug: string; videoRowId: string; old: ReviewState; specHash: string }) => Promise<{ publicationId: string; videoId: string; emailed: boolean }>;
};

/** Runs one queued job end to end. Returns the final job. Safe to call repeatedly: finished and waiting jobs are left alone. */
export async function runReplacementJob(db: StudioDb, job: ReplacementJob, old: ReviewState, deps: ReplacementDeps): Promise<ReplacementJob> {
  if (job.status === "done" || job.status === "failed") return job;
  const slug = await deps.slugFor(job.productId);
  const specHash = deps.currentSpecHash(slug);
  if (old.specHash && old.specHash === specHash) {
    // Same script as the version being replaced: wait for the edit rather than re-render the same flaw.
    if (job.status !== "awaiting_edit") await trackEvent(db, "review-worker", job.id, "REPLACEMENT_RENDERING", "waiting for the script to be updated for the owner's note");
    return save(db, job, { status: "awaiting_edit", detail: "The script is unchanged since the version being replaced. The replacement continues automatically once it is updated for the owner's note." });
  }
  let cur = await save(db, job, { status: "rendering", attempts: job.attempts + 1, detail: undefined });
  await trackEvent(db, "review-worker", job.id, "REPLACEMENT_RENDERING", cur.note.slice(0, 200));
  try {
    const r = await deps.render(slug);
    if (!r.ok) {
      await trackEvent(db, "review-worker", job.id, "FAILED", r.reason);
      return save(db, cur, { status: "failed", detail: r.reason });
    }
    cur = await save(db, cur, { status: "uploading" });
    const up = await deps.upload({ productSlug: slug, videoRowId: r.videoRowId, old, specHash });
    await trackEvent(db, "review-worker", job.id, "REPLACEMENT_READY", up.videoId);
    return save(db, cur, { status: "done", newPublicationId: up.publicationId, newVideoId: up.videoId, detail: up.emailed ? "New review email sent." : "Uploaded, but the review email could not be sent." });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await trackEvent(db, "review-worker", job.id, "FAILED", message);
    return save(db, cur, { status: "failed", detail: message.slice(0, 400) });
  }
}

/**
 * The body of the `review_replacement` job that the Marketing Studio worker runs. Order: understand the owner's note (or block it), apply only the
 * accepted edits, render, run full QA, upload a NEW unlisted video, supersede the old one, email the new review link. Safe to run again after a crash or
 * a failure: finished work is reused, never repeated. It never makes anything public and never touches a website.
 */
import { isPaused } from "./video-policy";
import { and, eq, gte, sql } from "drizzle-orm";
import { ms, type StudioDb } from "../db";
import { listProducts } from "../repository";
import { getSetting, setSetting, SoftRetry } from "../runtime";
import { INTERNAL_SCOPE } from "../scope";
import { createDemoVideo } from "../video/demo/queue";
import { effectiveSpecHash } from "../video/demo/overrides";
import { renderDemoVideoJob } from "../video/demo/run";
import { demoSpecFor } from "../video/demo/specs";
import { conceptKey, ensureSpec, type StoredConcept } from "../video/concepts/registry";
import { copyFor, prepareRevision, scrubDescription } from "../revisions/run";
import { escalate, NO_STRATEGY } from "../revisions/heal";
import { markRevision, revisionFor } from "../revisions/history";
import { captureSource, restoreSource } from "../revisions/source";
import { requestOwnerNotice } from "./review-notify";
import { capFreesAt } from "../library-production";
import { AllowanceWait, enqueueReplacementAfter, jobKey, patchJob, runReplacementJob, type ReplacementDeps, type ReplacementJob } from "./review-replacement";
import { prepareReview } from "./review-dispatch";
import { embedKey, getReview, trackEvent, type EmbedEntry } from "./video-review";

const STUCK_RENDER_MS = 5 * 60_000;

/** A technical problem of ours: recorded for operations, never emailed to the customer. */
async function raiseOpsAlert(db: StudioDb, job: ReplacementJob, productName: string, log: (m: string) => void): Promise<void> {
  const list = (await getSetting<Array<Record<string, unknown>>>("ops_alerts", [], db)) ?? [];
  list.push({ at: new Date().toISOString(), kind: "video_revision_internal_failure", publicationId: job.id, product: productName, detail: job.detail, failures: job.failures ?? [] });
  await setSetting("ops_alerts", list.slice(-100), "review-worker", db, { audited: false });
  await trackEvent(db, "review-worker", job.id, "INTERNAL_FAILURE", (job.detail ?? "").slice(0, 300)).catch(() => undefined);
  log(`OPS ALERT: video revision for ${productName} failed internally after ${job.attempts} attempts: ${job.detail}`);
}

async function internalFailure(db: StudioDb, job: ReplacementJob, detail: string, productName: string, log: (m: string) => void): Promise<ReplacementJob> {
  const next = await patchJob(db, job, { status: "internal_failure", detail: `Internal problem: ${detail}` });
  await raiseOpsAlert(db, next, productName, log);
  return next;
}

export type PipelineResult = { status: string; detail?: string; understood?: string[] };

export async function runReviewReplacement(db: StudioDb, input: { publicationId: string; attempt: number; maxAttempts: number }, log: (m: string) => void = () => {}): Promise<PipelineResult> {
  const job = await getSetting<ReplacementJob | null>(jobKey(input.publicationId), null, db);
  const review = await getReview(db, input.publicationId);
  if (!job || !review) return { status: "gone" };
  if (job.status === "done" || job.status === "needs_attention") return { status: job.status, detail: job.detail };

  const products = await listProducts(INTERNAL_SCOPE, db);
  const product = products.find((p) => p.id === job.productId);
  if (!product) return { status: "gone" };
  if (await isPaused(db, product.id)) return { status: "paused", detail: "new video generation is paused for this product; the replacement resumes when the owner resumes" };
  const slug = product.slug;
  const specId = review.specId ?? slug;

  // 1. rebuild from the SAVED SOURCE on every attempt: the video as it was accepted plus the owner's note, never what an earlier attempt left behind. A technical problem
  // (timing, alignment, capture replay, render) adjusts the plan and tries again; only a decision the customer must make is ever sent to them.
  let cur = job;
  const final = input.attempt >= input.maxAttempts;
  await ensureSpec(db, specId);
  const source = await captureSource(db, { specId, publicationId: cur.id, productId: product.id });
  if (source.origin === "unrecoverable") {
    cur = await internalFailure(db, cur, "the saved source for this video could not be rebuilt", product.name, log);
    return { status: cur.status, detail: cur.detail };
  }
  await restoreSource(db, product.id, source);
  const prep = await prepareRevision(db, { productId: product.id, slug, productName: product.name, origin: demoSpecFor(specId).site.origin, specId, supersedes: cur.id, note: cur.note, hints: review.changesHints, strategy: cur.strategy ?? NO_STRATEGY, fresh: true }, { replan: true });
  if (!prep.ok && (prep.kind === "retry" || prep.kind === "replan")) {
    if (!final) {
      cur = await patchJob(db, cur, { detail: `planning again: ${prep.reason.slice(0, 240)}`, ...(prep.kind === "replan" ? { strategy: escalate(cur.strategy ?? NO_STRATEGY, prep.reason) } : {}) });
      throw new SoftRetry(prep.reason);
    }
    if (prep.kind === "retry") {
      cur = await internalFailure(db, cur, prep.reason, product.name, log);
      return { status: cur.status, detail: cur.detail };
    }
    // several plans, none safe: that is a real question for the owner
    cur = await patchJob(db, cur, { status: "needs_attention", detail: `No safe way to make that change was found: ${prep.reason}`, options: (prep.kind === "replan" && prep.options?.length ? prep.options : ["Tell us the exact words or scene to change (for example: remove the second sentence)", "Approve this video as it is"]) });
    await requestOwnerNotice(cur.id).catch(() => undefined);
    return { status: "needs_attention", detail: cur.detail };
  }
  if (!prep.ok) {
    log(`change request needs the owner: ${prep.reason}`);
    await trackEvent(db, "review-worker", cur.id, "FAILED", `needs a decision: ${prep.reason}`);
    cur = await patchJob(db, cur, { status: "needs_attention", detail: prep.reason, options: prep.options });
    await requestOwnerNotice(cur.id).catch(() => undefined);
    return { status: "needs_attention", detail: cur.detail };
  }
  cur = await patchJob(db, cur, { understood: prep.understood });
  log(`understood: ${prep.understood.join("; ")}`);

  // 2. render, QA, upload unlisted, supersede, email
  const deps: ReplacementDeps = {
    currentSpecHash: () => effectiveSpecHash(db, product.id, specId),
    slugFor: async () => slug,
    render: async () => {
      const demos = await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.productId, product.id), sql`${ms.msVideos.storyboard}->>'kind' = 'demo'`, gte(ms.msVideos.createdAt, new Date(cur.queuedAt)))).orderBy(sql`${ms.msVideos.createdAt} desc`);
      // an earlier attempt of this job may already have produced the replacement
      const ready = demos.find((v) => (v.status === "ready_for_review" || v.status === "approved") && Boolean((v.qa as { passed?: boolean } | null)?.passed));
      if (ready) {
        const sent = await db.select({ id: ms.msPublications.id }).from(ms.msPublications).where(and(eq(ms.msPublications.videoId, ready.id), eq(ms.msPublications.status, "published"))).limit(1);
        if (!sent.length || (await getReview(db, sent[0].id)) === null) return { ok: true as const, videoRowId: ready.id };
      }
      let video = demos.find((v) => v.status === "queued");
      const stuck = demos.find((v) => v.status === "rendering" && Date.now() - v.createdAt.getTime() > STUCK_RENDER_MS);
      if (!video && stuck) {
        await db.update(ms.msVideos).set({ status: "queued", error: null }).where(eq(ms.msVideos.id, stuck.id));
        video = { ...stuck, status: "queued" };
      }
      if (!video) video = await createDemoVideo(INTERNAL_SCOPE, "review-worker", product.id, db, { queue: false, replaceStale: true, specId });
      log(`rendering replacement video ${video.id}`);
      const r = await renderDemoVideoJob({ videoId: video.id }, INTERNAL_SCOPE, db);
      if (r.status !== "ready_for_review") return { ok: false as const, reason: `QA did not pass: ${r.failed.join("; ") || r.status}` };
      return { ok: true as const, videoRowId: video.id };
    },
    upload: async ({ videoRowId, old: prev }) => {
      const embeds = await getSetting<EmbedEntry[]>(embedKey(prev.productId), [], db);
      const placement = embeds.find((e) => e.publicationId === prev.publicationId)?.recommendedPlacement;
      // the same copy as the version being replaced, with its tracked link turned back into the plain destination (a new publication gets its own tracking id)
      // a generated script is described from its revised script; a hand-written one keeps its copy with the removed wording scrubbed out
      const revised = (await getSetting<StoredConcept | null>(conceptKey(specId), null, db))?.concept;
      const kept = prev.description.split(prev.ctaUrl).join(prev.ctaUrl.split("?")[0]);
      const plan = (await revisionFor(db, specId, prev.publicationId))?.plan;
      const copy = revised ? copyFor(revised, prev.title) : { title: prev.title, description: plan ? scrubDescription(kept, plan) : kept };
      const out = await prepareReview(db, { slug, specId, videoRowId, title: copy.title, description: copy.description, intended: prev.intendedUse, placement, upload: true, log });
      if (!out.ok && /daily cap/i.test(out.blocked ?? "")) throw new AllowanceWait(await capFreesAt(db, product.id));
      if (!out.ok || !out.publicationId || !out.videoId) throw new Error(out.blocked ?? "the upload did not complete");
      return { publicationId: out.publicationId, videoId: out.videoId, emailed: Boolean(out.emailed) };
    },
  };
  const outcome = await runReplacementJob(db, cur, review, deps, { final });
  if (outcome.waitUntil) {
    await enqueueReplacementAfter(db, outcome.job, outcome.waitUntil);
    log(`waiting for the posting allowance until ${outcome.waitUntil.toISOString()}; the finished video is kept`);
    return { status: "waiting", detail: outcome.job.detail };
  }
  if (outcome.job.status === "internal_failure") {
    await raiseOpsAlert(db, outcome.job, product.name, log);
    return { status: "internal_failure", detail: outcome.job.detail };
  }
  if (outcome.job.status === "needs_attention") {
    await requestOwnerNotice(outcome.job.id).catch(() => undefined);
    return { status: "needs_attention", detail: outcome.job.detail };
  }
  if (outcome.retry) throw new SoftRetry(outcome.job.detail ?? "replacement failed; rebuilding");
  if (outcome.job.status === "done") await markRevision(db, specId, outcome.job.id, { status: "sent", resultVideoId: outcome.job.newVideoId, supersededBy: outcome.job.newPublicationId, detail: outcome.job.detail }).catch(() => undefined);
  return { status: outcome.job.status, detail: outcome.job.detail, understood: outcome.job.understood };
}

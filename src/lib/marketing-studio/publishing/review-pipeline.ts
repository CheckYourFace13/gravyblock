/**
 * The body of the `review_replacement` job that the Marketing Studio worker runs. Order: understand the owner's note (or block it), apply only the
 * accepted edits, render, run full QA, upload a NEW unlisted video, supersede the old one, email the new review link. Safe to run again after a crash or
 * a failure: finished work is reused, never repeated. It never makes anything public and never touches a website.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { ms, type StudioDb } from "../db";
import { listFacts, listProducts } from "../repository";
import { getSetting } from "../runtime";
import { INTERNAL_SCOPE } from "../scope";
import { createDemoVideo } from "../video/demo/queue";
import { applyOverridesToSpec, effectiveSpecHash, getOverrides, saveOverrides } from "../video/demo/overrides";
import { renderDemoVideoJob } from "../video/demo/run";
import { demoSpecFor } from "../video/demo/specs";
import { interpretChange, mergeOverrides } from "./review-intent";
import { requestOwnerNotice } from "./review-notify";
import { jobKey, patchJob, runReplacementJob, type ReplacementDeps, type ReplacementJob } from "./review-replacement";
import { prepareUnlistedReview } from "./review-upload";
import { embedKey, getReview, trackEvent, type EmbedEntry } from "./video-review";

const STUCK_RENDER_MS = 5 * 60_000;

export type PipelineResult = { status: string; detail?: string; understood?: string[] };

export async function runReviewReplacement(db: StudioDb, input: { publicationId: string; attempt: number; maxAttempts: number }, log: (m: string) => void = () => {}): Promise<PipelineResult> {
  const job = await getSetting<ReplacementJob | null>(jobKey(input.publicationId), null, db);
  const review = await getReview(db, input.publicationId);
  if (!job || !review) return { status: "gone" };
  if (job.status === "done" || job.status === "needs_attention") return { status: job.status, detail: job.detail };

  const products = await listProducts(INTERNAL_SCOPE, db);
  const product = products.find((p) => p.id === job.productId);
  if (!product) return { status: "gone" };
  const slug = product.slug;
  const specId = review.specId ?? slug;

  // 1. understand the note, once. A request that cannot be applied safely is blocked here and the owner is told why.
  let cur = job;
  if (!cur.understood) {
    const spec = demoSpecFor(specId);
    const facts = (await listFacts(INTERNAL_SCOPE, product.id, db)).filter((f) => f.status === "current" && f.verifiedAt).map((f) => ({ key: f.factKey, value: f.factValue }));
    const productHost = product.publicUrl ? new URL(product.publicUrl).host.replace(/^www\./, "") : "";
    const current = await getOverrides(db, product.id);
    const eff = applyOverridesToSpec(spec, current);
    const it = interpretChange(cur.note, { narration: spec.narration, ctaText: eff.cta.text, ctaUrl: eff.cta.url, productHost, facts, current });
    if (!it.ok) {
      log(`change request blocked (${it.kind}): ${it.reason}`);
      await trackEvent(db, "review-worker", cur.id, "FAILED", `${it.kind}: ${it.reason}`);
      cur = await patchJob(db, cur, { status: "needs_attention", detail: `${it.kind}: ${it.reason}` });
      await requestOwnerNotice(cur.id).catch(() => undefined);
      return { status: "needs_attention", detail: cur.detail };
    }
    await saveOverrides(db, "review-worker", product.id, mergeOverrides(current, it.intents, cur.note));
    cur = await patchJob(db, cur, { understood: it.summary });
    log(`understood: ${it.summary.join("; ")}`);
  }

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
      const description = prev.description.split(prev.ctaUrl).join(prev.ctaUrl.split("?")[0]);
      const out = await prepareUnlistedReview(db, { slug, specId, videoRowId, title: prev.title, description, intended: prev.intendedUse, placement, upload: true, log });
      if (!out.ok || !out.publicationId || !out.videoId) throw new Error(out.blocked ?? "the upload did not complete");
      return { publicationId: out.publicationId, videoId: out.videoId, emailed: Boolean(out.emailed) };
    },
  };
  const outcome = await runReplacementJob(db, cur, review, deps, { final: input.attempt >= input.maxAttempts });
  if (outcome.job.status === "needs_attention") {
    await requestOwnerNotice(outcome.job.id).catch(() => undefined);
    return { status: "needs_attention", detail: outcome.job.detail };
  }
  if (outcome.retry) throw new Error(outcome.job.detail ?? "replacement failed; retrying");
  return { status: outcome.job.status, detail: outcome.job.detail, understood: outcome.job.understood };
}

/**
 * The body of the `library_video` job the Marketing Studio worker runs: one planned video of the product's library, end to end.
 *   duplicate gate -> render (the worker's governor and one-heavy-job rule already decided it may start) -> full QA -> upload UNLISTED -> verify ->
 *   review email ("Video N of 3: role") -> the angle moves to unlisted_review. It never publishes: the owner's approval does that, on the same video.
 * Safe to run again after a crash: an existing render is reused and a half-finished upload resumes.
 */
import { and, eq, gt, gte, inArray, sql } from "drizzle-orm";
import { ms, type StudioDb } from "./db";
import { checkDistinct, consumes, ROLE_LABEL } from "./library";
import { OWNED_TARGET } from "./portfolio-target";
import { getAngles, updateAngle } from "./library-store";
import { specFor } from "./publishing/platforms";
import { prepareReview } from "./publishing/review-dispatch";
import { isPaused } from "./publishing/video-policy";
import { enqueue } from "./runtime";
import { listProducts } from "./repository";
import { INTERNAL_SCOPE } from "./scope";
import { conceptKey, ensureSpec, type StoredConcept } from "./video/concepts/registry";
import { evaluateRecord } from "./video/concepts/validate";
import { openingKey } from "./video/concepts/standard";
import { getSetting, setSetting } from "./runtime";
import { listClaims } from "./repository";
import type { DemoRecord } from "./video/demo/types";
import { createDemoVideo } from "./video/demo/queue";
import { renderDemoVideoJob } from "./video/demo/run";
import { DEMO_SPECS, demoSpecFor } from "./video/demo/specs";

const ACTOR = "library-worker";

/** True when a render's QA carries the logo-integrity checks and they all passed. A render drawn before the logo gate has none and is never reused or uploaded. */
export const hasPassingLogoChecks = (qa: unknown): boolean => {
  const logo = ((qa as { checks?: Array<{ id: string; ok: boolean }> } | null)?.checks ?? []).filter((c) => c.id.startsWith("logo_"));
  return logo.length > 0 && logo.every((c) => c.ok);
};

/** Old renders of this script that were never uploaded and carry no passing logo checks are retired so a fresh render can be made. Anything with a publication or review is left alone. */
async function retireUnverifiedRenders(db: StudioDb, productId: string, specId: string, slug: string, log: (m: string) => void) {
  const rows = await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.productId, productId), sql`${ms.msVideos.storyboard}->>'kind' = 'demo'`, sql`coalesce(${ms.msVideos.storyboard}->>'specId', ${slug}) = ${specId}`, inArray(ms.msVideos.status, ["ready_for_review", "approved"])));
  for (const v of rows) {
    if (hasPassingLogoChecks(v.qa)) continue;
    // only a publication that went live (or was taken down) is history; a blocked or failed attempt is not
    const pub = await db.select({ id: ms.msPublications.id }).from(ms.msPublications).where(and(eq(ms.msPublications.videoId, v.id), inArray(ms.msPublications.status, ["published", "publishing", "revoked", "deleted"]))).limit(1);
    if (pub.length) continue;
    await db.update(ms.msVideos).set({ status: "superseded" }).where(and(eq(ms.msVideos.id, v.id), inArray(ms.msVideos.status, ["ready_for_review", "approved"])));
    log(`retired the old render ${v.id.slice(0, 8)} of ${specId}: it has no passing logo-integrity checks`);
  }
}

/** When the product's 24-hour posting allowance for YouTube has room again. */
export async function capFreesAt(db: StudioDb, productId: string): Promise<Date> {
  const cap = specFor("youtube")?.rateLimit.ourCap24h ?? 3;
  const since = new Date(Date.now() - 24 * 3_600_000);
  const rows = await db.select({ at: ms.msPublications.publishedAt }).from(ms.msPublications).where(and(eq(ms.msPublications.platform, "youtube"), eq(ms.msPublications.productId, productId), eq(ms.msPublications.status, "published"), gt(ms.msPublications.publishedAt, since))).orderBy(ms.msPublications.publishedAt);
  const times = rows.map((r) => r.at!.getTime());
  const idx = Math.max(0, times.length - cap);
  return new Date((times[idx] ?? Date.now()) + 24 * 3_600_000 + 2 * 60_000);
}

/** A finished generated video that failed the creative standard: the next concept that passed the gates takes its place. Returns false when none is left. */
async function promoteAlternate(db: StudioDb, specId: string): Promise<boolean> {
  const stored = await getSetting<StoredConcept | null>(conceptKey(specId), null, db);
  if (!stored?.concept) return false;
  const next = stored.alternates?.[0];
  if (!next) {
    await setSetting(conceptKey(specId), { ...stored, status: "blocked", note: "the finished video failed the creative standard and no other concept passed the gates" }, ACTOR, db, { audited: false });
    return false;
  }
  await setSetting(conceptKey(specId), { ...stored, concept: next, alternates: stored.alternates.slice(1), nextVariant: next.variant + 1 }, ACTOR, db, { audited: false });
  delete DEMO_SPECS[specId];
  return true;
}

export async function runLibraryVideo(db: StudioDb, input: { specId: string; attempt: number; maxAttempts: number }, log: (m: string) => void = () => {}): Promise<{ status: string; detail?: string }> {
  await ensureSpec(db, input.specId);
  const spec = demoSpecFor(input.specId);
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === spec.slug);
  if (!product) throw new Error(`${spec.slug} is not a Studio product`);
  const angles = await getAngles(db, product.slug);
  const entry = angles.find((e) => e.specId === input.specId);
  if (!entry) throw new Error(`No library angle is registered for ${input.specId}`);
  if (["unlisted_review", "approved", "public"].includes(entry.status)) return { status: entry.status, detail: "already made" };

  // 1. the duplicate gate: a video that repeats an angle already consumed is never made
  const gate = checkDistinct(entry, angles.filter((e) => e.id !== entry.id && e.status !== "planned" && consumes(e)));
  if (!gate.ok) {
    await updateAngle(db, ACTOR, product.slug, (e) => e.id === entry.id, { status: "blocked" });
    return { status: "blocked", detail: `repeats an existing angle: ${gate.conflicts.map((c) => `${c.title} (${c.reasons.join(", ")})`).join("; ")}` };
  }
  if (await isPaused(db, product.id)) return { status: "paused", detail: "new video generation is paused for this product" };
  if (!entry.yt) throw new Error(`The angle ${entry.id} has no YouTube title and description yet`);
  await updateAngle(db, ACTOR, product.slug, (e) => e.id === entry.id, { status: "in_production" });

  const fail = async (message: string) => {
    if (input.attempt >= input.maxAttempts) await updateAngle(db, ACTOR, product.slug, (e) => e.id === entry.id, { status: "blocked" });
    throw new Error(message);
  };
  try {
    // 2. the video: reuse an earlier attempt's render, else make one
    const rows = await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.productId, product.id), sql`${ms.msVideos.storyboard}->>'kind' = 'demo'`, sql`coalesce(${ms.msVideos.storyboard}->>'specId', ${product.slug}) = ${input.specId}`, gte(ms.msVideos.createdAt, new Date(Date.now() - 48 * 3_600_000)))).orderBy(sql`${ms.msVideos.createdAt} desc`);
    let video = rows.find((v) => (v.status === "ready_for_review" || v.status === "approved") && Boolean((v.qa as { passed?: boolean } | null)?.passed) && hasPassingLogoChecks(v.qa));
    if (!video) await retireUnverifiedRenders(db, product.id, input.specId, product.slug, log);
    if (!video) {
      let q = rows.find((v) => v.status === "queued");
      if (!q) {
        const stuck = rows.find((v) => v.status === "rendering" && Date.now() - v.createdAt.getTime() > 5 * 60_000);
        if (stuck) {
          await db.update(ms.msVideos).set({ status: "queued", error: null }).where(eq(ms.msVideos.id, stuck.id));
          q = { ...stuck, status: "queued" };
        }
      }
      if (!q) q = await createDemoVideo(INTERNAL_SCOPE, ACTOR, product.id, db, { queue: false, specId: input.specId });
      log(`rendering ${input.specId}: video ${q.id}`);
      const r = await renderDemoVideoJob({ videoId: q.id }, INTERNAL_SCOPE, db);
      if (r.status !== "ready_for_review") {
        if (spec.concept && r.failed.some((x) => x.startsWith("desirability_"))) {
          const swapped = await promoteAlternate(db, input.specId);
          log(swapped ? "the finished video failed the creative standard; the next concept is used" : "the finished video failed the creative standard and no other concept passed the gates");
        }
        return await fail(`QA did not pass: ${r.failed.join("; ") || r.status}`);
      }
      [video] = await db.select().from(ms.msVideos).where(eq(ms.msVideos.id, q.id));
    }
    // 2b. a script written by hand before the creative standard is judged and reported, never silently passed off or discarded
    if (!spec.concept) {
      const rec = video.storyboard as DemoRecord;
      const all = await db.select({ sb: ms.msVideos.storyboard, status: ms.msVideos.status }).from(ms.msVideos);
      const taken = [...new Set(all.filter((o) => o.status !== "superseded" && o.status !== "failed" && o.status !== "qa_failed" && (o.sb as DemoRecord | null)?.kind === "demo" && ((o.sb as DemoRecord).specId ?? "") !== input.specId && (o.sb as DemoRecord).transcript?.[0]).map((o) => openingKey((o.sb as DemoRecord).transcript[0].text)))];
      const acting = rec.scenes.find((s) => s.sourceVisual && s.sourceVisual.states.length > 1);
      const changes = rec.scenes.reduce((n, s) => n + Math.max(0, (s.sourceVisual?.states.length ?? 1) - 1), 0);
      const g = evaluateRecord({ specId: input.specId, slug: product.slug, productName: product.name, transcript: rec.transcript.map((t) => ({ text: t.text, caption: t.caption })), durationMs: rec.durationMs, firstActionMs: rec.desirability?.firstActionMs ?? (acting ? acting.startMs + 2500 : null), stateChanges: rec.desirability?.stateChanges ?? changes, interactivePlates: rec.desirability?.interactivePlates ?? rec.scenes.filter((s) => (s.sourceVisual?.states.length ?? 0) >= 3).length, verifiedClaims: rec.claims.filter((c) => c.factsVerified).length, ctaText: rec.cta.text, onScreen: rec.onScreen.map((o) => o.text), takenOpenings: taken, concept: null, prohibited: (await listClaims(INTERNAL_SCOPE, product.id, db)).filter((c) => c.kind === "prohibited").map((c) => c.text) });
      await setSetting(`video_creative_review_${input.specId.replace(/[^a-z0-9]+/gi, "_")}`, { at: new Date().toISOString(), legacy: true, ok: g.ok, reasons: g.reasons, checks: g.checks }, ACTOR, db, { audited: false });
      log(`creative standard: ${g.ok ? "passes all ten checks" : `fails: ${g.reasons.join("; ")}`}`);
      // Nothing that is not yet owner-approved is grandfathered: a hand-written script that fails the standard is held for a rebuild, not uploaded.
      if (!g.ok) {
        // blocked, not planned: a planned angle would be rendered again on every tick. The loop looks for a new angle instead.
        await updateAngle(db, ACTOR, product.slug, (e) => e.id === entry.id, { status: "blocked" });
        return { status: "held", detail: `held for a rebuild under the creative standard: ${g.reasons.join("; ")}` };
      }
    }
    // 3. upload unlisted, verify, email the owner with the library label
    const out = await prepareReview(db, {
      slug: product.slug,
      specId: input.specId,
      videoRowId: video.id,
      title: entry.yt.title,
      description: entry.yt.description,
      intended: `${ROLE_LABEL[entry.role]} video for ${entry.funnel.replace("_", " ")} viewers: YouTube organic, the iScream Studio portfolio, the product site, and a candidate paid asset.`,
      placement: entry.placement,
      library: { position: entry.position, of: Math.max(OWNED_TARGET, (await getAngles(db, product.slug)).filter((a) => a.status !== "superseded" && a.status !== "blocked").length), roleLabel: entry.purpose ?? ROLE_LABEL[entry.role] },
      upload: true,
      log,
    });
    if (!out.ok && /daily cap/i.test(out.blocked ?? "")) {
      // The product has used its posting allowance for the last 24 hours. This is not a failure: the finished video waits and the job is queued again for the moment the allowance frees.
      const again = await capFreesAt(db, product.id);
      await updateAngle(db, ACTOR, product.slug, (e) => e.id === entry.id, { status: "planned" });
      await enqueue({ kind: "library_video", weight: "heavy", priority: 3, productId: product.id, dedupeKey: `library_video:${input.specId}:after-${again.getTime()}`, input: { specId: input.specId }, runAfter: again, maxAttempts: 3 }, db);
      return { status: "deferred", detail: `posting allowance used; queued again for ${again.toISOString()}` };
    }
    if (!out.ok || !out.publicationId || !out.videoId) return await fail(out.blocked ?? "the upload did not complete");
    await updateAngle(db, ACTOR, product.slug, (e) => e.id === entry.id, { status: "unlisted_review", approval: "pending", videoRowId: video.id, youtubeId: out.videoId, publicationId: out.publicationId, publicationUrl: `https://www.youtube.com/watch?v=${out.videoId}` });
    return { status: "unlisted_review", detail: out.emailed ? "review email sent" : "uploaded; the review email could not be sent" };
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e));
  }
}

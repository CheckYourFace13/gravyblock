// Replacement worker for the owner video review loop. When the owner requests changes, a job is queued; this picks it up, renders a corrected
// video, runs QA, uploads it as a NEW unlisted YouTube video, verifies it, supersedes the old one and emails a new review link. It never makes
// anything public and it does not change the script: a job whose script has not been updated waits ("awaiting_edit") and continues by itself once it is.
// Run on a timer (scripts/ops/review-worker.sh, cron); safe to run often because it exits at once when nothing is runnable.
//   runuser -u gbstudio -- tsx --env-file=/etc/gravyblock-marketing.env scripts/ops/marketing-review-worker.ts [--list]
import { and, eq, sql } from "drizzle-orm";
import { closeStudioDb, ms, requireStudioDb } from "../../src/lib/marketing-studio/db";
import { prepareUnlistedReview } from "../../src/lib/marketing-studio/publishing/review-upload";
import { listJobs, runReplacementJob, specFingerprint, type ReplacementDeps } from "../../src/lib/marketing-studio/publishing/review-replacement";
import { embedKey, getReview, type EmbedEntry } from "../../src/lib/marketing-studio/publishing/video-review";
import { listProducts } from "../../src/lib/marketing-studio/repository";
import { disableState, evaluateGovernor, getSetting, runningHeavyCount } from "../../src/lib/marketing-studio/runtime";
import { INTERNAL_SCOPE } from "../../src/lib/marketing-studio/scope";
import { createDemoVideo } from "../../src/lib/marketing-studio/video/demo/queue";
import { renderDemoVideoJob } from "../../src/lib/marketing-studio/video/demo/run";
import { demoSpecFor } from "../../src/lib/marketing-studio/video/demo/specs";

const sleep = (n: number) => new Promise((r) => setTimeout(r, n));
const STUCK_MS = 2 * 3_600_000;

async function main() {
  const db = requireStudioDb();
  const jobs = await listJobs(db);
  if (process.argv.includes("--list")) {
    jobs.forEach((j) => console.log(`${j.id.slice(0, 8)} ${j.productName}: ${j.status}${j.detail ? ` (${j.detail})` : ""}`));
    return;
  }
  const now = Date.now();
  const runnable = jobs.filter((j) => j.status === "queued" || j.status === "awaiting_edit" || ((j.status === "rendering" || j.status === "uploading") && now - Date.parse(j.updatedAt) > STUCK_MS));
  const job = runnable[0];
  if (!job) return;
  const old = await getReview(db, job.id);
  if (!old) {
    console.log(`job ${job.id.slice(0, 8)}: its review is gone`);
    return;
  }
  const products = await listProducts(INTERNAL_SCOPE, db);

  const deps: ReplacementDeps = {
    currentSpecHash: (slug) => specFingerprint(demoSpecFor(slug)),
    slugFor: async (productId) => products.find((p) => p.id === productId)?.slug ?? "",
    render: async (slug) => {
      const product = products.find((p) => p.slug === slug)!;
      let [video] = await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.productId, product.id), eq(ms.msVideos.status, "queued"), sql`${ms.msVideos.storyboard}->>'kind' = 'demo'`)).limit(1);
      if (!video) video = await createDemoVideo(INTERNAL_SCOPE, "review-worker", product.id, db, { queue: false, replaceStale: true });
      const deadline = Date.now() + 45 * 60_000;
      for (;;) {
        const dis = await disableState(db);
        if (dis.disabled) return { ok: false, reason: `The Studio is disabled: ${dis.reasons.join("; ")}` };
        const gov = await evaluateGovernor({ heavy: true });
        if (gov.allowed && (await runningHeavyCount(db)) === 0) break;
        if (Date.now() > deadline) return { ok: false, reason: "Gave up waiting for the host to be quiet enough to render" };
        console.log(`waiting: ${gov.reasons.join("; ") || "another heavy job is running"}`);
        await sleep(20_000);
      }
      console.log(`rendering replacement video ${video.id}`);
      const r = await renderDemoVideoJob({ videoId: video.id }, INTERNAL_SCOPE, db);
      if (r.status !== "ready_for_review") return { ok: false, reason: `QA failed: ${r.failed.join("; ") || r.status}` };
      return { ok: true, videoRowId: video.id };
    },
    upload: async ({ productSlug, videoRowId, old: prev }) => {
      const embeds = await getSetting<EmbedEntry[]>(embedKey(prev.productId), [], db);
      const placement = embeds.find((e) => e.publicationId === prev.publicationId)?.recommendedPlacement;
      // the same copy as the version being replaced, with its tracked link turned back into the plain destination (a new publication gets its own tracking id)
      const description = prev.description.split(prev.ctaUrl).join(prev.ctaUrl.split("?")[0]);
      const out = await prepareUnlistedReview(db, { slug: productSlug, videoRowId, title: prev.title, description, intended: prev.intendedUse, placement, upload: true, log: (m) => console.log(m) });
      if (!out.ok || !out.publicationId || !out.videoId) throw new Error(out.blocked ?? "upload did not complete");
      return { publicationId: out.publicationId, videoId: out.videoId, emailed: Boolean(out.emailed) };
    },
  };
  const done = await runReplacementJob(db, job, old, deps);
  console.log(`job ${job.id.slice(0, 8)} (${job.productName}): ${done.status}${done.detail ? `: ${done.detail}` : ""}${done.newVideoId ? ` new video ${done.newVideoId}` : ""}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeStudioDb());

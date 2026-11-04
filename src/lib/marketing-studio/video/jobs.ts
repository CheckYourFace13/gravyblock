/**
 * Video Studio jobs (HEAVY, one at a time inside the Studio cgroup): render a storyboard to a checked MP4, and run the VPS
 * benchmark. Cards are rendered by the creative engine in Chromium, which is closed before FFmpeg starts so the two never hold
 * memory at the same time. Nothing here publishes; output goes to the private review queue.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { audit } from "../audit";
import { STUDIO_DIRS, VIDEO } from "../config";
import { loadProductContext, readAssetBytes, sourceFor, type ProductContext } from "../creative/context";
import { norm, runCreativeQa } from "../creative/qa";
import { launchBrowser, renderCreative } from "../creative/render";
import { buildCreative, type CreativeInput } from "../creative/templates";
import { SIZES } from "../creative/theme";
import { ms, requireStudioDb, type StudioDb } from "../db";
import { probeUrl } from "../remote-import";
import { INTERNAL_SCOPE, type OwnerScope } from "../scope";
import { safeJoin } from "../storage";
import { assemble, sceneStarts, type CaptionEvent } from "./assemble";
import { wrapCaption } from "./captions";
import { buildStoryboard } from "./queue";
import { runVideoQa } from "./qa";
import { startSampler, type SamplerResult } from "./sampler";
import { assertSlideshowAllowed } from "./freeze";
import { storeVideoFile } from "./store";
import { storyboardSeconds, validateStoryboard, type CardScene, type Storyboard } from "./types";

// ---- rendering --------------------------------------------------------------------------------------------------------------

export type VideoRenderResult = {
  outFile: string;
  seconds: number;
  qa: Awaited<ReturnType<typeof runVideoQa>>;
  sampler: SamplerResult;
  cardsRendered: number;
};

/** Renders a storyboard into dir/out.mp4 and runs the video QA. The caller owns the directory and its cleanup. */
export async function renderStoryboardToFile(ctx: ProductContext, sb: Storyboard, dir: string, audioFile: string | null = null): Promise<VideoRenderResult> {
  const errors = validateStoryboard(sb);
  if (errors.length) throw new Error(`Storyboard is not valid: ${errors.join("; ")}`);
  await fs.mkdir(dir, { recursive: true, mode: 0o770 });
  const sampler = startSampler(dir);
  try {
    const dims = SIZES.story;
    const cards = new Map<number, Buffer>();
    const cardResults: Array<{ index: number; passed: boolean; failed: string[]; isCta: boolean }> = [];
    const ctaScene = sb.scenes.at(-1) as CardScene;
    const urlStatus = ctaScene.cta ? await probeUrl(ctaScene.cta.url) : null;

    const handle = await launchBrowser();
    try {
      for (const [idx, s] of sb.scenes.entries()) {
        if (s.type !== "card") continue;
        const src = (t: string) => sourceFor(t, ctx.productName, ctx.facts);
        const input: CreativeInput = {
          family: s.family,
          size: "story",
          theme: ctx.theme,
          productName: ctx.productName,
          headline: { text: s.headline, src: src(s.headline) },
          subhead: s.subhead && s.family !== "feature_highlight" ? { text: s.subhead, src: src(s.subhead) } : null,
          body: s.subhead && s.family === "feature_highlight" ? { text: s.subhead, src: src(s.subhead) } : null,
          badge: s.badge ? { text: s.badge, src: src(s.badge) } : null,
          cta: s.cta ?? null,
          logo: ctx.logo,
        };
        const built = buildCreative(input);
        const { png, measure } = await renderCreative(handle.browser, built, "story");
        const qa = await runCreativeQa({
          png, width: dims.w, height: dims.h, measure, built, theme: ctx.theme, productName: ctx.productName, facts: ctx.qaFacts, prohibited: ctx.prohibited,
          ctaFactValues: ctx.ctaFactValues, ctaUrl: s.cta?.url ?? null, allowedUrlHosts: ctx.allowedUrlHosts, urlStatus: s.cta ? urlStatus : null,
          requiredAssets: ctx.logoAsset ? [{ id: ctx.logoAsset.id, approved: true, present: Boolean(ctx.logo) }] : [], conceptId: `video-${idx}`, otherHashes: [],
        });
        cards.set(idx, png);
        cardResults.push({ index: idx, passed: qa.passed, failed: qa.checks.filter((c) => !c.ok && c.severity === "fail").map((c) => `${c.id}: ${c.detail}`), isCta: idx === sb.scenes.length - 1 });
      }
    } finally {
      await handle.close();
    }

    // Real media for image scenes, approved only.
    const images = new Map<number, Buffer>();
    const media: Array<{ id: string; present: boolean; approved: boolean }> = [];
    for (const [idx, s] of sb.scenes.entries()) {
      if (s.type !== "image") continue;
      const asset = ctx.approvedAssets.find((a) => a.id === s.assetId);
      media.push({ id: s.assetId, present: Boolean(asset), approved: Boolean(asset) });
      if (asset) images.set(idx, await readAssetBytes(asset));
    }
    if (sb.audioAssetId) {
      const a = ctx.approvedAssets.find((x) => x.id === sb.audioAssetId);
      media.push({ id: sb.audioAssetId, present: Boolean(a), approved: Boolean(a) });
    }
    if (media.some((m) => !m.present)) throw new Error("A storyboard asset is missing or not approved");

    // Captions, each traced to a verified fact and checked against prohibited claims.
    const starts = sceneStarts(sb);
    const events: CaptionEvent[] = [];
    const captionChecks: Array<{ text: string; wrapped: boolean; traced: boolean; prohibited: boolean }> = [];
    for (const [idx, s] of sb.scenes.entries()) {
      if (s.type !== "image" || !s.caption) continue;
      const lines = wrapCaption(s.caption);
      const traceSrc = sourceFor(s.caption, ctx.productName, ctx.facts);
      captionChecks.push({ text: s.caption, wrapped: Boolean(lines), traced: traceSrc.kind !== "fact" || traceSrc.factId !== "unmatched", prohibited: ctx.prohibited.map(norm).some((p) => p.length >= 4 && norm(s.caption!).includes(p)) });
      if (lines) events.push({ start: starts[idx] + 0.4, end: Math.max(starts[idx] + 1.5, starts[idx] + s.seconds - VIDEO.transitionSeconds - 0.2), lines, sceneIndex: idx });
    }

    let audioPath: string | null = audioFile;
    if (sb.audioAssetId && !audioPath) {
      const a = ctx.approvedAssets.find((x) => x.id === sb.audioAssetId)!;
      audioPath = safeJoin(STUDIO_DIRS.media, ...a.storagePath.split("/"));
    }

    const outFile = path.join(dir, "out.mp4");
    const { seconds, clipFiles } = await assemble({ dir, storyboard: sb, cards, images, captions: events, audioFile: audioPath, outFile, timeoutMs: 8 * 60_000 });
    for (const c of clipFiles) await fs.rm(c, { force: true });
    const qa = await runVideoQa({ file: outFile, expectedSeconds: storyboardSeconds(sb), expectAudio: Boolean(audioPath), cardResults, captions: captionChecks, media });
    return { outFile, seconds, qa, sampler: await sampler.stop(), cardsRendered: cards.size };
  } catch (e) {
    await sampler.stop();
    throw e;
  }
}

/** Render job for a stored ms_videos row. */
export async function renderVideoJob(input: { videoId?: string }, scope: OwnerScope = INTERNAL_SCOPE, db: StudioDb = requireStudioDb()) {
  if (!input.videoId) throw new Error("render_video needs a videoId");
  await assertSlideshowAllowed(db);
  const [video] = await db.select().from(ms.msVideos).where(eq(ms.msVideos.id, input.videoId)).limit(1);
  if (!video) throw new Error("video not found");
  await db.update(ms.msVideos).set({ status: "rendering", error: null }).where(eq(ms.msVideos.id, video.id));
  const dir = path.join(STUDIO_DIRS.tmp, `video-${video.id}`);
  try {
    const ctx = await loadProductContext(scope, video.productId, db);
    const r = await renderStoryboardToFile(ctx, video.storyboard as Storyboard, dir);
    const stored = await storeVideoFile(scope, "studio-worker", video.productId, r.outFile, { width: VIDEO.width, height: VIDEO.height, name: `${video.title}.mp4` }, db);
    const status = r.qa.passed ? "ready_for_review" : "qa_failed";
    await db
      .update(ms.msVideos)
      .set({ assetId: stored.id, width: VIDEO.width, height: VIDEO.height, durationMs: Math.round((r.qa.probe?.durationSec ?? r.seconds) * 1000), bytes: stored.bytes, status, qa: { passed: r.qa.passed, checks: r.qa.checks }, renderMs: r.sampler.wallMs, peakRssBytes: r.sampler.peakAnonBytes ?? r.sampler.peakMemoryBytes })
      .where(eq(ms.msVideos.id, video.id));
    await audit(db, { actor: "studio-worker", action: "video.render", entity: "video", entityId: video.id, productId: video.productId, detail: { status, renderMs: r.sampler.wallMs } });
    return { videoId: video.id, status, renderMs: r.sampler.wallMs, peakMemoryBytes: r.sampler.peakMemoryBytes, failed: r.qa.checks.filter((c) => !c.ok && c.severity === "fail").map((c) => `${c.id}: ${c.detail}`) };
  } catch (e) {
    await db.update(ms.msVideos).set({ status: "failed", error: (e instanceof Error ? e.message : String(e)).slice(0, 500) }).where(eq(ms.msVideos.id, video.id));
    throw e;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// ---- benchmark --------------------------------------------------------------------------------------------------------------

/** Picks the product with the most real visual material and enough facts to fill the requested length. */
async function pickBenchmarkProduct(db: StudioDb, targetSeconds: number): Promise<{ ctx: ProductContext; sb: Storyboard }> {
  const products = await db.select().from(ms.msProducts).where(inArray(ms.msProducts.status, ["draft", "active"]));
  let best: { ctx: ProductContext; sb: Storyboard; score: number } | null = null;
  for (const p of products) {
    try {
      const ctx = await loadProductContext(INTERNAL_SCOPE, p.id, db);
      const sb = buildStoryboard(ctx, targetSeconds);
      const score = sb.scenes.length * 10 + ctx.screenshotAssets.length;
      if (!best || score > best.score) best = { ctx, sb, score };
    } catch {
      /* not enough material for this product */
    }
  }
  if (!best) throw new Error("No product has enough approved assets and verified facts to build a benchmark video");
  return best;
}

export async function runBenchmarkJob(input: { targetSeconds?: number; label?: string }, db: StudioDb = requireStudioDb()) {
  const targetSeconds = input.targetSeconds ?? 15;
  const label = input.label ?? `benchmark-${targetSeconds}s`;
  const dir = path.join(STUDIO_DIRS.tmp, `bench-${randomUUID().slice(0, 8)}`);
  try {
    const { ctx, sb } = await pickBenchmarkProduct(db, targetSeconds);
    const r = await renderStoryboardToFile(ctx, sb, dir);
    const stat = await fs.stat(r.outFile);
    const failed = r.qa.checks.filter((c) => !c.ok && c.severity === "fail").map((c) => `${c.id}: ${c.detail}`);
    await db.insert(ms.msBenchmarkRuns).values({
      label,
      targetSeconds,
      renderMs: r.sampler.wallMs,
      peakRssBytes: r.sampler.peakAnonBytes ?? r.sampler.peakMemoryBytes,
      peakCpuPercent: r.sampler.peakCpuPercent,
      tmpBytes: r.sampler.peakTmpBytes,
      outBytes: stat.size,
      measurements: { product: ctx.productName, scenes: sb.scenes.length, cards: r.cardsRendered, actualSeconds: r.seconds, avgCpuPercent: r.sampler.avgCpuPercent, peakCgroupMemoryBytesCumulativeIncludingCache: r.sampler.peakMemoryBytes, memoryLimitBytes: r.sampler.memoryLimitBytes, samples: r.sampler.samples, videoQaPassed: r.qa.passed, videoQaFailures: failed },
      verdict: r.qa.passed ? "safe" : "failed",
      notes: "Output deleted after measurement. Production latency is recorded separately by the external monitor.",
    });
    return { label, renderMs: r.sampler.wallMs, peakAnonBytes: r.sampler.peakAnonBytes, peakMemoryBytes: r.sampler.peakMemoryBytes, peakCpuPercent: r.sampler.peakCpuPercent, peakTmpBytes: r.sampler.peakTmpBytes, outBytes: stat.size, qaPassed: r.qa.passed, failed };
  } catch (e) {
    await db.insert(ms.msBenchmarkRuns).values({ label, targetSeconds, measurements: {}, verdict: "failed", notes: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
    throw e;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

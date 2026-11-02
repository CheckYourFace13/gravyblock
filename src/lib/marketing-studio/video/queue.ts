/**
 * Queue-side API for video: builds storyboards from Product Truth and submits render jobs. The web app imports only this file; FFmpeg and
 * Chromium code lives in jobs.ts and runs in the Studio worker.
 */
import { and, eq } from "drizzle-orm";
import { audit } from "../audit";
import { VIDEO } from "../config";
import { loadProductContext, type ProductContext } from "../creative/context";
import { firstSentence, shortDescription, splitTitleDetail } from "../creative/copy";
import { ms, requireStudioDb, type StudioDb } from "../db";
import { requireProduct } from "../repository";
import { enqueue } from "../runtime";
import type { OwnerScope } from "../scope";
import { wrapCaption } from "./captions";
import { MOTIONS, validateStoryboard, type CardScene, type Scene, type Storyboard } from "./types";

// ---- storyboard from Product Truth ---------------------------------------------------------------------------------------

/** Builds a storyboard only from verified facts and approved visual assets. Throws when there is not enough real material. */
export function buildStoryboard(ctx: ProductContext, targetSeconds: number): Storyboard {
  const facts = ctx.facts;
  const one = (k: string) => facts.find((f) => f.factKey === k);
  const tagline = one("tagline");
  const desc = one("description");
  const note = one("pricing_note");
  const cta = one("cta");
  const ctaUrl = one("cta_url") ?? one("website_url") ?? one("store_url");
  if (!cta || !ctaUrl) throw new Error("A video needs a verified call to action (cta) and a URL fact");
  const lead = tagline?.factValue ?? (desc ? firstSentence(desc.factValue) : null);
  if (!lead) throw new Error("A video needs a verified tagline or description");

  const items: Array<{ family: CardScene["family"]; headline: string; subhead: string | null; caption: string | null }> = [];
  for (const f of facts.filter((x) => x.factKey === "feature")) {
    const [title, detail] = splitTitleDetail(f.factValue);
    items.push({ family: "feature_highlight", headline: title, subhead: detail, caption: detail ?? title });
  }
  for (const f of facts.filter((x) => x.factKey === "how_it_plays")) items.push({ family: "product_benefit", headline: f.factValue, subhead: null, caption: f.factValue });

  const visuals: Array<{ assetId: string }> = ctx.screenshotAssets.length ? ctx.screenshotAssets.map((a) => ({ assetId: a.id })) : ctx.logoAsset ? [{ assetId: ctx.logoAsset.id }] : [];
  if (visuals.length === 0) throw new Error("A video needs at least one approved screenshot or logo/icon asset");

  let n = Math.min(Math.max(Math.round(targetSeconds / 5), 3), 16);
  const middle = (m: number) => m - 2;
  const cardsNeeded = (m: number) => Math.ceil(middle(m) / 2);
  while (n > 3 && cardsNeeded(n) > items.length) n--;
  const d = +((targetSeconds + (n - 1) * VIDEO.transitionSeconds) / n).toFixed(2);

  const scenes: Scene[] = [];
  scenes.push({ type: "card", seconds: d, family: "product_benefit", headline: lead, subhead: tagline && desc ? shortDescription(desc.factValue, 190) : null });
  let vi = 0;
  let ci = 0;
  for (let k = 0; k < middle(n); k++) {
    // With three scenes there is only room for one visual: title, image, call to action.
    const wantCard = middle(n) > 1 && k % 2 === 0;
    if (wantCard && items[ci]) {
      const it = items[ci++];
      scenes.push({ type: "card", seconds: d, family: it.family, headline: it.headline, subhead: it.subhead });
    } else {
      const prevCard = [...scenes].reverse().find((s): s is CardScene => s.type === "card");
      const caption = middle(n) > 1 && ci > 0 ? items[ci - 1]?.caption ?? null : null;
      scenes.push({ type: "image", seconds: d, assetId: visuals[vi % visuals.length].assetId, motion: MOTIONS[1 + (vi % (MOTIONS.length - 1))], caption: caption && wrapCaption(caption) ? caption : null });
      vi++;
      void prevCard;
    }
  }
  scenes.push({ type: "card", seconds: d, family: "cta", headline: note?.factValue ?? lead, cta: { text: cta.factValue, url: ctaUrl.factValue } });
  const sb: Storyboard = { version: 1, scenes, transition: "fade" };
  const errors = validateStoryboard(sb);
  if (errors.length) throw new Error(`Storyboard is not valid: ${errors.join("; ")}`);
  return sb;
}

/** Creates a video record from Product Truth and queues its render (one active render job per video). */
export async function createVideoFromProduct(scope: OwnerScope, actor: string, productId: string, targetSeconds: number, db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  if (![15, 30, 60].includes(targetSeconds)) throw new Error("Choose 15, 30 or 60 seconds");
  const ctx = await loadProductContext(scope, productId, db);
  const sb = buildStoryboard(ctx, targetSeconds);
  const title = `${ctx.productName} ${targetSeconds}s`;
  const [row] = await db.insert(ms.msVideos).values({ productId, title, storyboard: sb, targetSeconds, status: "queued" }).returning();
  const { id } = await enqueue({ kind: "render_video", weight: "heavy", priority: 4, productId, input: { videoId: row.id }, maxAttempts: 2 }, db);
  await audit(db, { actor, action: "video.create", entity: "video", entityId: row.id, productId, detail: { targetSeconds, jobId: id } });
  return row;
}

export async function reviewVideo(scope: OwnerScope, actor: string, productId: string, videoId: string, decision: "approved" | "rejected", db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  const [v] = await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.id, videoId), eq(ms.msVideos.productId, productId))).limit(1);
  if (!v) throw new Error("not found");
  if (decision === "approved" && v.status !== "ready_for_review") throw new Error("Only videos that passed QA can be approved");
  await db.update(ms.msVideos).set({ status: decision }).where(eq(ms.msVideos.id, videoId));
  await audit(db, { actor, action: `video.${decision}`, entity: "video", entityId: videoId, productId });
}

export async function enqueueBenchmark(targetSeconds: 15 | 30 | 60, db: StudioDb = requireStudioDb()) {
  return enqueue({ kind: "benchmark_video", weight: "heavy", priority: 3, input: { targetSeconds, label: `benchmark-${targetSeconds}s` }, maxAttempts: 1 }, db);
}

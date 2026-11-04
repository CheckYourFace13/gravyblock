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
import { assertSlideshowAllowed } from "./freeze";
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

  type Item = { family: CardScene["family"]; headline: string; subhead: string | null; caption: string | null };
  const inPageOrder = (key: string) => facts.filter((x) => x.factKey === key).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const flat = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const leadKey = flat(lead);
  // A feature that only restates the opening headline is not another scene.
  const featureItems: Item[] = inPageOrder("feature")
    .filter((f) => !flat(f.factValue).includes(leadKey))
    .map((f) => {
      const [title, detail] = splitTitleDetail(f.factValue);
      return { family: "feature_highlight" as const, headline: title, subhead: detail, caption: detail ?? title };
    });
  const playItems: Item[] = inPageOrder("how_it_plays").map((f) => ({ family: "product_benefit" as const, headline: f.factValue, subhead: null, caption: f.factValue }));
  // With only an icon to show, the verified how-it-plays steps carry the video; otherwise the features lead.
  const logoOnly = ctx.screenshotAssets.length === 0;
  const items: Item[] = logoOnly ? [...playItems, ...featureItems] : [...featureItems, ...playItems];

  const visuals: Array<{ assetId: string }> = ctx.screenshotAssets.length ? ctx.screenshotAssets.map((a) => ({ assetId: a.id })) : ctx.logoAsset ? [{ assetId: ctx.logoAsset.id }] : [];
  if (visuals.length === 0) throw new Error("A video needs at least one approved screenshot or logo/icon asset");

  let n = Math.min(Math.max(Math.round(targetSeconds / 5), 3), 16);
  const middle = (m: number) => m - 2;
  // Icon-only: one image scene, every other middle scene is a card.
  const cardsNeeded = (m: number) => (logoOnly ? Math.max(0, middle(m) - 1) : Math.ceil(middle(m) / 2));
  while (n > 3 && cardsNeeded(n) > items.length) n--;
  // Scene lengths are multiples of 0.5 s (keyframe-aligned cuts); the remainder is spread one half-second at a time over the first scenes.
  const halves = Math.round((targetSeconds + (n - 1) * VIDEO.transitionSeconds) * 2);
  const lengths = Array.from({ length: n }, (_, k) => (Math.floor(halves / n) + (k < halves % n ? 1 : 0)) / 2);
  let sceneNo = 0;
  const nextLen = () => lengths[sceneNo++];

  const scenes: Scene[] = [];
  scenes.push({ type: "card", seconds: nextLen(), family: "product_benefit", headline: lead, subhead: tagline && desc ? shortDescription(desc.factValue, 190) : null });
  let vi = 0;
  let ci = 0;
  for (let k = 0; k < middle(n); k++) {
    // With three scenes there is only room for one visual: title, image, call to action.
    const wantCard = logoOnly ? k !== (middle(n) >= 2 ? 1 : 0) : middle(n) > 1 && k % 2 === 0;
    if (wantCard && items[ci]) {
      const it = items[ci++];
      scenes.push({ type: "card", seconds: nextLen(), family: it.family, headline: it.headline, subhead: it.subhead });
    } else {
      const prevCard = [...scenes].reverse().find((s): s is CardScene => s.type === "card");
      // An icon scene carries no caption (the card before it already says it); a screenshot scene repeats the detail of the card before it.
      const caption = !logoOnly && middle(n) > 1 && ci > 0 ? items[ci - 1]?.caption ?? null : null;
      scenes.push({ type: "image", seconds: nextLen(), assetId: visuals[vi % visuals.length].assetId, motion: MOTIONS[1 + (vi % (MOTIONS.length - 1))], caption: caption && wrapCaption(caption) ? caption : null });
      vi++;
      void prevCard;
    }
  }
  const spare = items[ci];
  const endHeadline = note?.factValue ?? spare?.headline ?? `Meet ${ctx.productName}`;
  const endSub = note ? null : spare?.subhead ?? null;
  scenes.push({ type: "card", seconds: nextLen(), family: "cta", headline: endHeadline, subhead: endSub, cta: { text: cta.factValue, url: ctaUrl.factValue } });
  const sb: Storyboard = { version: 1, scenes, transition: "fade" };
  const errors = validateStoryboard(sb);
  if (errors.length) throw new Error(`Storyboard is not valid: ${errors.join("; ")}`);
  return sb;
}

/** Creates a video record from Product Truth and queues its render (one active render job per video). */
export async function createVideoFromProduct(scope: OwnerScope, actor: string, productId: string, targetSeconds: number, db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  await assertSlideshowAllowed(db);
  if (![15, 30, 60].includes(targetSeconds)) throw new Error("Choose 15, 30 or 60 seconds");
  const ctx = await loadProductContext(scope, productId, db);
  const sb = buildStoryboard(ctx, targetSeconds);
  const title = `${ctx.productName} ${targetSeconds}s`;
  const [row] = await db.insert(ms.msVideos).values({ productId, title, storyboard: sb, targetSeconds, status: "queued" }).returning();
  const { id } = await enqueue({ kind: "render_video", weight: "heavy", priority: 4, productId, input: { videoId: row.id }, maxAttempts: 2 }, db);
  await audit(db, { actor, action: "video.create", entity: "video", entityId: row.id, productId, detail: { targetSeconds, jobId: id } });
  return row;
}

export async function reviewVideo(scope: OwnerScope, actor: string, productId: string, videoId: string, decision: "approved" | "rejected" | "regenerate_later", db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  const [v] = await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.id, videoId), eq(ms.msVideos.productId, productId))).limit(1);
  if (!v) throw new Error("not found");
  const qaClean = Boolean((v.qa as { passed?: boolean } | null)?.passed);
  if (decision === "approved" && !(v.status === "ready_for_review" || (qaClean && ["rejected", "regenerate_later", "approved"].includes(v.status)))) throw new Error("Only videos that passed QA can be approved");
  await db.update(ms.msVideos).set({ status: decision }).where(eq(ms.msVideos.id, videoId));
  await audit(db, { actor, action: `video.${decision}`, entity: "video", entityId: videoId, productId });
}

export async function enqueueBenchmark(targetSeconds: 15 | 30 | 60, db: StudioDb = requireStudioDb()) {
  return enqueue({ kind: "benchmark_video", weight: "heavy", priority: 3, input: { targetSeconds, label: `benchmark-${targetSeconds}s` }, maxAttempts: 1 }, db);
}

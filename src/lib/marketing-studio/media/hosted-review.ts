/**
 * Review and approval for a customer who has no YouTube channel: GravyBlock hosts the video on private object storage (R2), the owner gets the same review email, and approving
 * switches the SAME stored video to public playback. Nothing is ever sent to the iScream Studio channel. The review record is keyed by the canonical id, so every existing
 * control (approve, request changes, pause) works unchanged.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { audit } from "../audit";
import { STUDIO_DIRS } from "../config";
import { readAssetBytes } from "../creative/context";
import { ms, type StudioDb } from "../db";
import { updateAngle } from "../library-store";
import { requestOwnerEmail } from "../publishing/review-notify";
import { embedKey, reviewKey, type EmbedEntry, type ReviewState } from "../publishing/video-review";
import { listProducts } from "../repository";
import { getSetting, setSetting } from "../runtime";
import { INTERNAL_SCOPE } from "../scope";
import type { DemoRecord } from "../video/demo/types";
import { addProvider, canonicalForVideo, embedSnippet, getCanonical, linkCanonicalToVideo, newCanonicalId, saveCanonical, signMediaAccess, type CanonicalVideo } from "./canonical";
import { assertTenantKey, storeFromEnv, type ObjectStore } from "./object-store";

const ACTOR = "hosted-review";
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com").replace(/\/$/, "");

async function thumbnail(video: Buffer): Promise<Buffer | null> {
  const dir = await fs.mkdtemp(path.join(STUDIO_DIRS.tmp, "thumb-"));
  try {
    const src = path.join(dir, "in.mp4");
    const out = path.join(dir, "t.jpg");
    await fs.writeFile(src, video);
    const ok = await new Promise<boolean>((resolve) => {
      const p = spawn("ffmpeg", ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-ss", "1.2", "-i", src, "-frames:v", "1", "-vf", "scale=720:-2", out]);
      p.on("close", (c) => resolve(c === 0));
      p.on("error", () => resolve(false));
    });
    return ok ? await fs.readFile(out) : null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export type HostedOptions = { slug: string; videoRowId?: string; title: string; description: string; intended: string; specId?: string; placement?: string; library?: { position: number; of: number; roleLabel: string }; upload: boolean; log?: (m: string) => void };
export type HostedOutcome = { ok: boolean; blocked?: string; canonicalId?: string; emailed?: boolean };

export async function prepareHostedReview(db: StudioDb, o: HostedOptions, deps: { store?: ObjectStore } = {}): Promise<HostedOutcome> {
  const log = o.log ?? (() => {});
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === o.slug);
  if (!product) throw new Error(`${o.slug} is not a Studio product`);
  const resolved = deps.store ? { ok: true as const, store: deps.store } : storeFromEnv();
  if (!resolved.ok) return { ok: false, blocked: `NEEDS_MEDIA_STORAGE_SETUP: ${resolved.missing.join(", ")}` };
  const store = resolved.store;

  const rows = o.videoRowId
    ? await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.id, o.videoRowId), eq(ms.msVideos.productId, product.id))).limit(1)
    : await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.productId, product.id), eq(ms.msVideos.status, "ready_for_review"))).orderBy(desc(ms.msVideos.createdAt)).limit(1);
  const video = rows[0];
  if (!video || !video.assetId) throw new Error(`${product.name} has no rendered video waiting`);
  const logo = ((video.qa as { checks?: Array<{ id: string; ok: boolean }> } | null)?.checks ?? []).filter((c) => c.id.startsWith("logo_"));
  if (logo.length === 0 || logo.some((c) => !c.ok)) throw new Error("NEEDS RE-RENDER: this video has no passing logo-integrity checks; it will not be sent for review");
  if (!(video.qa as { passed?: boolean } | null)?.passed) return { ok: false, blocked: "QA has not passed" };
  const record = video.storyboard as DemoRecord;

  let c = await canonicalForVideo(db, video.id);
  if (!c) {
    c = { id: newCanonicalId(), productId: product.id, title: o.title, status: "review", providers: [], createdAt: new Date().toISOString() };
    await saveCanonical(db, ACTOR, c);
    await linkCanonicalToVideo(db, ACTOR, video.id, c.id);
  }
  if (!o.upload) return { ok: true, canonicalId: c.id };
  if (!c.providers.some((p) => p.kind === "object")) {
    const [asset] = await db.select().from(ms.msAssets).where(eq(ms.msAssets.id, video.assetId)).limit(1);
    if (!asset) throw new Error("the video file record is missing");
    const bytes = await readAssetBytes(asset);
    const key = `t/${product.id}/${c.id}/${randomBytes(9).toString("base64url")}.mp4`;
    assertTenantKey(product.id, key);
    const put = await store.put(key, bytes, { contentType: "video/mp4" });
    log(`stored ${put.bytes} bytes${put.skipped ? " (already there)" : ""}, checksum verified`);
    const thumb = await thumbnail(bytes);
    let thumbKey: string | undefined;
    if (thumb) {
      thumbKey = `t/${product.id}/${c.id}/thumb-${randomBytes(6).toString("base64url")}.jpg`;
      await store.put(thumbKey, thumb, { contentType: "image/jpeg" });
    }
    c = addProvider(c, { kind: "object", key, bytes: put.bytes, sha256: put.sha256, contentType: "video/mp4", ...(thumbKey ? { thumbKey } : {}) });
    await saveCanonical(db, ACTOR, c);
  }

  const secret = process.env.MARKETING_SECRET_KEY;
  if (!secret) return { ok: false, blocked: "the review link secret is not configured" };
  const watchUrl = `${site()}/embed/${c.id}?t=${signMediaAccess(c.id, secret)}`;
  const existing = await getSetting<ReviewState | null>(reviewKey(c.id), null, db);
  const state: ReviewState & { provider: "hosted"; thumbUrl: string } = {
    ...(existing ?? {}),
    status: existing?.status ?? "unlisted_live",
    publicationId: c.id,
    productId: product.id,
    productName: product.name,
    videoRowId: video.id,
    videoId: c.id,
    watchUrl,
    title: o.title,
    description: o.description,
    durationSec: video.durationMs ? video.durationMs / 1000 : null,
    ctaText: record.cta.text,
    ctaUrl: record.cta.url,
    intendedUse: o.intended,
    uploadedAt: existing?.uploadedAt ?? new Date().toISOString(),
    specId: o.specId ?? o.slug,
    ...(o.library ? { library: o.library } : {}),
    provider: "hosted",
    thumbUrl: `${site()}/api/media/${c.id}/thumb`,
  };
  await setSetting(reviewKey(c.id), state, ACTOR, db, { audited: false });
  const sn = embedSnippet(site(), c.id, o.title);
  const entries = await getSetting<EmbedEntry[]>(embedKey(product.id), [], db);
  const entry: EmbedEntry = { publicationId: c.id, videoId: c.id, watchUrl: sn.url, embedUrl: sn.url, iframe: sn.iframe, visibility: "unlisted", recommendedPlacement: o.placement ?? "Near the top of the product's home page.", note: "Recommendation only. The embed refers to the canonical video, not to a provider." };
  await setSetting(embedKey(product.id), [...entries.filter((x) => x.publicationId !== c!.id), entry], ACTOR, db, { audited: false });
  await audit(db, { actor: ACTOR, action: "video_review.hosted_ready", entity: "publication", entityId: c.id, productId: product.id, detail: { canonicalId: c.id } });
  if (state.emailedAt) return { ok: true, canonicalId: c.id, emailed: true };
  const mail = await requestOwnerEmail(c.id);
  return { ok: true, canonicalId: c.id, emailed: mail.sent };
}

/** Owner approval of a hosted video: the same stored video becomes public. No provider call is needed. */
export async function approveHosted(db: StudioDb, actor: string, id: string, note?: string): Promise<ReviewState> {
  const r = await getSetting<ReviewState | null>(reviewKey(id), null, db);
  const c = await getCanonical(db, id);
  if (!r || !c) throw new Error("No review found for that video");
  if (r.status === "approved_public") return r;
  if (r.status === "superseded") throw new Error("This version was superseded by a newer one; review the newer version.");
  const now = new Date().toISOString();
  await saveCanonical(db, actor, { ...c, status: "public", publicAt: now });
  const state: ReviewState = { ...r, status: "approved_public", approvedAt: r.approvedAt ?? now, publicAt: now, ...(note ? { approvalNote: note.slice(0, 500) } : {}), events: [...(r.events ?? []), { at: now, event: "APPROVED" as const }, { at: now, event: "PUBLIC" as const }] };
  await setSetting(reviewKey(id), state, actor, db, { audited: false });
  const entries = await getSetting<EmbedEntry[]>(embedKey(r.productId), [], db);
  await setSetting(embedKey(r.productId), entries.map((e) => (e.publicationId === id ? { ...e, visibility: "public" as const } : e)), actor, db, { audited: false });
  await audit(db, { actor, action: "video_review.made_public", entity: "publication", entityId: id, productId: r.productId, detail: { canonicalId: id, hosted: true } });
  const [prod] = await db.select({ slug: ms.msProducts.slug }).from(ms.msProducts).where(eq(ms.msProducts.id, r.productId)).limit(1);
  if (prod) await updateAngle(db, actor, prod.slug, (a) => a.specId === r.specId, { status: "public", approval: "owner_approved", publicationUrl: embedSnippet(site(), id, r.title).url });
  return state;
}

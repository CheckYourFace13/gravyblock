/**
 * Where an approved video lives and plays (owner directive 2026-11-10). YouTube is optional.
 *   - A customer with their OWN connected YouTube channel: videos go to THAT channel (never the owner's iScream Studio channel).
 *   - A customer without one: GravyBlock-hosted playback from scalable S3-compatible object storage behind a CDN. The VPS disk is never permanent media storage.
 *   - The owner's own portfolio keeps using the shared iScream Studio channel.
 * This file holds the decision, the object-storage contract, the playback and embed shapes and the per-tenant storage accounting. The object-storage client itself needs a
 * provider and credentials the owner has not chosen yet, so hosted playback reports NEEDS_MEDIA_STORAGE_SETUP instead of quietly falling back to disk or to someone else's channel.
 */
import { eq, sql } from "drizzle-orm";
import { ms, type StudioDb } from "../db";
import { youtubeConnectionFor } from "./youtube-share";

export type PlaybackDestination =
  | { kind: "own_youtube"; connectionId: string; note: string }
  | { kind: "owner_portfolio_youtube"; connectionId: string; note: string }
  | { kind: "gravyblock_hosted"; ready: boolean; note: string }
  | { kind: "blocked"; note: string };

/** What an S3-compatible store needs. Nothing is read from disk and no secret is ever logged. */
export type MediaStoreConfig = { endpoint: string; bucket: string; region: string; cdnBase: string; accessKeyId: string; secretAccessKey: string };
export function mediaStoreConfig(env: Record<string, string | undefined> = process.env): { configured: true; config: MediaStoreConfig } | { configured: false; missing: string[] } {
  const need = { endpoint: "MEDIA_STORE_ENDPOINT", bucket: "MEDIA_STORE_BUCKET", region: "MEDIA_STORE_REGION", cdnBase: "MEDIA_STORE_CDN_BASE", accessKeyId: "MEDIA_STORE_ACCESS_KEY_ID", secretAccessKey: "MEDIA_STORE_SECRET_ACCESS_KEY" } as const;
  const missing = Object.values(need).filter((k) => !env[k]?.trim());
  if (missing.length) return { configured: false, missing };
  return { configured: true, config: Object.fromEntries(Object.entries(need).map(([k, e]) => [k, (env[e] as string).trim()])) as MediaStoreConfig };
}

/** Pure decision, given what is known about the product. A customer product never resolves to the owner's channel. */
export function decidePlayback(p: { ownerKind: string; ownConnectionId: string | null; storeConfigured: boolean }): PlaybackDestination {
  if (p.ownerKind === "customer") {
    if (p.ownConnectionId) return { kind: "own_youtube", connectionId: p.ownConnectionId, note: "the customer's own connected YouTube channel" };
    return { kind: "gravyblock_hosted", ready: p.storeConfigured, note: p.storeConfigured ? "GravyBlock-hosted playback from object storage and the CDN" : "NEEDS_MEDIA_STORAGE_SETUP: object storage is not configured yet, so nothing is hosted and nothing is sent to anyone else's channel" };
  }
  if (p.ownConnectionId) return { kind: "owner_portfolio_youtube", connectionId: p.ownConnectionId, note: "the owner's shared iScream Studio channel (owner products only)" };
  return { kind: "blocked", note: "no healthy YouTube connection for this product" };
}

export async function playbackFor(db: StudioDb, product: { id: string; ownerKind?: string }): Promise<PlaybackDestination> {
  const conn = await youtubeConnectionFor(db, product.id);
  return decidePlayback({ ownerKind: product.ownerKind ?? "internal", ownConnectionId: conn?.id ?? null, storeConfigured: mediaStoreConfig().configured });
}

/** The shapes a hosted video exposes: review playback (private, token), public playback, embed code, download. URLs are built from the CDN base and an unguessable object key. */
export function hostedPlayback(cdnBase: string, objectKey: string, title: string) {
  const url = `${cdnBase.replace(/\/$/, "")}/${objectKey.replace(/^\//, "")}`;
  const safe = title.replace(/[<>"&]/g, " ").trim();
  return {
    playUrl: url,
    embedCode: `<video controls playsinline preload="metadata" style="max-width:100%" title="${safe}"><source src="${url}" type="video/mp4"></video>`,
    downloadUrl: `${url}?download=1`,
  };
}
/** Object keys are tenant-prefixed and unguessable, so one customer's key can never address another's. */
export const objectKeyFor = (productId: string, videoId: string, token: string) => `t/${productId}/${videoId}/${token}.mp4`;

/** What we keep for the long term and what is working material that is purged. */
export const RETENTION = {
  keep: ["approved final master (until published and confirmed)", "thumbnail", "script and transcript", "metadata", "publication ids", "performance records"],
  purge: ["screenshots", "frames", "temporary audio", "failed renders", "intermediate captures", "superseded working files"],
  tmpTtlHours: 6,
} as const;

/** Bytes the tenant holds on disk (assets), so storage per tenant is always visible and a ceiling can be enforced. */
export async function tenantBytes(db: StudioDb, productId: string): Promise<{ assetBytes: number; videoBytes: number; total: number }> {
  const [a] = await db.select({ n: sql<number>`coalesce(sum(${ms.msAssets.bytes}),0)` }).from(ms.msAssets).where(eq(ms.msAssets.productId, productId));
  const [v] = await db.select({ n: sql<number>`coalesce(sum(${ms.msVideos.bytes}),0)` }).from(ms.msVideos).where(eq(ms.msVideos.productId, productId));
  const assetBytes = Number(a?.n ?? 0);
  const videoBytes = Number(v?.n ?? 0);
  return { assetBytes, videoBytes, total: assetBytes + videoBytes };
}

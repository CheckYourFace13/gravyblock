/**
 * The canonical video asset (owner directive 2026-11-10). A customer's website refers to ONE stable id, never to a provider: the same embed keeps working when the video lives on the
 * customer's YouTube channel, on GravyBlock-hosted object storage, or later on something else. A canonical video lists the places that hold a copy (providers); the player page
 * chooses among them at view time, so connecting YouTube later changes no website code.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { StudioDb } from "../db";
import { getSetting, setSetting } from "../runtime";

export type CanonicalProvider =
  | { kind: "youtube"; videoId: string }
  | { kind: "object"; key: string; bytes: number; sha256: string; contentType: string; thumbKey?: string };
export type CanonicalVideo = {
  id: string;
  productId: string;
  title: string;
  /** review: private, plays only with a review token. public: the owner approved it. retired: no longer served. */
  status: "review" | "public" | "retired";
  providers: CanonicalProvider[];
  createdAt: string;
  publicAt?: string;
};

export const canonicalKey = (id: string) => `video_canonical_${id}`;
export const canonicalByVideoKey = (videoRowId: string) => `video_canonical_for_${videoRowId}`;
export const newCanonicalId = () => `cv_${randomBytes(12).toString("base64url")}`;

export async function getCanonical(db: StudioDb, id: string): Promise<CanonicalVideo | null> {
  return /^cv_[\w-]{10,40}$/.test(id) ? getSetting<CanonicalVideo | null>(canonicalKey(id), null, db) : null;
}
export async function saveCanonical(db: StudioDb, actor: string, c: CanonicalVideo) {
  await setSetting(canonicalKey(c.id), c, actor, db, { audited: false });
}
/** The canonical id already made for a rendered video, so a retry never makes a second one. */
export async function canonicalForVideo(db: StudioDb, videoRowId: string): Promise<CanonicalVideo | null> {
  const id = await getSetting<string | null>(canonicalByVideoKey(videoRowId), null, db);
  return id ? getCanonical(db, id) : null;
}
export async function linkCanonicalToVideo(db: StudioDb, actor: string, videoRowId: string, id: string) {
  await setSetting(canonicalByVideoKey(videoRowId), id, actor, db, { audited: false });
}

export function addProvider(c: CanonicalVideo, p: CanonicalProvider): CanonicalVideo {
  return { ...c, providers: [...c.providers.filter((x) => x.kind !== p.kind), p] };
}

export type Playback = { kind: "youtube"; videoId: string; embedUrl: string } | { kind: "object"; key: string; thumbKey?: string; contentType: string };
/**
 * Pure: how the player shows this video. A public video prefers the customer's own YouTube copy when there is one (YouTube serves it for free and it counts toward their channel),
 * else the hosted copy. A video under review is only ever the hosted copy: unlisted YouTube links are for the email, never for an embed.
 */
export function choosePlayback(c: CanonicalVideo): Playback | null {
  if (c.status === "retired") return null;
  const yt = c.providers.find((p): p is Extract<CanonicalProvider, { kind: "youtube" }> => p.kind === "youtube");
  const obj = c.providers.find((p): p is Extract<CanonicalProvider, { kind: "object" }> => p.kind === "object");
  if (c.status === "public" && yt) return { kind: "youtube", videoId: yt.videoId, embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt.videoId)}?rel=0` };
  if (obj) return { kind: "object", key: obj.key, thumbKey: obj.thumbKey, contentType: obj.contentType };
  if (yt && c.status === "review") return { kind: "youtube", videoId: yt.videoId, embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt.videoId)}?rel=0` };
  return null;
}

/** What goes on the customer's website: always the GravyBlock embed URL for the canonical id, whatever provider serves it. */
export function embedSnippet(origin: string, id: string, title: string): { url: string; iframe: string } {
  const url = `${origin.replace(/\/$/, "")}/embed/${id}`;
  const safe = title.replace(/[<>"&]/g, " ").trim();
  return { url, iframe: `<iframe src="${url}" title="${safe}" width="360" height="640" style="border:0;max-width:100%" allow="fullscreen; autoplay" loading="lazy"></iframe>` };
}

// ---- review access: a signed, expiring link that lets the owner watch a video that is not public yet ----------------------------------------------

const mac = (key: string, id: string, exp: number) => createHmac("sha256", key).update(`media-access.${id}.${exp}`).digest("base64url");
export function signMediaAccess(id: string, key: string, ttlMs = 14 * 24 * 3_600_000, now = Date.now()): string {
  const exp = now + ttlMs;
  return `${exp}.${mac(key, id, exp)}`;
}
export function verifyMediaAccess(id: string, token: string | null | undefined, key: string | undefined, now = Date.now()): boolean {
  if (!key || !token || token.length > 200) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || !sig || exp < now) return false;
  const want = Buffer.from(mac(key, id, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

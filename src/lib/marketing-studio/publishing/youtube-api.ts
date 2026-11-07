/**
 * The official YouTube Data API v3 / Google OAuth 2.0 calls Marketing Studio makes, each one taking an injectable fetch so tests prove exactly
 * what would be sent. Nothing here touches the database or any stored credential.
 *
 * Scopes (the minimum that genuinely works):
 *   youtube.upload    videos.insert, the upload itself
 *   youtube.readonly  channels.list?mine=true (which channel the token belongs to) and videos.list (confirm an uploaded video and read its
 *                     public counts). youtube.upload alone cannot read either, so verification and measurement would be impossible without it.
 * No analytics, partner, account-management or comment scopes are requested.
 */
import type { Adapter, Deps, PublishResult } from "./adapters";

export const YT_SCOPE_UPLOAD = "https://www.googleapis.com/auth/youtube.upload";
export const YT_SCOPE_READ = "https://www.googleapis.com/auth/youtube.readonly";
export const YT_SCOPES = [YT_SCOPE_UPLOAD, YT_SCOPE_READ] as const;

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";

type GErr = { error?: string | { message?: string; code?: number; errors?: Array<{ reason?: string }> }; error_description?: string };
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const errMessage = (b: GErr) => (typeof b.error === "string" ? `${b.error}${b.error_description ? `: ${b.error_description}` : ""}` : b.error?.message) ?? "";
const errReason = (b: GErr) => (typeof b.error === "object" ? b.error?.errors?.[0]?.reason : undefined);

export type TokenGrant = { accessToken: string; refreshToken?: string; expiresInSec: number; scopes: string[] };

async function tokenRequest(fetchFn: typeof fetch, params: Record<string, string>): Promise<{ ok: true; grant: TokenGrant } | { ok: false; reason: string; invalidGrant: boolean }> {
  try {
    const res = await fetchFn(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
    const b = (await res.json().catch(() => ({}))) as GErr & { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
    if (!res.ok || !b.access_token) return { ok: false, reason: errMessage(b).slice(0, 200) || `HTTP ${res.status}`, invalidGrant: b.error === "invalid_grant" };
    return { ok: true, grant: { accessToken: b.access_token, refreshToken: b.refresh_token, expiresInSec: typeof b.expires_in === "number" ? b.expires_in : 3600, scopes: (b.scope ?? "").split(/\s+/).filter(Boolean) } };
  } catch (e) {
    return { ok: false, reason: `network error: ${e instanceof Error ? e.message.slice(0, 160) : "request failed"}`, invalidGrant: false };
  }
}

export const exchangeCode = (fetchFn: typeof fetch, c: { clientId: string; clientSecret: string; redirectUri: string; code: string }) =>
  tokenRequest(fetchFn, { grant_type: "authorization_code", code: c.code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirectUri });

export const refreshAccessToken = (fetchFn: typeof fetch, c: { clientId: string; clientSecret: string; refreshToken: string }) =>
  tokenRequest(fetchFn, { grant_type: "refresh_token", refresh_token: c.refreshToken, client_id: c.clientId, client_secret: c.clientSecret });

/** Best effort: tells Google to void the grant. A failure here never blocks the local revocation, which destroys our copy regardless. */
export async function revokeAtGoogle(fetchFn: typeof fetch, token: string): Promise<boolean> {
  try {
    const res = await fetchFn(REVOKE_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Google's own description of an access token (scopes, audience client, seconds left), for diagnostics only. Never includes the token. */
async function tokenSummary(fetchFn: typeof fetch, accessToken: string): Promise<string | null> {
  try {
    const res = await fetchFn(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, { method: "GET" });
    const t = (await res.json().catch(() => ({}))) as { scope?: string; aud?: string; azp?: string; expires_in?: string; error_description?: string };
    if (!res.ok) return `tokeninfo says ${(t.error_description ?? `HTTP ${res.status}`).slice(0, 60)}`;
    const scopes = (t.scope ?? "").split(" ").map((s) => s.split("/").pop()).join(",");
    const clientOk = (t.aud ?? t.azp ?? "") === process.env.MARKETING_GOOGLE_CLIENT_ID?.trim();
    // A public lookup with the same bearer separates "the token is bad" from "the token is fine but its identity has no channel (youtubeSignupRequired)".
    let probe = "";
    try {
      const p = await fetchFn(`${API}/channels?part=id&forHandle=%40youtube`, { method: "GET", headers: { authorization: `Bearer ${accessToken}` } });
      probe = `; public lookup with this token HTTP ${p.status}`;
    } catch {
      probe = "";
    }
    return `scopes ${scopes}; issued to this client ${clientOk}; ${t.expires_in ?? "?"}s left${probe}`;
  } catch {
    return null;
  }
}

export type OwnChannel = { id: string; title: string; handle: string | null };

/** The channel this token uploads to. Google binds a token to the single channel chosen at consent, so mine=true returns exactly that one. */
export async function fetchOwnChannel(fetchFn: typeof fetch, accessToken: string): Promise<{ ok: true; channels: OwnChannel[] } | { ok: false; reason: string; auth: boolean }> {
  try {
    const res = await fetchFn(`${API}/channels?part=snippet&mine=true&maxResults=5`, { method: "GET", headers: { authorization: `Bearer ${accessToken}` } });
    const b = (await res.json().catch(() => ({}))) as GErr & { items?: Array<{ id?: string; snippet?: { title?: string; customUrl?: string } }> };
    if (!res.ok || b.error) {
      // Say exactly what Google said (status, reason, the WWW-Authenticate hint) and what the token itself is, so a refusal can be diagnosed without any secret appearing.
      const hint = res.headers.get("www-authenticate")?.replace(/Bearer\s*/i, "").slice(0, 120);
      const info = await tokenSummary(fetchFn, accessToken);
      return { ok: false, reason: `HTTP ${res.status}${errReason(b) ? ` ${errReason(b)}` : ""}: ${errMessage(b).slice(0, 160) || "no message"}${hint ? ` [${hint}]` : ""}${info ? ` (token: ${info})` : ""}`, auth: res.status === 401 || res.status === 403 };
    }
    return { ok: true, channels: (b.items ?? []).filter((i) => i.id).map((i) => ({ id: i.id!, title: i.snippet?.title ?? "", handle: i.snippet?.customUrl ?? null })) };
  } catch (e) {
    return { ok: false, reason: `network error: ${e instanceof Error ? e.message.slice(0, 160) : "request failed"}`, auth: false };
  }
}

/** Does this channel match what the operator said they were connecting? Handle (with or without @) or exact channel name. Never a guess. */
export function channelMatches(ch: OwnChannel, expected: string): boolean {
  const want = expected.trim().toLowerCase().replace(/^@/, "");
  if (!want) return false;
  if (ch.id.toLowerCase() === want) return true;
  if (ch.handle && ch.handle.toLowerCase().replace(/^@/, "") === want) return true;
  return squash(ch.title) === squash(want);
}

/** "iScream Studio (@iscreamstudio)": what Marketing Studio shows as the connection's account label. */
export const channelLabel = (ch: OwnChannel) => `${ch.title}${ch.handle ? ` (${ch.handle.startsWith("@") ? ch.handle : `@${ch.handle}`})` : ""}`.slice(0, 120);

// ---- upload ---------------------------------------------------------------------------------------------------------------------------

export type YoutubeUploadExtras = {
  /** The owner's explicit "made for kids" declaration for this product. Null means undeclared, and the upload is refused. */
  madeForKids: boolean | null;
  privacy: "public" | "unlisted" | "private";
  categoryId?: string;
};

function classify(status: number, b: GErr, stage: "start" | "bytes"): Extract<PublishResult, { ok: false }> {
  const reason = errReason(b);
  const msg = errMessage(b).slice(0, 300) || `HTTP ${status}`;
  if (status === 401 || reason === "authError" || reason === "forbidden" || reason === "insufficientPermissions" || b.error === "invalid_grant") return { ok: false, retryable: false, authFailure: true, reason: `YouTube rejected the credentials or permissions: ${msg}` };
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded" || reason === "uploadLimitExceeded") return { ok: false, retryable: false, reason: `YouTube quota or upload limit reached (${reason}); not retried automatically: ${msg}` };
  if (stage === "start" && (status === 429 || status >= 500 || reason === "backendError" || reason === "internalError" || reason === "rateLimitExceeded")) return { ok: false, retryable: true, reason: `YouTube temporary error: ${msg}` };
  // After bytes began moving a retry could create a second video, so it is never automatic.
  if (stage === "bytes" && (status === 429 || status >= 500)) return { ok: false, retryable: false, reason: `YouTube error while uploading the file (${msg}). Check the channel for a partial upload before trying again; not retried automatically.` };
  return { ok: false, retryable: false, reason: `YouTube rejected the upload: ${msg}` };
}

export const youtubeAdapter: Adapter = {
  platform: "youtube",
  async publish(input, { fetch }) {
    const x = input.youtube;
    if (!x) return { ok: false, retryable: false, reason: "YouTube upload settings are missing" };
    if (x.madeForKids === null) return { ok: false, retryable: false, reason: "Upload refused: the owner has not declared whether this product's videos are made for kids (a YouTube requirement). Nothing was uploaded." };
    const title = (input.title ?? "").trim();
    if (!title) return { ok: false, retryable: false, reason: "A YouTube video needs a title" };
    if (title.length > 100) return { ok: false, retryable: false, reason: "The YouTube title is longer than 100 characters" };
    if (/[<>]/.test(title + input.caption)) return { ok: false, retryable: false, reason: "YouTube does not accept < or > in titles or descriptions" };
    if (input.media.kind !== "video") return { ok: false, retryable: false, reason: "YouTube takes video only" };
    try {
      // Wrong-channel protection at the moment of upload: the token must still belong to the channel this connection was verified as.
      const own = await fetchOwnChannel(fetch, input.accessToken);
      if (!own.ok) return own.auth ? { ok: false, retryable: false, authFailure: true, reason: `YouTube rejected the credentials: ${own.reason}` } : { ok: false, retryable: true, reason: `Could not confirm the channel before uploading: ${own.reason}` };
      if (own.channels.length !== 1 || own.channels[0].id !== input.externalAccountId) return { ok: false, retryable: false, authFailure: true, reason: `Upload refused: the token belongs to ${own.channels.map((c) => c.title).join(", ") || "no channel"}, not the connected channel ${input.externalAccountId}. Nothing was uploaded.` };

      const start = await fetch(`${UPLOAD}?uploadType=resumable&part=snippet,status`, {
        method: "POST",
        headers: { authorization: `Bearer ${input.accessToken}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-type": input.media.mime, "x-upload-content-length": String(input.media.bytes.length) },
        body: JSON.stringify({ snippet: { title, description: input.caption, categoryId: x.categoryId ?? "22" }, status: { privacyStatus: x.privacy, selfDeclaredMadeForKids: x.madeForKids, embeddable: true } }),
      });
      if (!start.ok) return classify(start.status, (await start.json().catch(() => ({}))) as GErr, "start");
      const session = start.headers.get("location");
      if (!session || !session.startsWith("https://")) return { ok: false, retryable: true, reason: "YouTube did not return an upload session address" };

      let up: Response;
      try {
        up = await fetch(session, { method: "PUT", headers: { authorization: `Bearer ${input.accessToken}`, "content-type": input.media.mime, "content-length": String(input.media.bytes.length) }, body: new Uint8Array(input.media.bytes) });
      } catch (e) {
        return { ok: false, retryable: false, reason: `Network error while uploading the file (${e instanceof Error ? e.message.slice(0, 120) : "failed"}). Check the channel for a partial upload before trying again; not retried automatically.` };
      }
      const body = (await up.json().catch(() => ({}))) as GErr & { id?: string };
      if (!up.ok || !body.id) return classify(up.status, body, "bytes");
      return { ok: true, externalId: body.id, url: `https://www.youtube.com/watch?v=${body.id}` };
    } catch (e) {
      return { ok: false, retryable: true, reason: `Network error talking to YouTube: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}` };
    }
  },
  async remove(input, { fetch }) {
    try {
      const res = await fetch(`${API}/videos?id=${encodeURIComponent(input.externalId)}`, { method: "DELETE", headers: { authorization: `Bearer ${input.accessToken}` } });
      // youtube.upload and youtube.readonly cannot delete; Marketing Studio never asks for the broader scope, so removal is manual in YouTube Studio.
      return res.status === 204 ? { ok: true } : { ok: false, reason: "Removal is manual in YouTube Studio: Marketing Studio holds no delete permission." };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  },
};

// ---- external verification and measurement ----------------------------------------------------------------------------------------------

type VideoItem = {
  id?: string;
  snippet?: { channelId?: string; title?: string; description?: string };
  status?: { uploadStatus?: string; privacyStatus?: string; failureReason?: string; rejectionReason?: string; madeForKids?: boolean; selfDeclaredMadeForKids?: boolean };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};

async function listVideo(fetchFn: typeof fetch, videoId: string, accessToken: string): Promise<{ ok: true; item: VideoItem | null } | { ok: false; reason: string; auth: boolean }> {
  try {
    const res = await fetchFn(`${API}/videos?part=snippet,status,statistics&id=${encodeURIComponent(videoId)}`, { method: "GET", headers: { authorization: `Bearer ${accessToken}` } });
    const b = (await res.json().catch(() => ({}))) as GErr & { items?: VideoItem[] };
    if (!res.ok || b.error) return { ok: false, reason: errMessage(b).slice(0, 200) || `HTTP ${res.status}`, auth: res.status === 401 || res.status === 403 };
    return { ok: true, item: b.items?.[0] ?? null };
  } catch (e) {
    return { ok: false, reason: `network error: ${e instanceof Error ? e.message.slice(0, 160) : "request failed"}`, auth: false };
  }
}

export type YoutubeVerification = { live: boolean; permalink: string | null; privacy: string | null; uploadStatus: string | null; onExpectedChannel: boolean; reason?: string };

/** Confirms, straight from YouTube, that the video exists on the expected channel, finished processing, and its visibility. */
export async function verifyYoutubeVideo(input: { videoId: string; channelId: string; accessToken: string; requirePublic?: boolean }, deps: Deps): Promise<YoutubeVerification> {
  const r = await listVideo(deps.fetch, input.videoId, input.accessToken);
  if (!r.ok) return { live: false, permalink: null, privacy: null, uploadStatus: null, onExpectedChannel: false, reason: r.reason };
  if (!r.item) return { live: false, permalink: null, privacy: null, uploadStatus: null, onExpectedChannel: false, reason: "YouTube does not list a video with that id" };
  const uploadStatus = r.item.status?.uploadStatus ?? null;
  const privacy = r.item.status?.privacyStatus ?? null;
  const onExpectedChannel = r.item.snippet?.channelId === input.channelId;
  const processed = uploadStatus === "processed" || uploadStatus === "uploaded";
  const visible = input.requirePublic === false ? privacy !== null : privacy === "public";
  const problems = [!onExpectedChannel && "the video is on a different channel", !processed && `upload status is ${uploadStatus ?? "unknown"}${r.item.status?.rejectionReason ? ` (${r.item.status.rejectionReason})` : r.item.status?.failureReason ? ` (${r.item.status.failureReason})` : ""}`, !visible && `visibility is ${privacy ?? "unknown"}, not public`].filter(Boolean) as string[];
  return { live: problems.length === 0, permalink: `https://www.youtube.com/watch?v=${input.videoId}`, privacy, uploadStatus, onExpectedChannel, reason: problems.length ? problems.join("; ") : undefined };
}

export type YoutubeLiveMetadata = { exists: boolean; channelId: string | null; title: string | null; description: string | null; privacy: string | null; madeForKids: boolean | null; selfDeclaredMadeForKids: boolean | null; reason?: string };

/** Read-only: the video's live title, description, channel, visibility and made-for-kids flags exactly as YouTube holds them. */
export async function fetchYoutubeLiveMetadata(input: { videoId: string; accessToken: string }, deps: Deps): Promise<YoutubeLiveMetadata> {
  const none = { channelId: null, title: null, description: null, privacy: null, madeForKids: null, selfDeclaredMadeForKids: null };
  const r = await listVideo(deps.fetch, input.videoId, input.accessToken);
  if (!r.ok) return { exists: false, ...none, reason: r.reason };
  if (!r.item) return { exists: false, ...none, reason: "YouTube does not list a video with that id" };
  const s = r.item.status;
  return { exists: true, channelId: r.item.snippet?.channelId ?? null, title: r.item.snippet?.title ?? null, description: r.item.snippet?.description ?? null, privacy: s?.privacyStatus ?? null, madeForKids: s?.madeForKids ?? null, selfDeclaredMadeForKids: s?.selfDeclaredMadeForKids ?? null };
}

export type YoutubeCounts ={ views: number | null; likes: number | null; comments: number | null; exists: boolean; authFailure: boolean; detail: string[] };

/** Public counts for one uploaded video. A count YouTube withholds (for example hidden likes) is null, never zero. */
export async function collectYoutubeCounts(input: { videoId: string; accessToken: string }, deps: Deps): Promise<YoutubeCounts> {
  const r = await listVideo(deps.fetch, input.videoId, input.accessToken);
  if (!r.ok) return { views: null, likes: null, comments: null, exists: true, authFailure: r.auth, detail: [r.reason] };
  if (!r.item) return { views: null, likes: null, comments: null, exists: false, authFailure: false, detail: ["video not found"] };
  const n = (v: string | undefined) => (v !== undefined && /^\d+$/.test(v) ? Number(v) : null);
  const s = r.item.statistics;
  return { views: n(s?.viewCount), likes: n(s?.likeCount), comments: n(s?.commentCount), exists: true, authFailure: false, detail: [] };
}

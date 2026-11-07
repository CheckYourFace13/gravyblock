/**
 * Official Google sign-in for ONE YouTube channel (server-side OAuth 2.0 with offline access). The operator is sent to accounts.google.com,
 * picks the channel and approves the listed permissions there, and Google sends the browser back with a one-time code. Nobody types or pastes
 * a password or token. Uses a Studio-only Google OAuth client (MARKETING_GOOGLE_CLIENT_ID / MARKETING_GOOGLE_CLIENT_SECRET).
 *
 * Channel safety: the connection is made for an EXPECTED channel (handle or name given when the operator starts). After consent the channel the
 * token belongs to is read from YouTube and must match; anything else (another channel on the same Google account, no channel, an ambiguous
 * result) connects nothing. The channel id is stored and re-checked on every upload, so a token can never quietly post somewhere else.
 *
 * Tokens: the refresh token and the current access token are stored in the existing AES-256-GCM credential reference. The short-lived access
 * token is renewed from the refresh token just before a call, and the new ciphertext replaces the old one.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { audit } from "../audit";
import { encryptSecret, revealSecretForPlatformCall, storeConnection } from "../credentials";
import { ms, requireStudioDb, type StudioDb } from "../db";
import type { OwnerScope } from "../scope";
import type { Deps } from "./adapters";
import { connectAccount, type TokenBundle } from "./connections";
import { channelLabel, channelMatches, exchangeCode, fetchOwnChannel, refreshAccessToken, YT_SCOPES, YT_SCOPE_MANAGE, YT_SCOPE_READ, YT_SCOPE_UPLOAD } from "./youtube-api";

export const YOUTUBE_FIRST = {
  brand: "iScream Studio",
  /** the umbrella channel for every iScream Studio game; individual videos stay product-first */
  expectedHandle: "iScreamStudioInc",
  /** first candidates once the connection is proven, in this order. Nothing is uploaded by the connection itself. */
  order: ["scribblezap", "mibblemeadow"] as const,
};

/**
 * The exact channel id of the iScream Studio channel (verified in YouTube Studio: name "iScream Studio", handle @iScreamStudioInc, a Brand Account
 * channel). A connection is only ever made to this id; the handle or name typed at connect time must match as well. Overridable for tests.
 */
export const pinnedChannelId = () => process.env.MARKETING_YOUTUBE_CHANNEL_ID?.trim() || "UCWfKcCO0cZAIipELtpWHMmQ";

const STATE_TTL_MS = 30 * 60_000;
const SKEW_MS = 120_000;

export function youtubeOAuthConfigured(): boolean {
  return Boolean(process.env.MARKETING_GOOGLE_CLIENT_ID?.trim() && process.env.MARKETING_GOOGLE_CLIENT_SECRET?.trim() && process.env.MARKETING_SECRET_KEY);
}

/** The exact redirect URI to register with Google. Must match character for character, including the path and the lack of a trailing slash. */
export const youtubeCallbackUrl = () => `${(process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://gravyblock.com").replace(/\/$/, "")}/api/admin/marketing-studio/connect/youtube/callback`;

const sign = (payload: string) => createHmac("sha256", `${process.env.MARKETING_SECRET_KEY}|yt-oauth-state`).update(payload).digest("base64url");

export function makeYoutubeState(productId: string, expected: string, nonce: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ p: productId, c: expected, n: nonce, e: now + STATE_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readYoutubeState(state: string, nonce: string, now = Date.now()): { productId: string; expected: string } | null {
  const [payload, mac] = state.split(".");
  if (!payload || !mac) return null;
  const want = sign(payload);
  if (mac.length !== want.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { p: string; c: string; n: string; e: number };
    if (d.e < now || d.n !== nonce || typeof d.p !== "string" || typeof d.c !== "string" || !d.c) return null;
    return { productId: d.p, expected: d.c };
  } catch {
    return null;
  }
}

export function youtubeAuthorizeUrl(state: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", process.env.MARKETING_GOOGLE_CLIENT_ID!.trim());
  u.searchParams.set("redirect_uri", youtubeCallbackUrl());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", [...YT_SCOPES, YT_SCOPE_MANAGE].join(" "));
  // offline + consent: Google only returns a refresh token on the first consent unless it is asked for again, and uploads happen while nobody is signed in
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent select_account");
  u.searchParams.set("include_granted_scopes", "false");
  u.searchParams.set("state", state);
  return u.toString();
}

const UNVERIFIED = "unverified-";

async function quarantine(scope: OwnerScope, actor: string, productId: string, g: { accessToken: string; refreshToken?: string; expiresInSec: number }, reason: string, db: StudioDb = requireStudioDb()) {
  await db.delete(ms.msConnections).where(and(eq(ms.msConnections.productId, productId), eq(ms.msConnections.platform, "youtube"), like(ms.msConnections.externalAccountId, `${UNVERIFIED}%`)));
  const tokens: TokenBundle = { accessToken: g.accessToken, refreshToken: g.refreshToken, accessExpiresAt: Date.now() + g.expiresInSec * 1000 };
  const row = await storeConnection(scope, actor, productId, { platform: "youtube", accountLabel: "Unverified YouTube authorization", secret: JSON.stringify(tokens), scopes: [YT_SCOPE_UPLOAD, YT_SCOPE_READ], externalAccountId: `${UNVERIFIED}${Date.now().toString(36)}`, tokenExpiresAt: null }, db);
  await db.update(ms.msConnections).set({ status: "error", healthStatus: "error", healthDetail: `Not verified: ${reason.slice(0, 280)}` }).where(eq(ms.msConnections.id, row.id));
  await audit(db, { actor, action: "connection.quarantine", entity: "connection", entityId: row.id, productId, detail: { platform: "youtube", reason: reason.slice(0, 200) } });
}

export type ReverifyResult = { promoted: boolean; reason: string; channel?: { id: string; title: string; handle: string | null } };

/**
 * Re-runs the channel check for a kept-unverified authorization (renewing the access token from the refresh token first). Only an authorization whose token
 * belongs to exactly the pinned channel, matching the expected handle, becomes a normal healthy connection; anything else stays unusable.
 */
export async function reverifyYoutubeConnection(scope: OwnerScope, actor: string, productId: string, expectedChannel: string, deps: Deps, db: StudioDb = requireStudioDb()): Promise<ReverifyResult> {
  const [row] = await db.select().from(ms.msConnections).where(and(eq(ms.msConnections.productId, productId), eq(ms.msConnections.platform, "youtube"), like(ms.msConnections.externalAccountId, `${UNVERIFIED}%`))).limit(1);
  if (!row) return { promoted: false, reason: "no kept-unverified YouTube authorization for this product" };
  let tokens: TokenBundle;
  try {
    tokens = await youtubeTokensForCall(scope, actor, productId, row.id, deps, db);
  } catch (e) {
    return { promoted: false, reason: e instanceof Error ? e.message.slice(0, 200) : "token renewal failed" };
  }
  const own = await fetchOwnChannel(deps.fetch, tokens.accessToken);
  if (!own.ok) return { promoted: false, reason: own.reason };
  if (own.channels.length !== 1) return { promoted: false, reason: own.channels.length ? `token belongs to several channels (${own.channels.map((c) => c.title).join(", ")})` : "the token's identity has no YouTube channel" };
  const ch = own.channels[0];
  if (ch.id !== pinnedChannelId()) return { promoted: false, reason: `token belongs to "${ch.title}" (${ch.id}), not the pinned iScream Studio channel`, channel: ch };
  if (!channelMatches(ch, expectedChannel)) return { promoted: false, reason: `channel "${ch.title}" does not match "${expectedChannel}"`, channel: ch };
  const clash = await db.select({ id: ms.msConnections.id }).from(ms.msConnections).where(and(eq(ms.msConnections.productId, productId), eq(ms.msConnections.platform, "youtube"), eq(ms.msConnections.externalAccountId, ch.id)));
  if (clash.length) return { promoted: false, reason: "this channel is already connected to this product", channel: ch };
  await db.update(ms.msConnections).set({ externalAccountId: ch.id, accountLabel: channelLabel(ch), status: "connected", healthStatus: "ok", healthDetail: null, lastCheckedAt: new Date() }).where(eq(ms.msConnections.id, row.id));
  await audit(db, { actor, action: "connection.verified", entity: "connection", entityId: row.id, productId, detail: { platform: "youtube", channelId: ch.id } });
  return { promoted: true, reason: "verified", channel: ch };
}

export type YoutubeOAuthOutcome = { connectionId: string; channelId: string; channelTitle: string; channelHandle: string | null; grantedScopes: string[] };

/**
 * Exchanges the one-time code, requires the full scope set and a refresh token, identifies the channel the token belongs to and requires it
 * to be exactly the expected one, then stores the credential encrypted. Throws, with nothing stored, on any doubt.
 */
export async function completeYoutubeOAuth(scope: OwnerScope, actor: string, input: { productId: string; code: string; expectedChannel: string }, deps: Deps, db?: StudioDb): Promise<YoutubeOAuthOutcome> {
  if (!input.expectedChannel.trim()) throw new Error("No expected channel was given, so no channel can be verified. Nothing was connected.");
  const grant = await exchangeCode(deps.fetch, { clientId: process.env.MARKETING_GOOGLE_CLIENT_ID!.trim(), clientSecret: process.env.MARKETING_GOOGLE_CLIENT_SECRET!.trim(), redirectUri: youtubeCallbackUrl(), code: input.code });
  if (!grant.ok) throw new Error(`Google said: ${grant.reason}. Nothing was connected.`);
  const g = grant.grant;
  const missing = YT_SCOPES.filter((s) => !g.scopes.includes(s));
  if (missing.length) throw new Error(`The authorization did not include: ${missing.map((s) => s.split("/").pop()).join(", ")}. Nothing was connected.`);
  if (!g.refreshToken) throw new Error("Google did not return a refresh token, so uploads could not continue after the first hour. Remove GravyBlock's access at myaccount.google.com/permissions and connect again. Nothing was connected.");

  const own = await fetchOwnChannel(deps.fetch, g.accessToken);
  if (!own.ok) {
    // Google accepted the consent but the channel could not be read. Keep the authorization, encrypted and UNUSABLE, so the check can be repeated on the server
    // (after a fix) without the owner signing in again. It becomes a normal connection only if re-verification passes (reverifyYoutubeConnection).
    await quarantine(scope, actor, input.productId, g, own.reason, db);
    throw new Error(`Could not read the YouTube channel: ${own.reason}. The authorization was kept unverified and unusable so it can be re-checked on the server; nothing is connected.`);
  }
  if (own.channels.length !== 1) throw new Error(own.channels.length === 0 ? "This Google account has no YouTube channel behind that sign-in. Nothing was connected." : `Could not choose exactly one channel (${own.channels.map((c) => c.title).join(", ")}). Nothing was connected.`);
  const ch = own.channels[0];
  if (ch.id !== pinnedChannelId()) throw new Error(`The channel you authorized is "${ch.title}" (id ${ch.id}), which is not the iScream Studio channel GravyBlock is pinned to. Nothing was connected.`);
  if (!channelMatches(ch, input.expectedChannel)) throw new Error(`The channel you authorized is "${ch.title}"${ch.handle ? ` (${ch.handle})` : ""}, not the expected "${input.expectedChannel}". GravyBlock will not use it. Nothing was connected.`);

  const tokens: TokenBundle = { accessToken: g.accessToken, refreshToken: g.refreshToken, accessExpiresAt: Date.now() + g.expiresInSec * 1000 };
  // Only the declared scopes are recorded. The connection has no calendar expiry: the refresh token renews the access token as needed.
  const summary = await connectAccount(scope, actor, input.productId, { platform: "youtube", accountLabel: channelLabel(ch), externalAccountId: ch.id, tokens, scopes: [YT_SCOPE_UPLOAD, YT_SCOPE_READ, ...(g.scopes.includes(YT_SCOPE_MANAGE) ? [YT_SCOPE_MANAGE] : [])], tokenExpiresAt: null }, db);
  return { connectionId: summary.id, channelId: ch.id, channelTitle: ch.title, channelHandle: ch.handle, grantedScopes: g.scopes.filter((s) => (YT_SCOPES as readonly string[]).includes(s) || s === YT_SCOPE_MANAGE) };
}

/**
 * The usable tokens of a YouTube connection: the stored access token while it is fresh, otherwise a new one obtained with the refresh token
 * (and stored encrypted in place of the old). If Google refuses the refresh token the connection is marked in error so nothing keeps trying.
 */
export async function youtubeTokensForCall(scope: OwnerScope, actor: string, productId: string, connectionId: string, deps: Deps, db: StudioDb = requireStudioDb(), now = Date.now()): Promise<TokenBundle> {
  const bundle = JSON.parse(await revealSecretForPlatformCall(scope, actor, productId, connectionId, db)) as TokenBundle;
  if (bundle.accessToken && bundle.accessExpiresAt && bundle.accessExpiresAt - now > SKEW_MS) return bundle;
  if (!bundle.refreshToken) throw new Error("This YouTube connection has no refresh token; reconnect it.");
  const r = await refreshAccessToken(deps.fetch, { clientId: process.env.MARKETING_GOOGLE_CLIENT_ID?.trim() ?? "", clientSecret: process.env.MARKETING_GOOGLE_CLIENT_SECRET?.trim() ?? "", refreshToken: bundle.refreshToken });
  if (!r.ok) {
    if (r.invalidGrant) await db.update(ms.msConnections).set({ healthStatus: "error", status: "error", healthDetail: "Google no longer accepts this authorization (revoked, or the Google Cloud app is still in Testing mode). Reconnect the channel." }).where(eq(ms.msConnections.id, connectionId));
    throw new Error(`Could not renew the YouTube access token: ${r.reason}`);
  }
  const next: TokenBundle = { accessToken: r.grant.accessToken, refreshToken: r.grant.refreshToken ?? bundle.refreshToken, accessExpiresAt: now + r.grant.expiresInSec * 1000 };
  const enc = encryptSecret(JSON.stringify(next));
  await db.update(ms.msConnections).set({ secretCiphertext: enc.ciphertext, keyId: enc.keyId, lastCheckedAt: new Date(now) }).where(eq(ms.msConnections.id, connectionId));
  await audit(db, { actor, action: "connection.refresh", entity: "connection", entityId: connectionId, productId, detail: { platform: "youtube" } });
  return next;
}

export type ChannelCheck = { ok: boolean; name: string; detail: string };

/** Live, read-only: does this connection's token still belong to exactly the channel it was verified as, and is it the expected one? */
export async function verifyYoutubeConnection(scope: OwnerScope, actor: string, conn: { id: string; productId: string; externalAccountId: string | null; accountLabel: string; scopes: unknown }, expectedChannel: string, deps: Deps, db: StudioDb = requireStudioDb()): Promise<ChannelCheck[]> {
  const out: ChannelCheck[] = [];
  const scopes = (conn.scopes as string[]) ?? [];
  const missing = YT_SCOPES.filter((s) => !scopes.includes(s));
  out.push({ name: "required permissions were granted", ok: missing.length === 0, detail: missing.length ? `missing ${missing.map((s) => s.split("/").pop()).join(", ")}` : scopes.map((s) => s.split("/").pop()).join(", ") });
  try {
    const t = await youtubeTokensForCall(scope, actor, conn.productId, conn.id, deps, db);
    out.push({ name: "the stored authorization works (renewed from the refresh token when needed)", ok: true, detail: t.refreshToken ? "refresh token present" : "no refresh token" });
    const own = await fetchOwnChannel(deps.fetch, t.accessToken);
    if (!own.ok) {
      out.push({ name: "YouTube confirms the channel", ok: false, detail: own.reason });
      return out;
    }
    const ch = own.channels.length === 1 ? own.channels[0] : null;
    out.push({ name: "the token belongs to exactly one channel", ok: Boolean(ch), detail: own.channels.map((c) => c.title).join(", ") || "none" });
    if (ch) {
      out.push({ name: "it is the channel this connection was made for (same id)", ok: ch.id === conn.externalAccountId, detail: `${ch.title} (${ch.id})` });
      out.push({ name: "it is the pinned iScream Studio channel id", ok: ch.id === pinnedChannelId(), detail: ch.id === pinnedChannelId() ? "matches" : `got ${ch.id}` });
      out.push({ name: `it is the expected channel "${expectedChannel}"`, ok: channelMatches(ch, expectedChannel), detail: ch.handle ?? ch.title });
    }
  } catch (e) {
    out.push({ name: "the stored authorization works", ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "failed" });
  }
  return out;
}

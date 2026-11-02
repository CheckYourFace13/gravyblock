/**
 * Official Facebook Login for Pages. This is the ONLY way a Facebook Page is connected to a product: the operator is sent to
 * facebook.com, approves the listed permissions there, and Facebook sends the browser back with a one-time code. Nobody ever types or
 * pastes a password or token. Uses a Studio-only Meta app (MARKETING_FB_APP_ID / MARKETING_FB_APP_SECRET), separate from anything the
 * websites use, and requests only the scopes the Facebook platform spec allows.
 *
 * The state value is signed and expires, so a callback cannot be forged or replayed for another product.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { connectAccount, type TokenBundle } from "./connections";
import { graphBase, type Deps } from "./adapters";
import { PLATFORM_SPECS } from "./platforms";
import type { StudioDb } from "../db";
import type { OwnerScope } from "../scope";

export const FB_OAUTH_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "read_insights"] as const;
const STATE_TTL_MS = 10 * 60_000;

export function facebookOAuthConfigured(): boolean {
  return Boolean(process.env.MARKETING_FB_APP_ID?.trim() && process.env.MARKETING_FB_APP_SECRET?.trim() && process.env.MARKETING_SECRET_KEY);
}

export const callbackUrl = () => `${(process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://gravyblock.com").replace(/\/$/, "")}/api/admin/marketing-studio/connect/facebook/callback`;

const sign = (payload: string) => createHmac("sha256", `${process.env.MARKETING_SECRET_KEY}|fb-oauth-state`).update(payload).digest("base64url");

export function makeState(productId: string, handle: string | null, nonce: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ p: productId, h: handle, n: nonce, e: now + STATE_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readState(state: string, nonce: string, now = Date.now()): { productId: string; handle: string | null } | null {
  const [payload, mac] = state.split(".");
  if (!payload || !mac) return null;
  const want = sign(payload);
  if (mac.length !== want.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { p: string; h: string | null; n: string; e: number };
    if (d.e < now || d.n !== nonce || typeof d.p !== "string") return null;
    return { productId: d.p, handle: typeof d.h === "string" ? d.h : null };
  } catch {
    return null;
  }
}

export function authorizeUrl(state: string): string {
  const u = new URL(`https://www.facebook.com/${process.env.MARKETING_FB_GRAPH_VERSION?.trim() || "v25.0"}/dialog/oauth`);
  u.searchParams.set("client_id", process.env.MARKETING_FB_APP_ID!.trim());
  u.searchParams.set("redirect_uri", callbackUrl());
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", FB_OAUTH_SCOPES.join(","));
  return u.toString();
}

type PageRow = { id: string; name: string; username?: string; access_token?: string; tasks?: string[] };
type Err = { error?: { message?: string } };

async function graph<T>(fetchFn: typeof fetch, url: string): Promise<T> {
  const res = await fetchFn(url, { method: "GET" });
  const body = (await res.json().catch(() => ({}))) as T & Err;
  if (!res.ok || body.error) throw new Error(`Facebook said: ${body.error?.message?.slice(0, 160) ?? `HTTP ${res.status}`}`);
  return body;
}

export type OAuthOutcome = { connectionId: string; pageName: string; pageId: string; grantedScopes: string[] };

/**
 * Exchanges the one-time code for a long-lived user token, finds the Page the operator manages (by expected handle, or the only
 * one), and stores that PAGE token encrypted. The user token is discarded and never stored.
 */
export async function completeFacebookOAuth(
  scope: OwnerScope,
  actor: string,
  input: { productId: string; code: string; expectedHandle?: string | null },
  deps: Deps,
  db?: StudioDb,
): Promise<OAuthOutcome> {
  const base = graphBase();
  const id = process.env.MARKETING_FB_APP_ID!.trim();
  const secret = process.env.MARKETING_FB_APP_SECRET!.trim();
  const short = await graph<{ access_token?: string }>(deps.fetch, `${base}/oauth/access_token?${new URLSearchParams({ client_id: id, redirect_uri: callbackUrl(), client_secret: secret, code: input.code })}`);
  if (!short.access_token) throw new Error("Facebook did not return an access token");
  const long = await graph<{ access_token?: string }>(deps.fetch, `${base}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: short.access_token })}`);
  const userToken = long.access_token ?? short.access_token;

  const perms = await graph<{ data?: Array<{ permission: string; status: string }> }>(deps.fetch, `${base}/me/permissions?access_token=${encodeURIComponent(userToken)}`);
  const granted = (perms.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission);
  const spec = PLATFORM_SPECS.facebook.auth;
  const missing = spec.requiredScopes.filter((s) => !granted.includes(s));
  if (missing.length) throw new Error(`The authorization did not include: ${missing.join(", ")}. Nothing was connected.`);
  // Only record scopes the platform spec allows, even if Facebook reports more were granted.
  const scopes = granted.filter((s) => spec.allowedScopes.includes(s));

  const pages = await graph<{ data?: PageRow[] }>(deps.fetch, `${base}/me/accounts?fields=id,name,username,access_token,tasks&limit=100&access_token=${encodeURIComponent(userToken)}`);
  const list = pages.data ?? [];
  if (!list.length) throw new Error("This Facebook account manages no Pages, so there is nothing to connect.");
  const want = input.expectedHandle?.trim().toLowerCase().replace(/^@/, "");
  const picked = want ? list.filter((p) => (p.username ?? "").toLowerCase() === want || p.name.toLowerCase().replace(/\s+/g, "") === want.replace(/\s+/g, "")) : list.length === 1 ? list : [];
  if (picked.length !== 1) throw new Error(`Could not choose exactly one Page${want ? ` matching "${want}"` : ""}. Pages available: ${list.map((p) => p.name).join(", ")}. Nothing was connected.`);
  const page = picked[0];
  if (!page.access_token) throw new Error("Facebook did not give a Page token for this Page");
  if (page.tasks && !page.tasks.includes("CREATE_CONTENT")) throw new Error("This account cannot create content on that Page (needs a role that can post). Nothing was connected.");

  const tokens: TokenBundle = { accessToken: page.access_token };
  const summary = await connectAccount(scope, actor, input.productId, { platform: "facebook", accountLabel: page.name, externalAccountId: page.id, tokens, scopes, tokenExpiresAt: null }, db);
  return { connectionId: summary.id, pageName: page.name, pageId: page.id, grantedScopes: scopes };
}

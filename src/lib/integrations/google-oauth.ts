import { createHmac, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, googleOauthConnections } from "@/lib/db";

export const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

function clientId() {
  return process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
}
function clientSecret() {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
}
function stateSecret() {
  return process.env.CUSTOMER_AUTH_SECRET?.trim() || process.env.ADMIN_SECRET?.trim() || "dev-state-secret";
}
function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || "http://localhost:3000";
}

export function isGoogleConfigured() {
  return Boolean(clientId() && clientSecret());
}

// ── State token (signed, prevents CSRF) ──────────────────────────────────────

export function createOauthStateToken(businessId: string): string {
  const payload = JSON.stringify({ businessId, nonce: randomBytes(8).toString("hex"), ts: Date.now() });
  const encoded = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyOauthStateToken(state: string): { businessId: string } | null {
  const [encoded, sig] = state.split(".");
  if (!encoded || !sig) return null;
  const expected = createHmac("sha256", stateSecret()).update(encoded).digest("base64url");
  if (sig !== expected) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString()) as { businessId: string; ts: number };
    if (!parsed.businessId) return null;
    // State tokens expire after 10 minutes
    if (Date.now() - parsed.ts > 10 * 60 * 1000) return null;
    return { businessId: parsed.businessId };
  } catch {
    return null;
  }
}

// ── OAuth URL ─────────────────────────────────────────────────────────────────

export function buildGoogleAuthUrl(businessId: string): string {
  const state = createOauthStateToken(businessId);
  const redirectUri = `${siteUrl()}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ── Token exchange ────────────────────────────────────────────────────────────

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const redirectUri = `${siteUrl()}/api/auth/google/callback`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return res.json() as Promise<TokenResponse>;
}

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("Token refresh failed");
  const json = (await res.json()) as TokenResponse;
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  };
}

// ── Google email lookup ───────────────────────────────────────────────────────

export async function getGoogleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { email?: string };
  return json.email ?? null;
}

// ── Token storage ─────────────────────────────────────────────────────────────

export async function upsertGoogleConnection(input: {
  businessId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string;
  googleEmail?: string | null;
}) {
  const db = getDb();
  if (!db) return;
  await db
    .insert(googleOauthConnections)
    .values({
      businessId: input.businessId,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt: input.expiresAt,
      scopes: input.scopes,
      googleEmail: input.googleEmail ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: googleOauthConnections.businessId,
      set: {
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt,
        scopes: input.scopes,
        googleEmail: input.googleEmail ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function updateGoogleConnectionProperty(businessId: string, update: {
  searchConsoleProperty?: string | null;
  gbpAccountId?: string | null;
  gbpLocationName?: string | null;
}) {
  const db = getDb();
  if (!db) return;
  await db
    .update(googleOauthConnections)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(googleOauthConnections.businessId, businessId));
}

export async function disconnectGoogle(businessId: string) {
  const db = getDb();
  if (!db) return;
  await db.delete(googleOauthConnections).where(eq(googleOauthConnections.businessId, businessId));
}

// ── Get a fresh access token (auto-refreshes if needed) ───────────────────────

export async function getFreshAccessToken(businessId: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;

  const [conn] = await db
    .select()
    .from(googleOauthConnections)
    .where(eq(googleOauthConnections.businessId, businessId))
    .limit(1);

  if (!conn) return null;

  // Still valid for at least 5 minutes
  if (conn.expiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return conn.accessToken;
  }

  // Refresh
  try {
    const refreshed = await refreshAccessToken(conn.refreshToken);
    await db
      .update(googleOauthConnections)
      .set({ accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt, updatedAt: new Date() })
      .where(eq(googleOauthConnections.businessId, businessId));
    return refreshed.accessToken;
  } catch {
    return null;
  }
}

export async function getGoogleConnection(businessId: string) {
  const db = getDb();
  if (!db) return null;
  const [conn] = await db
    .select()
    .from(googleOauthConnections)
    .where(eq(googleOauthConnections.businessId, businessId))
    .limit(1);
  return conn ?? null;
}

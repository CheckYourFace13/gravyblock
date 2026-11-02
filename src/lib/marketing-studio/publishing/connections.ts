/**
 * Platform connections for Marketing Studio only. Each connection belongs to exactly one product (so exactly one tenant), stores its
 * tokens as AES-256-GCM ciphertext, is limited to the scopes the platform adapter declares as allowed, reports its own health
 * (expiring, expired, revoked) and can be revoked, which overwrites the stored token instead of merely flagging it.
 * No real account is connected by Phase 3; this is the secure model they will use.
 */
import { and, eq, inArray } from "drizzle-orm";
import { audit } from "../audit";
import { revealSecretForPlatformCall, encryptSecret, storeConnection, type ConnectionSummary } from "../credentials";
import type { Platform } from "../config";
import { ms, requireStudioDb, type StudioDb } from "../db";
import { requireProduct } from "../repository";
import { StudioAccessError, type OwnerScope } from "../scope";
import { specFor } from "./platforms";

export type TokenBundle = { accessToken: string; refreshToken?: string };
export type Health = "unknown" | "ok" | "expiring" | "expired" | "error" | "revoked";

const DAY = 86_400_000;

/** Pure health decision from the stored facts. */
export function evaluateHealth(c: { status: string; revokedAt: Date | null; tokenExpiresAt: Date | null; healthStatus: string }, now = new Date()): Health {
  if (c.revokedAt || c.status === "revoked") return "revoked";
  if (c.tokenExpiresAt && c.tokenExpiresAt.getTime() <= now.getTime()) return "expired";
  if (c.status === "error" || c.healthStatus === "error") return "error";
  if (c.tokenExpiresAt && c.tokenExpiresAt.getTime() - now.getTime() < 7 * DAY) return "expiring";
  return c.healthStatus === "ok" ? "ok" : "unknown";
}

/** A connection can be used to publish only when it is neither revoked, expired nor in error. */
export function usable(h: Health): boolean {
  return h === "ok" || h === "expiring" || h === "unknown";
}

export async function connectAccount(
  scope: OwnerScope,
  actor: string,
  productId: string,
  input: { platform: Platform; accountLabel: string; externalAccountId: string; tokens: TokenBundle; scopes: string[]; tokenExpiresAt?: Date | null },
  db: StudioDb = requireStudioDb(),
): Promise<ConnectionSummary> {
  await requireProduct(scope, productId, db);
  const spec = specFor(input.platform);
  if (!spec) throw new Error("Unknown platform");
  const { requiredScopes, allowedScopes } = spec.auth;
  const extra = input.scopes.filter((s) => !allowedScopes.includes(s));
  if (extra.length) throw new Error(`Scopes beyond what ${spec.label} publishing needs were requested: ${extra.join(", ")}`);
  const missing = requiredScopes.filter((s) => !input.scopes.includes(s));
  if (missing.length) throw new Error(`Missing required scopes: ${missing.join(", ")}`);
  if (!input.externalAccountId.trim()) throw new Error("The platform account id is required");
  if (!input.tokens.accessToken || input.tokens.accessToken.length < 8) throw new Error("An access token is required");
  const existing = await db
    .select({ id: ms.msConnections.id })
    .from(ms.msConnections)
    .where(and(eq(ms.msConnections.productId, productId), eq(ms.msConnections.platform, input.platform), eq(ms.msConnections.externalAccountId, input.externalAccountId)));
  if (existing.length) throw new Error("This account is already connected to this product; revoke it first to reconnect");
  const summary = await storeConnection(
    scope,
    actor,
    productId,
    { platform: input.platform, accountLabel: input.accountLabel, secret: JSON.stringify(input.tokens), scopes: input.scopes, externalAccountId: input.externalAccountId, tokenExpiresAt: input.tokenExpiresAt ?? null },
    db,
  );
  await db.update(ms.msConnections).set({ healthStatus: "ok", lastCheckedAt: new Date() }).where(eq(ms.msConnections.id, summary.id));
  return { ...summary, healthStatus: "ok" };
}

/** Recomputes and stores a connection's health; an expired token also moves the connection status to expired. */
export async function refreshConnectionHealth(scope: OwnerScope, productId: string, connectionId: string, db: StudioDb = requireStudioDb(), now = new Date()): Promise<Health> {
  await requireProduct(scope, productId, db);
  const [c] = await db.select().from(ms.msConnections).where(and(eq(ms.msConnections.id, connectionId), eq(ms.msConnections.productId, productId))).limit(1);
  if (!c) throw new StudioAccessError();
  const h = evaluateHealth(c, now);
  await db
    .update(ms.msConnections)
    .set({ healthStatus: h, lastCheckedAt: now, status: h === "expired" ? "expired" : c.status, healthDetail: h === "expired" ? "The token has expired; reconnect the account." : h === "expiring" ? "The token expires within 7 days." : null })
    .where(eq(ms.msConnections.id, connectionId));
  return h;
}

/**
 * Revocation overwrites the stored token with a placeholder, so the secret is gone even from the database, and stops every pending
 * publication that depended on the connection.
 */
export async function revokeAccount(scope: OwnerScope, actor: string, productId: string, connectionId: string, db: StudioDb = requireStudioDb()): Promise<{ cancelled: number }> {
  await requireProduct(scope, productId, db);
  const [c] = await db.select().from(ms.msConnections).where(and(eq(ms.msConnections.id, connectionId), eq(ms.msConnections.productId, productId))).limit(1);
  if (!c) throw new StudioAccessError();
  const wiped = encryptSecret("revoked");
  await db
    .update(ms.msConnections)
    .set({ secretCiphertext: wiped.ciphertext, keyId: wiped.keyId, status: "revoked", revokedAt: new Date(), healthStatus: "revoked", healthDetail: "Revoked by an operator; the stored token was destroyed." })
    .where(eq(ms.msConnections.id, connectionId));
  const pending = await db
    .update(ms.msPublications)
    .set({ status: "revoked", failureReason: "The connection was revoked before this was published.", updatedAt: new Date() })
    .where(and(eq(ms.msPublications.connectionId, connectionId), inArray(ms.msPublications.status, ["draft", "approval_required", "approved", "scheduled"])))
    .returning({ id: ms.msPublications.id });
  await audit(db, { actor, action: "connection.revoke", entity: "connection", entityId: connectionId, productId, detail: { platform: c.platform, cancelledPublications: pending.length } });
  return { cancelled: pending.length };
}

/** The only path that decrypts a connection's tokens, used right before a platform call. Audited by revealSecretForPlatformCall. */
export async function tokensForPublish(scope: OwnerScope, actor: string, productId: string, connectionId: string, db: StudioDb = requireStudioDb()): Promise<TokenBundle> {
  const raw = await revealSecretForPlatformCall(scope, actor, productId, connectionId, db);
  const parsed = JSON.parse(raw) as TokenBundle;
  if (!parsed.accessToken) throw new Error("This connection has no usable token");
  return parsed;
}

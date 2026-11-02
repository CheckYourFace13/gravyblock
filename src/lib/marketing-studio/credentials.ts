/**
 * Credential references. A platform secret is stored only as AES-256-GCM ciphertext (iv | auth tag | ciphertext, base64).
 * The key lives in the environment, never in the database, so a database dump alone yields nothing usable. A key id is
 * stored beside each ciphertext so keys can be rotated. Phase 1 connects nothing; this is the architecture later phases
 * use, and the admin UI never displays or returns a secret.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { audit } from "./audit";
import { PLATFORMS, type Platform } from "./config";
import { ms, requireStudioDb, type StudioDb } from "./db";
import { requireProduct } from "./repository";
import { StudioAccessError, type OwnerScope } from "./scope";

function loadKey(keyId: string): Buffer {
  // MARKETING_SECRET_KEY is the current key; MARKETING_SECRET_KEY_<ID> may hold older keys during rotation.
  const current = process.env.MARKETING_SECRET_KEY_ID?.trim() || "k1";
  const raw = keyId === current ? process.env.MARKETING_SECRET_KEY : process.env[`MARKETING_SECRET_KEY_${keyId.toUpperCase()}`];
  if (!raw) throw new Error(`Marketing Studio credential key "${keyId}" is not configured`);
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new Error("Marketing Studio credential key must be 32 bytes, base64 encoded");
  return key;
}

export function currentKeyId(): string {
  return process.env.MARKETING_SECRET_KEY_ID?.trim() || "k1";
}

export function encryptSecret(plain: string, keyId = currentKeyId()): { ciphertext: string; keyId: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", loadKey(keyId), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([iv, tag, enc]).toString("base64"), keyId };
}

export function decryptSecret(ciphertext: string, keyId: string): string {
  const buf = Buffer.from(ciphertext, "base64");
  if (buf.length < 29) throw new Error("Malformed credential ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", loadKey(keyId), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

export type ConnectionSummary = Omit<typeof ms.msConnections.$inferSelect, "secretCiphertext">;

/** Stores a credential reference. Returns the summary, never the secret or the ciphertext. */
export async function storeConnection(
  scope: OwnerScope,
  actor: string,
  productId: string,
  input: { platform: Platform; accountLabel: string; secret: string; scopes?: string[]; externalAccountId?: string; tokenExpiresAt?: Date | null },
  db: StudioDb = requireStudioDb(),
): Promise<ConnectionSummary> {
  await requireProduct(scope, productId, db);
  if (!PLATFORMS.includes(input.platform)) throw new Error("Unknown platform");
  if (!input.secret || input.secret.length < 8) throw new Error("A credential is required");
  const { ciphertext, keyId } = encryptSecret(input.secret);
  const [row] = await db
    .insert(ms.msConnections)
    .values({
      productId,
      platform: input.platform,
      accountLabel: input.accountLabel.trim().slice(0, 120) || input.platform,
      externalAccountId: input.externalAccountId ?? null,
      scopes: input.scopes ?? [],
      secretCiphertext: ciphertext,
      keyId,
      authorizedBy: actor,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
    })
    .returning();
  await audit(db, { actor, action: "connection.store", entity: "connection", entityId: row.id, productId, detail: { platform: input.platform } });
  const { secretCiphertext: _omit, ...summary } = row;
  void _omit;
  return summary;
}

export async function listConnections(scope: OwnerScope, productId: string, db: StudioDb = requireStudioDb()): Promise<ConnectionSummary[]> {
  await requireProduct(scope, productId, db);
  const rows = await db.select().from(ms.msConnections).where(eq(ms.msConnections.productId, productId));
  return rows.map(({ secretCiphertext: _omit, ...rest }) => {
    void _omit;
    return rest;
  });
}

/**
 * The only place a stored secret is decrypted, for the publish adapter immediately before a platform call. Not used in
 * Phase 1. Scope-checked like everything else, and every use is audited.
 */
export async function revealSecretForPlatformCall(scope: OwnerScope, actor: string, productId: string, connectionId: string, db: StudioDb = requireStudioDb()): Promise<string> {
  await requireProduct(scope, productId, db);
  const [row] = await db.select().from(ms.msConnections).where(and(eq(ms.msConnections.id, connectionId), eq(ms.msConnections.productId, productId))).limit(1);
  if (!row) throw new StudioAccessError();
  await audit(db, { actor, action: "connection.use", entity: "connection", entityId: connectionId, productId, detail: { platform: row.platform } });
  return decryptSecret(row.secretCiphertext, row.keyId);
}

export async function revokeConnection(scope: OwnerScope, actor: string, productId: string, connectionId: string, db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  const res = await db.delete(ms.msConnections).where(and(eq(ms.msConnections.id, connectionId), eq(ms.msConnections.productId, productId))).returning({ id: ms.msConnections.id });
  if (!res.length) throw new StudioAccessError();
  await audit(db, { actor, action: "connection.revoke", entity: "connection", entityId: connectionId, productId });
}

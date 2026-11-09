/**
 * Review tokens for the owner's email links. A token is signed (HMAC with the shared Studio secret), expires, and names exactly ONE publication and ONE
 * decision (approve or changes), so an approve link can never be turned into anything else and a link for one video can never touch another.
 * A token on its own never changes anything: opening it (a GET) only starts a short-lived transaction; the decision is a protected POST that must
 * present that transaction, and a transaction can be used once.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import type { StudioDb } from "../db";
import { ms } from "../db";

export type ReviewDecision = "approve" | "changes" | "pause";
export type ReviewClaims = { p: string; a: ReviewDecision; e: number; j: string };
export type TokenCheck = { ok: true; claims: ReviewClaims } | { ok: false; reason: "invalid" | "expired" };

export const TOKEN_TTL_MS = 14 * 24 * 3_600_000;
export const TXN_TTL_MS = 15 * 60_000;

const mac = (key: string, payload: string) => createHmac("sha256", key).update(`video-review-token.${payload}`).digest("base64url");

export function signReviewToken(publicationId: string, decision: ReviewDecision, key: string, now = Date.now(), ttlMs = TOKEN_TTL_MS): string {
  const claims: ReviewClaims = { p: publicationId, a: decision, e: now + ttlMs, j: randomBytes(9).toString("base64url") };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${mac(key, payload)}`;
}

export function verifyReviewToken(token: string, key: string | undefined, now = Date.now()): TokenCheck {
  if (!key || typeof token !== "string" || token.length > 600) return { ok: false, reason: "invalid" };
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return { ok: false, reason: "invalid" };
  const want = Buffer.from(mac(key, payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: "invalid" };
  try {
    const c = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ReviewClaims;
    if (typeof c.p !== "string" || typeof c.j !== "string" || (c.a !== "approve" && c.a !== "changes" && c.a !== "pause") || typeof c.e !== "number") return { ok: false, reason: "invalid" };
    if (c.e < now) return { ok: false, reason: "expired" };
    return { ok: true, claims: c };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

// ---- transactions: opened by the GET, consumed once by the POST -------------------------------------------------------------------

const txnKey = (id: string) => `video_review_txn_${id}`;
type Txn = { p: string; a: ReviewDecision; j: string; createdAt: number; usedAt: number | null };

export async function openTransaction(db: StudioDb, claims: ReviewClaims, now = Date.now()): Promise<string> {
  const id = randomBytes(18).toString("base64url");
  const value: Txn = { p: claims.p, a: claims.a, j: claims.j, createdAt: now, usedAt: null };
  await db.insert(ms.msSettings).values({ key: txnKey(id), value: value as never, updatedBy: "review-link", updatedAt: new Date(now) });
  return id;
}

/** Atomically marks the transaction used. True exactly once, and only for the publication and decision it was opened for, within its lifetime. */
export async function consumeTransaction(db: StudioDb, txn: string, claims: ReviewClaims, now = Date.now()): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(txn)) return false;
  const rows = await db.execute(sql`
    update ms_settings set value = jsonb_set(value, '{usedAt}', to_jsonb(${now}::bigint)), updated_at = now()
    where key = ${txnKey(txn)}
      and value->>'usedAt' is null
      and value->>'p' = ${claims.p}
      and value->>'a' = ${claims.a}
      and value->>'j' = ${claims.j}
      and (value->>'createdAt')::bigint > ${now - TXN_TTL_MS}::bigint
    returning key`);
  return (rows as unknown as unknown[]).length > 0;
}

/**
 * Who Marketing Studio asks to approve videos, per product. Private and server-side: the address is never rendered into a public page, an API response for
 * visitors, a client bundle or a YouTube description.
 *   - The owner's own portfolio (owner_kind internal or house) uses the deployment default (chris@iscreamstudio.com) until someone sets another address.
 *   - A customer product has NO default: until a verified address exists nothing is sent and the product shows NEEDS_OWNER_ACTION.
 *   - A new address is only used after its owner opens the link sent to THAT address and confirms. Until then the previous verified address keeps working.
 *   - Changing the address never touches existing publication or review records: they hold no address, and future emails simply use the new one.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { audit } from "../audit";
import { ms, type StudioDb } from "../db";
import { getSetting, setSetting } from "../runtime";
import { ownerReviewEmail } from "./video-review";

export const reviewEmailKey = (productId: string) => `review_email_${productId}`;
const TOKEN_TTL_MS = 24 * 3_600_000;

export type ReviewContact = {
  /** the verified address emails go to */
  email?: string;
  verifiedAt?: string;
  /** an address waiting for its owner to confirm it; only the hash of the secret is stored */
  pending?: { email: string; tokenHash: string; expiresAt: string; requestedAt: string };
  history?: Array<{ at: string; event: "verified" | "requested" | "expired"; by?: string }>;
};

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
export const normalizeEmail = (s: string) => s.trim().toLowerCase();
export const isPlausibleEmail = (s: string) => s.length <= 254 && EMAIL.test(normalizeEmail(s));
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export const getContact = (db: StudioDb, productId: string) => getSetting<ReviewContact>(reviewEmailKey(productId), {}, db);

/** The address to email for this product, or null when nobody may be emailed yet. */
export async function reviewRecipient(db: StudioDb, productId: string): Promise<string | null> {
  const c = await getContact(db, productId);
  if (c.email && c.verifiedAt) return c.email;
  const [p] = await db.select({ kind: ms.msProducts.ownerKind }).from(ms.msProducts).where(eq(ms.msProducts.id, productId)).limit(1);
  return p && p.kind !== "customer" ? ownerReviewEmail() : null;
}

/** Starts a change: stores a hashed one-time secret and returns the plain token to put in the verification email sent to the NEW address. */
export async function requestEmailChange(db: StudioDb, actor: string, productId: string, email: string, now = Date.now()): Promise<{ token: string; email: string }> {
  if (!isPlausibleEmail(email)) throw new Error("That does not look like an email address");
  const clean = normalizeEmail(email);
  const cur = await getContact(db, productId);
  const secret = randomBytes(24).toString("base64url");
  const next: ReviewContact = { ...cur, pending: { email: clean, tokenHash: hash(secret), expiresAt: new Date(now + TOKEN_TTL_MS).toISOString(), requestedAt: new Date(now).toISOString() }, history: [...(cur.history ?? []), { at: new Date(now).toISOString(), event: "requested" as const, by: actor }].slice(-20) };
  await setSetting(reviewEmailKey(productId), next, actor, db, { audited: false });
  await audit(db, { actor, action: "review_email.change_requested", entity: "product", entityId: productId, productId, detail: {} });
  return { token: `${productId}.${secret}`, email: clean };
}

export type ConfirmResult = { ok: true; productId: string; email: string } | { ok: false; reason: "invalid" | "expired" };

/** Consumes the secret from the verification link. A used or replaced secret never works twice. */
export async function confirmEmailChange(db: StudioDb, token: string, now = Date.now()): Promise<ConfirmResult> {
  const [productId, secret] = token.split(".");
  if (!productId || !secret) return { ok: false, reason: "invalid" };
  const cur = await getContact(db, productId);
  const p = cur.pending;
  if (!p) return { ok: false, reason: "invalid" };
  const a = Buffer.from(hash(secret));
  const b = Buffer.from(p.tokenHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };
  if (Date.parse(p.expiresAt) < now) return { ok: false, reason: "expired" };
  const at = new Date(now).toISOString();
  const { pending: _p, ...rest } = cur;
  void _p;
  await setSetting(reviewEmailKey(productId), { ...rest, email: p.email, verifiedAt: at, history: [...(cur.history ?? []), { at, event: "verified" as const }].slice(-20) }, "email-owner", db, { audited: false });
  await audit(db, { actor: "email-owner", action: "review_email.verified", entity: "product", entityId: productId, productId, detail: {} });
  return { ok: true, productId, email: p.email };
}

/** What a customer dashboard may show: a masked address and the state, never the pending secret. */
export function maskEmail(e: string): string {
  const [u, d] = e.split("@");
  return `${u.slice(0, 1)}${"*".repeat(Math.max(1, Math.min(6, u.length - 1)))}@${d}`;
}
export async function contactSummary(db: StudioDb, productId: string): Promise<{ current: string | null; pending: string | null }> {
  const c = await getContact(db, productId);
  const cur = await reviewRecipient(db, productId);
  return { current: cur ? maskEmail(cur) : null, pending: c.pending && Date.parse(c.pending.expiresAt) > Date.now() ? maskEmail(c.pending.email) : null };
}

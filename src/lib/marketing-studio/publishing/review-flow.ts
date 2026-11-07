/**
 * The owner's one-click review flow, independent of the GravyBlock dashboard (so a future customer can approve from an email alone).
 *   GET  (opening the link)  -> never changes anything. It validates the token, records that the link was opened, and opens a short-lived transaction.
 *   POST (made by the page)  -> the protected action. It needs the token AND the transaction, uses the transaction once, and is idempotent:
 *                               approving an already public video just shows the result again.
 * An email scanner that only fetches the link (GET) therefore cannot publish anything.
 */
import { and, eq } from "drizzle-orm";
import { ms, type StudioDb } from "../db";
import { currentMetrics } from "../measurement/collect";
import { INTERNAL_SCOPE, type OwnerScope } from "../scope";
import type { Deps } from "./adapters";
import { consumeTransaction, openTransaction, verifyReviewToken, type ReviewClaims } from "./review-token";
import { queueReplacement } from "./review-replacement";
import { approveReview, getReview, requestChanges, trackEvent, thumbUrlFor, watchUrlFor, type ReviewState } from "./video-review";

export type SuccessView = {
  productName: string;
  title: string;
  watchUrl: string;
  thumbUrl: string;
  destination: string;
  visibility: "Public";
  videoId: string;
  sameVideoRetained: true;
  measurement: string;
};

export type Opened =
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "approve_ready"; state: ReviewState; txn: string }
  | { kind: "approved"; state: ReviewState; view: SuccessView }
  | { kind: "changes_form"; state: ReviewState; txn: string }
  | { kind: "changes_received"; state: ReviewState }
  | { kind: "stale"; state: ReviewState };

export async function successView(db: StudioDb, state: ReviewState): Promise<SuccessView> {
  const m = await currentMetrics(db, state.publicationId).catch(() => ({ snapshots: 0 }));
  return {
    productName: state.productName,
    title: state.title,
    watchUrl: watchUrlFor(state.videoId),
    thumbUrl: thumbUrlFor(state.videoId),
    destination: state.ctaUrl.split("?")[0],
    visibility: "Public",
    videoId: state.videoId,
    sameVideoRetained: true,
    measurement: m.snapshots > 0 ? `Measurement is running: ${m.snapshots} snapshot${m.snapshots === 1 ? "" : "s"} stored, and views and clicks keep being collected automatically.` : "Measurement starts with the next automatic collection.",
  };
}

/** The GET side. Safe to call from a scanner: it only reads, records that the link was opened, and opens a transaction. */
export async function openReview(db: StudioDb, token: string, key: string | undefined, now = Date.now()): Promise<Opened> {
  const t = verifyReviewToken(token, key, now);
  if (!t.ok) return { kind: t.reason };
  const state = await getReview(db, t.claims.p);
  if (!state) return { kind: "invalid" };
  const last = state.events?.[state.events.length - 1];
  if (!(last?.event === "VIEWED" && now - Date.parse(last.at) < 10 * 60_000)) await trackEvent(db, "review-link", state.publicationId, "VIEWED", `${t.claims.a} link opened`);
  if (t.claims.a === "approve") {
    if (state.status === "approved_public") return { kind: "approved", state, view: await successView(db, state) };
    if (state.status !== "unlisted_live" && state.status !== "approved_pending_public") return { kind: "stale", state };
    return { kind: "approve_ready", state, txn: await openTransaction(db, t.claims, now) };
  }
  if (state.status === "changes_requested") return { kind: "changes_received", state };
  if (state.status !== "unlisted_live") return { kind: "stale", state };
  return { kind: "changes_form", state, txn: await openTransaction(db, t.claims, now) };
}

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; status: number; message: string };

/** The POST side of approval: one protected action that makes the SAME video public. */
export async function submitApproval(db: StudioDb, deps: Deps, input: { token: string; txn: string }, key: string | undefined, now = Date.now(), scope: OwnerScope = INTERNAL_SCOPE): Promise<ActionResult<{ view: SuccessView }>> {
  const t = verifyReviewToken(input.token, key, now);
  if (!t.ok) return { ok: false, status: t.reason === "expired" ? 410 : 400, message: t.reason === "expired" ? "This review link has expired." : "This review link is not valid." };
  const claims: ReviewClaims = t.claims;
  if (claims.a !== "approve") return { ok: false, status: 400, message: "This link is not an approval link." };
  const state = await getReview(db, claims.p);
  if (!state) return { ok: false, status: 404, message: "That video was not found." };
  // Idempotent: a repeated click on an already public video shows the result and changes nothing.
  if (state.status === "approved_public") return { ok: true, view: await successView(db, state) };
  if (!(await consumeTransaction(db, input.txn, claims, now))) return { ok: false, status: 409, message: "This approval was not started from the review page, or it was already used. Open the link from your email again." };
  try {
    const done = await approveReview(scope, "owner-email-link", claims.p, deps, db);
    return { ok: true, view: await successView(db, done) };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Approval failed";
    await trackEvent(db, "owner-email-link", claims.p, "FAILED", message);
    return { ok: false, status: 500, message };
  }
}

/** The POST side of "request changes": stores the exact note, keeps the video unlisted and queues the replacement. */
export async function submitChanges(db: StudioDb, input: { token: string; txn: string; note: string }, key: string | undefined, now = Date.now()): Promise<ActionResult<{ state: ReviewState }>> {
  const t = verifyReviewToken(input.token, key, now);
  if (!t.ok) return { ok: false, status: t.reason === "expired" ? 410 : 400, message: t.reason === "expired" ? "This review link has expired." : "This review link is not valid." };
  if (t.claims.a !== "changes") return { ok: false, status: 400, message: "This link is not a request-changes link." };
  const note = input.note.trim();
  if (!note) return { ok: false, status: 400, message: "Say what should change, so the replacement can be made." };
  const state = await getReview(db, t.claims.p);
  if (!state) return { ok: false, status: 404, message: "That video was not found." };
  if (state.status === "changes_requested") return { ok: true, state };
  if (!(await consumeTransaction(db, input.txn, t.claims, now))) return { ok: false, status: 409, message: "This request was not started from the review page, or it was already used. Open the link from your email again." };
  try {
    const next = await requestChanges("owner-email-link", t.claims.p, note, db);
    await queueReplacement(db, "owner-email-link", next);
    return { ok: true, state: next };
  } catch (e) {
    return { ok: false, status: 500, message: e instanceof Error ? e.message : "Could not record the request" };
  }
}

/** True when this publication's YouTube video is the one a review link points to. Used by the thumbnail route so it is never an open proxy. */
export async function isReviewedVideo(db: StudioDb, videoId: string): Promise<boolean> {
  const rows = await db.select({ id: ms.msPublications.id }).from(ms.msPublications).where(and(eq(ms.msPublications.externalPostId, videoId), eq(ms.msPublications.platform, "youtube"))).limit(1);
  return rows.length > 0;
}

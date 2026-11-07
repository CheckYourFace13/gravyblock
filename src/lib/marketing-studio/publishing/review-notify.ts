/**
 * Owner review email. The marketing worker's environment deliberately holds no mail credentials, so the CLI asks the GravyBlock app (which already
 * sends the private daily owner report through Resend) to send it. The request is signed with the shared Studio secret and carries ONLY a publication
 * id: the app builds the message itself from stored review state and sends it to the fixed owner address, so a forged or replayed call can neither
 * choose a recipient nor change the content.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { StudioDb } from "../db";
import { buildReviewEmail, getReview, markEmailed, OWNER_REVIEW_EMAIL, siteBase } from "./video-review";

const WINDOW_MS = 5 * 60_000;
const sign = (key: string, publicationId: string, ts: string) => createHmac("sha256", key).update(`review-notify.${ts}.${publicationId}`).digest("hex");

export function signedNotifyHeaders(publicationId: string, key: string, now = Date.now()): Record<string, string> {
  const ts = String(now);
  return { "x-studio-ts": ts, "x-studio-sig": sign(key, publicationId, ts), "content-type": "application/json" };
}

export function verifyNotifySignature(publicationId: string, ts: string | null, sig: string | null, key: string | undefined, now = Date.now()): boolean {
  if (!key || !ts || !sig || !/^\d{10,15}$/.test(ts) || Math.abs(now - Number(ts)) > WINDOW_MS) return false;
  const want = Buffer.from(sign(key, publicationId, ts));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Runs inside the GravyBlock app. Sends one review email to the owner through Resend. */
export async function sendReviewEmail(db: StudioDb, publicationId: string, fetchFn: typeof fetch = fetch): Promise<{ sent: boolean; reason?: string }> {
  const r = await getReview(db, publicationId);
  if (!r) return { sent: false, reason: "no review for that publication" };
  if (r.status !== "unlisted_live") return { sent: false, reason: `the video is ${r.status}, not waiting for review` };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "mail is not configured on the app" };
  const mail = buildReviewEmail(r);
  const from = process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>";
  const res = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [OWNER_REVIEW_EMAIL], subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!res.ok) return { sent: false, reason: `the mail service answered ${res.status}` };
  await markEmailed(db, "review-notify", publicationId);
  return { sent: true };
}

/** Runs in the CLI: asks the app to send the review email. */
export async function requestOwnerEmail(publicationId: string, fetchFn: typeof fetch = fetch): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.MARKETING_SECRET_KEY;
  if (!key) return { sent: false, reason: "no Studio secret in this environment" };
  const res = await fetchFn(`${siteBase()}/api/admin/marketing-studio/video-review/notify`, { method: "POST", headers: signedNotifyHeaders(publicationId, key), body: JSON.stringify({ publicationId }) });
  const body = (await res.json().catch(() => ({}))) as { sent?: boolean; reason?: string };
  return { sent: Boolean(body.sent), reason: body.sent ? undefined : (body.reason ?? `HTTP ${res.status}`) };
}

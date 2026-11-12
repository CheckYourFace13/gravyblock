/**
 * Owner review email. The marketing worker's environment deliberately holds no mail credentials, so the CLI asks the GravyBlock app (which already
 * sends the private daily owner report through Resend) to send it. The request is signed with the shared Studio secret and carries ONLY a publication
 * id: the app builds the message itself from stored review state and sends it to the fixed owner address, so a forged or replayed call can neither
 * choose a recipient nor change the content.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { StudioDb } from "../db";
import { getSetting } from "../runtime";
import { jobKey, patchJob, type ReplacementJob } from "./review-replacement";
import { signReviewToken } from "./review-token";
import { requestEmailChange, reviewRecipient } from "./review-contact";
import { buildReviewEmail, getReview, trackEvent, listReviews, type ReviewState, markEmailed, ownerReviewEmail, reviewLinkUrl, siteBase } from "./video-review";

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
  const to = await reviewRecipient(db, r.productId);
  if (!to) return { sent: false, reason: "no verified review email for this product yet" };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "mail is not configured on the app" };
  const key = process.env.MARKETING_SECRET_KEY;
  if (!key) return { sent: false, reason: "no Studio secret on the app" };
  const mail = buildReviewEmail(r, { approve: reviewLinkUrl(signReviewToken(publicationId, "approve", key)), changes: reviewLinkUrl(signReviewToken(publicationId, "changes", key)), pause: reviewLinkUrl(signReviewToken(publicationId, "pause", key)) });
  const from = process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>";
  const res = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!res.ok) return { sent: false, reason: `the mail service answered ${res.status}` };
  await markEmailed(db, "review-notify", publicationId);
  return { sent: true };
}

/** Pure id used for the test email's links: they are validly signed but belong to no publication, so clicking them can never approve or change a real video. */
export const TEST_PUBLICATION_ID = "00000000-0000-0000-0000-000000000000";

/** Runs inside the app: sends ONE clearly labelled test of the review email (same layout, inert buttons) and reports what Resend said. Publishes nothing. */
export async function sendTestReviewEmail(db: StudioDb, fetchFn: typeof fetch = fetch): Promise<{ sent: boolean; reason?: string; resendId?: string; recipientIsOwner?: boolean; lastEvent?: string | null; hasApprove?: boolean; hasChanges?: boolean; layout?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const key = process.env.MARKETING_SECRET_KEY;
  if (!apiKey) return { sent: false, reason: "mail is not configured on the app" };
  if (!key) return { sent: false, reason: "no Studio secret on the app" };
  const sample = (await listReviews(db)).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
  const base: ReviewState = sample ?? { status: "unlisted_live", publicationId: TEST_PUBLICATION_ID, productId: "test", productName: "Sample product", videoRowId: "test", videoId: "" } as unknown as ReviewState;
  const r: ReviewState = { ...base, publicationId: TEST_PUBLICATION_ID, productName: "TEST", title: "This is only a test of the review email", description: "Test message. Nothing was uploaded or published, and the buttons below do nothing.", library: { position: 1, of: 3, roleLabel: "test" } };
  const mail = buildReviewEmail(r, { approve: reviewLinkUrl(signReviewToken(TEST_PUBLICATION_ID, "approve", key)), changes: reviewLinkUrl(signReviewToken(TEST_PUBLICATION_ID, "changes", key)), pause: reviewLinkUrl(signReviewToken(TEST_PUBLICATION_ID, "pause", key)) });
  const to = ownerReviewEmail();
  const from = process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>";
  const res = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: "TEST — GravyBlock Marketing Studio Video Review Email", html: mail.html, text: mail.text }),
  });
  const out = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) return { sent: false, reason: `the mail service answered ${res.status}: ${out.message ?? ""}`.trim() };
  await new Promise((ok) => setTimeout(ok, 4000));
  const look = await fetchFn(`https://api.resend.com/emails/${out.id}`, { headers: { Authorization: `Bearer ${apiKey}` } }).then((x) => x.json()).catch(() => ({})) as { last_event?: string; to?: string[] };
  return {
    sent: true,
    resendId: out.id,
    recipientIsOwner: Array.isArray(look.to) ? look.to.length === 1 && look.to[0].toLowerCase() === to.toLowerCase() : undefined,
    lastEvent: look.last_event ?? null,
    hasApprove: mail.html.includes("/video-review/") && mail.html.includes("APPROVE & MAKE PUBLIC") || mail.html.includes("APPROVE &amp; MAKE PUBLIC"),
    hasChanges: mail.html.includes("REQUEST CHANGES"),
    layout: "thumbnail, plain link, two buttons, then details",
  };
}

/** Runs inside the app: tells the owner a change request is blocked or has run out of retries. Says what was asked, why it stopped, and that nothing was published. */
export async function sendNoticeEmail(db: StudioDb, publicationId: string, fetchFn: typeof fetch = fetch): Promise<{ sent: boolean; reason?: string }> {
  const [r, job] = [await getReview(db, publicationId), await getSetting<{ status?: string; detail?: string; note?: string; options?: string[] } | null>(jobKey(publicationId), null, db)];
  if (!r || !job || job.status !== "needs_attention") return { sent: false, reason: "no change request needs attention" };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "mail is not configured on the app" };
  const to = await reviewRecipient(db, r.productId);
  if (!to) return { sent: false, reason: "no verified review email for this product yet" };
  const subject = `Needs attention: ${r.productName} change request`;
  const options = job.options ?? [];
  const body = [
    `We could not finish your change request for the ${r.productName} video without one decision from you.`,
    "",
    `What you asked: ${job.note ?? ""}`,
    `The one open question: ${job.detail ?? "unknown"}`,
    ...(options.length ? ["", 'Simple options (answer with Request Changes in your latest review email, for example "option 1"):', ...options.map((o, i) => `  ${i + 1}. ${o}`)] : []),
    "",
    "The video you reviewed is still unlisted and nothing was published.",
    "",
    `Watch (unlisted): ${r.watchUrl}`,
  ].join("\n");
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const res = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>", to: [to], subject, text: body, html: `<div style="font-family:Arial,sans-serif;max-width:600px;white-space:pre-wrap">${esc(body)}</div>` }),
  });
  return res.ok ? { sent: true } : { sent: false, reason: `the mail service answered ${res.status}` };
}

/** Runs inside the app, right after Request Changes is submitted: one short email saying the request arrived and what happens next. Sent once per request. */
export async function sendChangesReceivedEmail(db: StudioDb, publicationId: string, fetchFn: typeof fetch = fetch): Promise<{ sent: boolean; reason?: string }> {
  const [r, job] = [await getReview(db, publicationId), await getSetting<ReplacementJob | null>(jobKey(publicationId), null, db)];
  if (!r || !job) return { sent: false, reason: "no change request" };
  if (job.ackedAt) return { sent: false, reason: "already sent" };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "mail is not configured on the app" };
  const to = await reviewRecipient(db, r.productId);
  if (!to) return { sent: false, reason: "no verified review email for this product yet" };
  const body = ["Changes received. GravyBlock is creating your updated video.", "", `What you asked: ${job.note}`, "", "There is nothing you need to do. We will email you again when your updated video is ready for review.", "The video you reviewed stays unlisted, and nothing is published until you approve."].join(String.fromCharCode(10));
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const res = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>", to: [to], subject: `Changes received: ${r.productName}`, text: body, html: `<div style="font-family:Arial,sans-serif;max-width:600px;white-space:pre-wrap">${esc(body)}</div>` }),
  });
  if (!res.ok) return { sent: false, reason: `the mail service answered ${res.status}` };
  await patchJob(db, job, { ackedAt: new Date().toISOString() });
  await trackEvent(db, "review-notify", publicationId, "CHANGES_RECEIVED", "acknowledgement sent").catch(() => undefined);
  return { sent: true };
}

/** Runs in the CLI or the worker: asks the app to tell the owner a change request needs attention. */
export async function requestOwnerNotice(publicationId: string, fetchFn: typeof fetch = fetch): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.MARKETING_SECRET_KEY;
  if (!key) return { sent: false, reason: "no Studio secret in this environment" };
  const res = await fetchFn(`${siteBase()}/api/admin/marketing-studio/video-review/notify`, { method: "POST", headers: signedNotifyHeaders(publicationId, key), body: JSON.stringify({ publicationId, notice: true }) });
  const body = (await res.json().catch(() => ({}))) as { sent?: boolean; reason?: string };
  return { sent: Boolean(body.sent), reason: body.sent ? undefined : (body.reason ?? `HTTP ${res.status}`) };
}

/** Runs in the CLI: asks the app to send the review email. */
export async function requestOwnerEmail(publicationId: string, fetchFn: typeof fetch = fetch): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.MARKETING_SECRET_KEY;
  if (!key) return { sent: false, reason: "no Studio secret in this environment" };
  const res = await fetchFn(`${siteBase()}/api/admin/marketing-studio/video-review/notify`, { method: "POST", headers: signedNotifyHeaders(publicationId, key), body: JSON.stringify({ publicationId }) });
  const body = (await res.json().catch(() => ({}))) as { sent?: boolean; reason?: string };
  return { sent: Boolean(body.sent), reason: body.sent ? undefined : (body.reason ?? `HTTP ${res.status}`) };
}

/** Runs in the CLI: asks the app to send the one labelled test review email. */
export async function requestTestEmail(fetchFn: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const key = process.env.MARKETING_SECRET_KEY;
  if (!key) return { sent: false, reason: "no Studio secret in this environment" };
  const res = await fetchFn(`${siteBase()}/api/admin/marketing-studio/video-review/notify`, { method: "POST", headers: signedNotifyHeaders(TEST_PUBLICATION_ID, key), body: JSON.stringify({ publicationId: TEST_PUBLICATION_ID, test: true }) });
  return { status: res.status, ...((await res.json().catch(() => ({}))) as Record<string, unknown>) };
}

/** Runs inside the app: asks the NEW address to confirm it. The address only becomes the review recipient after its owner opens the link and confirms. */
export async function sendVerificationEmail(db: StudioDb, actor: string, productId: string, email: string, productName: string, fetchFn: typeof fetch = fetch): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "mail is not configured on the app" };
  const { token, email: to } = await requestEmailChange(db, actor, productId, email);
  const link = `${siteBase()}/video-review/verify/${encodeURIComponent(token)}`;
  const text = `Confirm this address for ${productName} video reviews in GravyBlock Marketing Studio.\n\nOpen this link and press the confirm button (it expires in 24 hours):\n${link}\n\nIf you did not ask for this, ignore this message: nothing changes until the button is pressed.`;
  const res = await fetchFn("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>", to: [to], subject: "Confirm your GravyBlock video review email", text }),
  });
  return res.ok ? { sent: true } : { sent: false, reason: `the mail service answered ${res.status}` };
}

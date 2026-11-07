/**
 * Default review flow for website and app marketing videos (owner directive 2026-11-07):
 *   QA -> upload to YouTube as UNLISTED -> verify the live video -> email the owner a review link -> owner approves or requests changes
 *   -> an approved video is switched from unlisted to PUBLIC on the SAME YouTube video (same id, same URL, never re-uploaded) -> measurement continues.
 * Nothing becomes public without the owner's approval. Unlisted (not private) is the review state: it can be watched, shared and embedded, and stays
 * out of channel pages, search and recommendations. Review state lives in ms_settings (`video_review_<publicationId>`); website embed details in
 * `video_embed_<productId>`. Studio only RECOMMENDS where a video belongs on a House site; it never writes to any site.
 */
import { and, eq, like } from "drizzle-orm";
import { audit } from "../audit";
import { ms, type StudioDb } from "../db";
import { getSetting, setSetting } from "../runtime";
import type { OwnerScope } from "../scope";
import type { DemoRecord } from "../video/demo/types";
import { collectForPublication } from "../measurement/collect";
import type { Deps } from "./adapters";
import { evaluateHealth, usable } from "./connections";
import { youtubeTokensForCall } from "./oauth-youtube";
import { setYoutubeVisibility, verifyYoutubeVideo, YT_SCOPE_MANAGE } from "./youtube-api";
import { connectionAllowedFor } from "./youtube-share";

/** Where review mail goes. Fixed on purpose: Studio can notify the owner and nobody else. */
export const OWNER_REVIEW_EMAIL = "chris@gravyblock.com";
export const reviewKey = (publicationId: string) => `video_review_${publicationId}`;
export const embedKey = (productId: string) => `video_embed_${productId}`;
export const REVIEW_PREFIX = "video_review_";

export type ReviewStatus = "unlisted_live" | "changes_requested" | "approved_pending_public" | "approved_public" | "superseded";
export type ReviewState = {
  status: ReviewStatus;
  publicationId: string;
  productId: string;
  productName: string;
  videoRowId: string;
  videoId: string;
  watchUrl: string;
  title: string;
  description: string;
  durationSec: number | null;
  ctaText: string;
  ctaUrl: string;
  intendedUse: string;
  uploadedAt: string;
  emailedAt?: string;
  approvedAt?: string;
  publicAt?: string;
  approvalNote?: string;
  changesNote?: string;
  changesRequestedAt?: string;
  supersededBy?: string;
};

export type EmbedEntry = { publicationId: string; videoId: string; watchUrl: string; embedUrl: string; iframe: string; visibility: "unlisted" | "public"; recommendedPlacement: string; note: string };

export const watchUrlFor = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

/** Privacy-enhanced embed (youtube-nocookie.com): YouTube sets no tracking cookies until the visitor plays the video. */
export function embedFor(videoId: string, title: string): { embedUrl: string; iframe: string } {
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;
  const safe = title.replace(/[<>"&]/g, "");
  return { embedUrl, iframe: `<iframe src="${embedUrl}" title="${safe}" width="360" height="640" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe>` };
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+?\d[\s().-]?){9,}\d/;
const host = (u: string | null | undefined) => {
  try {
    return u ? new URL(u).host.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};

export type Check = { name: string; ok: boolean; detail: string };

/** Pre-upload checks for the unlisted review upload. Pure. Generic: the link must go to the product's own site (or a verified store listing). */
export function reviewUploadChecks(i: {
  productId: string;
  productHost: string | null;
  publication: { productId: string; title: string | null; caption: string; ctaUrl: string | null; status: string; assetId: string };
  video: { assetId: string | null; status: string; qaPassed: boolean; stale: boolean; record: DemoRecord };
  facts: Array<{ id: string; verified: boolean }>;
  connectionAllowed: boolean;
  privacy: string | null;
  kids: boolean | null;
  otherYoutubePublications: number;
}): Check[] {
  const { publication: p, video: v } = i;
  const text = `${p.title ?? ""} ${p.caption} ${v.record.transcript.map((l) => l.text).join(" ")} ${v.record.onScreen.map((o) => o.text).join(" ")}`;
  const factIds = [...new Set(v.record.claims.flatMap((c) => c.factIds))];
  return [
    { name: "the video passed QA and is the current file", ok: v.qaPassed && !v.stale && p.assetId === v.assetId, detail: `status ${v.status}${v.stale ? ", STALE" : ""}` },
    { name: "Product Truth: every claim is backed by verified facts and page quotes", ok: v.record.claims.every((c) => c.factsVerified && c.sources.every((s) => s.onPage)) && factIds.length > 0 && factIds.every((id) => i.facts.some((f) => f.id === id && f.verified)), detail: `${v.record.claims.length} claims` },
    { name: "the call to action is product-focused and the link goes to the product's own site", ok: Boolean(i.productHost) && host(p.ctaUrl) === i.productHost && Boolean(v.record.cta.text), detail: `${v.record.cta.text} -> ${host(p.ctaUrl) ?? "none"}` },
    { name: "the post belongs to this product and a connection it may use", ok: p.productId === i.productId && i.connectionAllowed, detail: "" },
    { name: "made-for-kids declared by the owner", ok: typeof i.kids === "boolean", detail: i.kids === null ? "not set" : String(i.kids) },
    { name: "review visibility is UNLISTED (never private, never public before approval)", ok: i.privacy === "unlisted", detail: i.privacy ?? "not set" },
    { name: "no email address in the title, description or video text", ok: !EMAIL.test(text), detail: "" },
    { name: "no phone number in the description", ok: !PHONE.test(p.caption.replace(/utm_[a-z_]+=[a-z0-9_]+/gi, "")), detail: "" },
    { name: "no personal name in the title, description or video text", ok: !/\bchris\b/i.test(text), detail: "" },
    { name: "title is 100 characters or fewer", ok: (p.title ?? "").length > 0 && (p.title ?? "").length <= 100, detail: `${(p.title ?? "").length}` },
    { name: "not already sent: still approval required (or approved, not published)", ok: ["approval_required", "approved"].includes(p.status), detail: p.status },
    { name: "no other YouTube publication exists for this video", ok: i.otherYoutubePublications === 0, detail: `${i.otherYoutubePublications} others` },
  ];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com").replace(/\/$/, "");
export const reviewPageUrl = (publicationId: string) => `${siteBase()}/admin/marketing-studio/video-review/${publicationId}`;

/** The owner email: everything needed to decide without opening Marketing Studio, plus the approve and request-changes actions. */
export function buildReviewEmail(r: ReviewState): { subject: string; html: string; text: string } {
  const page = reviewPageUrl(r.publicationId);
  const approve = `${page}?action=approve`;
  const changes = `${page}?action=changes`;
  const dur = r.durationSec ? `${r.durationSec.toFixed(1)} seconds` : "unknown";
  const subject = `Video ready for review: ${r.productName}, ${r.title}`.slice(0, 150);
  const rows: Array<[string, string]> = [
    ["Product", r.productName],
    ["Video title (as proposed for public)", r.title],
    ["Duration", dur],
    ["CTA destination", `${r.ctaText} -> ${r.ctaUrl}`],
    ["Intended use", r.intendedUse],
  ];
  const text = [
    `A ${r.productName} video is live on YouTube as UNLISTED and verified. Nothing is public yet.`,
    "",
    `Watch it: ${r.watchUrl}`,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    "Proposed public title:",
    r.title,
    "",
    "Proposed public description:",
    r.description,
    "",
    `Approve and make public (same video, same link): ${approve}`,
    `Request changes: ${changes}`,
    "",
    "Unlisted means anyone with the link can watch; it stays out of channel pages, search and recommendations until you approve.",
  ].join("\n");
  const btn = (href: string, label: string, bg: string) => `<a href="${esc(href)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:${bg};color:#fff;text-decoration:none;font-weight:600;margin-right:8px">${esc(label)}</a>`;
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:620px;color:#18181b;line-height:1.5">
<h2 style="margin:0 0 4px">Video ready for review</h2>
<p style="margin:0 0 14px;color:#52525b">${esc(r.productName)} is live on YouTube as <b>UNLISTED</b> and verified. Nothing is public yet.</p>
<p style="margin:0 0 14px"><a href="${esc(r.watchUrl)}" style="font-size:16px;font-weight:600">Watch the video on YouTube</a><br><span style="color:#71717a;font-size:13px">${esc(r.watchUrl)}</span></p>
<table style="border-collapse:collapse;width:100%;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;color:#71717a;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`).join("")}</table>
<h3 style="margin:18px 0 4px;font-size:14px">Proposed public title</h3><p style="margin:0">${esc(r.title)}</p>
<h3 style="margin:14px 0 4px;font-size:14px">Proposed public description</h3><p style="margin:0;white-space:pre-wrap;background:#f4f4f5;padding:10px 12px;border-radius:8px;font-size:13px">${esc(r.description)}</p>
<p style="margin:20px 0 8px">${btn(approve, "Approve and make public", "#16a34a")}${btn(changes, "Request changes", "#52525b")}</p>
<p style="margin:0;color:#71717a;font-size:12px">Approving switches this same video from unlisted to public (same link, no re-upload). Both buttons open a confirmation page behind your admin sign-in. Unlisted means anyone with the link can watch, and the video stays out of channel pages, search and recommendations until you approve.</p></div>`;
  return { subject, html, text };
}

export async function getReview(db: StudioDb, publicationId: string): Promise<ReviewState | null> {
  return getSetting<ReviewState | null>(reviewKey(publicationId), null, db);
}

export async function listReviews(db: StudioDb): Promise<ReviewState[]> {
  const rows = await db.select().from(ms.msSettings).where(like(ms.msSettings.key, `${REVIEW_PREFIX}%`));
  return rows.map((r) => r.value as ReviewState).filter((r) => r && typeof r.publicationId === "string" && typeof r.videoId === "string");
}

/** Stores the review state and the website embed details once the unlisted upload is verified. Supersedes any earlier version for the same product. */
export async function recordUnlistedReview(db: StudioDb, actor: string, r: Omit<ReviewState, "status" | "watchUrl" | "uploadedAt">, placement: string): Promise<ReviewState> {
  const state: ReviewState = { ...r, status: "unlisted_live", watchUrl: watchUrlFor(r.videoId), uploadedAt: new Date().toISOString() };
  for (const old of await listReviews(db)) {
    if (old.productId === r.productId && old.publicationId !== r.publicationId && (old.status === "unlisted_live" || old.status === "changes_requested")) {
      await setSetting(reviewKey(old.publicationId), { ...old, status: "superseded", supersededBy: r.publicationId }, actor, db);
      await audit(db, { actor, action: "video_review.superseded", entity: "publication", entityId: old.publicationId, productId: r.productId, detail: { by: r.publicationId } });
    }
  }
  await setSetting(reviewKey(r.publicationId), state, actor, db);
  const e = embedFor(r.videoId, r.title);
  const entry: EmbedEntry = { publicationId: r.publicationId, videoId: r.videoId, watchUrl: state.watchUrl, embedUrl: e.embedUrl, iframe: e.iframe, visibility: "unlisted", recommendedPlacement: placement, note: "Recommendation only. Marketing Studio never edits a House Account website; adding an embed is a separate, intentional development change." };
  const existing = await getSetting<EmbedEntry[]>(embedKey(r.productId), [], db);
  await setSetting(embedKey(r.productId), [...existing.filter((x) => x.publicationId !== r.publicationId), entry], actor, db);
  await audit(db, { actor, action: "video_review.unlisted_live", entity: "publication", entityId: r.publicationId, productId: r.productId, detail: { videoId: r.videoId } });
  return state;
}

export async function markEmailed(db: StudioDb, actor: string, publicationId: string): Promise<void> {
  const r = await getReview(db, publicationId);
  if (!r) return;
  await setSetting(reviewKey(publicationId), { ...r, emailedAt: new Date().toISOString() }, actor, db, { audited: false });
  await audit(db, { actor, action: "video_review.emailed", entity: "publication", entityId: publicationId, productId: r.productId, detail: { to: "owner" } });
}

export class NeedsVisibilityScopeError extends Error {}

/**
 * Owner approval: the SAME YouTube video goes from unlisted to public, then YouTube is asked to confirm it. The approval is recorded first; if YouTube
 * refuses the change (the connection was authorized before the visibility permission existed) the state is "approved_pending_public", nothing is public,
 * and approving again finishes the job after the channel is re-authorized.
 */
export async function approveReview(scope: OwnerScope, actor: string, publicationId: string, deps: Deps, db: StudioDb, note?: string): Promise<ReviewState> {
  const r = await getReview(db, publicationId);
  if (!r) throw new Error("No review found for that video");
  if (r.status === "approved_public") return r;
  if (r.status === "superseded") throw new Error("This version was superseded by a newer one; review the newer version.");
  const [pub] = await db.select().from(ms.msPublications).where(and(eq(ms.msPublications.id, publicationId), eq(ms.msPublications.productId, r.productId))).limit(1);
  if (!pub || pub.status !== "published" || pub.externalPostId !== r.videoId || !pub.connectionId) throw new Error("The uploaded video could not be matched to its publication");
  const [conn] = await db.select().from(ms.msConnections).where(eq(ms.msConnections.id, pub.connectionId)).limit(1);
  if (!conn || !(await connectionAllowedFor(db, conn, r.productId)) || !usable(evaluateHealth(conn))) throw new Error("The YouTube connection is not healthy");
  const approvedAt = r.approvedAt ?? new Date().toISOString();
  let state: ReviewState = { ...r, status: "approved_pending_public", approvedAt, ...(note ? { approvalNote: note.slice(0, 500) } : {}) };
  await setSetting(reviewKey(publicationId), state, actor, db, { audited: false });
  await audit(db, { actor, action: "video_review.approved", entity: "publication", entityId: publicationId, productId: r.productId, detail: { videoId: r.videoId } });
  if (!((conn.scopes as string[]) ?? []).includes(YT_SCOPE_MANAGE)) throw new NeedsVisibilityScopeError("Approval recorded, but the video is still unlisted: this YouTube connection was authorized before the permission to change visibility existed. Re-authorize the channel once (Connect with YouTube) or switch the video to Public in YouTube Studio, then approve again.");
  const t = await youtubeTokensForCall(scope, actor, conn.productId, conn.id, deps, db);
  const res = await setYoutubeVisibility({ videoId: r.videoId, accessToken: t.accessToken, privacy: "public" }, deps);
  if (!res.ok) {
    if (res.needsScope) throw new NeedsVisibilityScopeError(`Approval recorded, but YouTube refused the visibility change (${res.reason}). The video is still unlisted. Re-authorize the channel and approve again.`);
    throw new Error(`Approval recorded, but changing visibility failed: ${res.reason}. The video is still unlisted.`);
  }
  const v = await verifyYoutubeVideo({ videoId: r.videoId, channelId: conn.externalAccountId ?? "", accessToken: t.accessToken, requirePublic: true }, deps);
  if (!v.live) throw new Error(`Visibility was changed but YouTube does not confirm it as public: ${v.reason ?? "unknown"}. Check the video.`);
  state = { ...state, status: "approved_public", publicAt: new Date().toISOString() };
  await setSetting(reviewKey(publicationId), state, actor, db, { audited: false });
  const entries = await getSetting<EmbedEntry[]>(embedKey(r.productId), [], db);
  await setSetting(embedKey(r.productId), entries.map((e) => (e.publicationId === publicationId ? { ...e, visibility: "public" as const } : e)), actor, db, { audited: false });
  await audit(db, { actor, action: "video_review.made_public", entity: "publication", entityId: publicationId, productId: r.productId, detail: { videoId: r.videoId, sameVideoId: true } });
  await collectForPublication(scope, actor, r.productId, publicationId, undefined, db).catch(() => undefined);
  return state;
}

/** Owner asks for changes: the video stays UNLISTED and nothing is deleted. The replacement is made, uploaded and mailed as a new version that supersedes this one. */
export async function requestChanges(actor: string, publicationId: string, note: string, db: StudioDb): Promise<ReviewState> {
  const r = await getReview(db, publicationId);
  if (!r) throw new Error("No review found for that video");
  if (r.status === "approved_public") throw new Error("This video is already public; request changes by making a new version.");
  const clean = note.trim().slice(0, 1000);
  if (!clean) throw new Error("Say what should change, so the replacement can be made.");
  const state: ReviewState = { ...r, status: "changes_requested", changesNote: clean, changesRequestedAt: new Date().toISOString() };
  await setSetting(reviewKey(publicationId), state, actor, db, { audited: false });
  await audit(db, { actor, action: "video_review.changes_requested", entity: "publication", entityId: publicationId, productId: r.productId, detail: { note: clean } });
  return state;
}

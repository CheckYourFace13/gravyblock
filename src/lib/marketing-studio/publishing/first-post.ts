/**
 * The first controlled social post for the shared iScream Studio identity. Prep only: nothing here sends. It defines the exact order
 * (ScribbleZap first, Mibble Meadow only after the first post has proven the whole loop), the ownership and permission check on the
 * connected Page, the pre-publish checklist, and the proof record the order depends on.
 *
 * Identity rule: posts go out through the Page token only. A personal profile can be the hidden Meta administrator that authorizes the Page,
 * but it never posts, is never the brand and never appears in copy; its contact details are never used.
 */
import { and, eq, sql } from "drizzle-orm";
import { audit } from "../audit";
import { ms, type StudioDb } from "../db";
import { graphBase, type Deps } from "./adapters";
import { FB_OAUTH_SCOPES } from "./oauth-facebook";
import { NOT_YET_DOWNLOADABLE, storeDestination } from "../video/demo/language-qa";
import type { DemoRecord } from "../video/demo/types";

export const FIRST_SOCIAL = {
  brand: "iScream Studio",
  /** matched against the Page by Connect with Facebook (name without spaces, or username) */
  expectedHandle: "iscreamstudio",
  brandHost: "iscreamstudio.com",
  order: ["scribblezap", "mibblemeadow"] as const,
  platform: "facebook" as const,
  minimumStructure: ["iScream Studio Facebook Page", "Meta Business portfolio owning the Page", "Studio-only Meta app", "GravyBlock OAuth connection"],
  deferred: ["Instagram", "TikTok", "YouTube", "Meta Ads", "Google Ads"],
};

export const FIRST_POST_PROVEN = "publication.first_post_proven";
/** The same proof, per platform: the Facebook loop and the YouTube loop are proven separately. */
export const FIRST_PROVEN_ACTION = { facebook: FIRST_POST_PROVEN, youtube: "publication.first_youtube_upload_proven" } as const;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:\+?\d[\s().-]?){9,}\d/;
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const host = (u: string | null | undefined) => {
  try {
    return u ? new URL(u).host.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};

export type Check = { name: string; ok: boolean; detail: string };

/** Read-only ownership and permission verification of a connected Page, straight from Meta with the stored Page token. */
export async function verifyPageOwnership(conn: { externalAccountId: string | null; accountLabel: string; scopes: unknown }, accessToken: string, deps: Deps): Promise<Check[]> {
  const out: Check[] = [];
  const scopes = (conn.scopes as string[]) ?? [];
  const missing = FB_OAUTH_SCOPES.filter((s) => !scopes.includes(s));
  out.push({ name: "required permissions were granted", ok: missing.length === 0, detail: missing.length ? `missing ${missing.join(", ")}` : scopes.join(", ") });
  out.push({ name: `the connected account is the ${FIRST_SOCIAL.brand} Page`, ok: squash(conn.accountLabel) === squash(FIRST_SOCIAL.brand), detail: conn.accountLabel });
  try {
    const res = await deps.fetch(`${graphBase()}/${encodeURIComponent(conn.externalAccountId ?? "")}?fields=id,name,category,username&access_token=${encodeURIComponent(accessToken)}`, { method: "GET" });
    const body = (await res.json().catch(() => ({}))) as { id?: string; name?: string; category?: string; error?: { message?: string } };
    if (!res.ok || body.error) out.push({ name: "Meta confirms the Page and our access to it", ok: false, detail: body.error?.message?.slice(0, 120) ?? `HTTP ${res.status}` });
    else {
      out.push({ name: "Meta confirms the Page and our access to it", ok: body.id === conn.externalAccountId && squash(body.name ?? "") === squash(FIRST_SOCIAL.brand), detail: `${body.name} (${body.id})` });
      // a personal profile has no category; a Page always does, so a profile can never pass as the brand
      out.push({ name: "it is a Page (not a personal profile)", ok: Boolean(body.category), detail: body.category ?? "no Page category returned" });
    }
  } catch (e) {
    out.push({ name: "Meta confirms the Page and our access to it", ok: false, detail: e instanceof Error ? e.message.slice(0, 120) : "request failed" });
  }
  return out;
}

/** The pre-publish checklist for one prepared post. Pure: it only looks at what it is given. */
export function prePublishChecks(i: {
  productSlug: string;
  productId: string;
  publication: { productId: string; caption: string; ctaUrl: string | null; status: string; connectionId: string | null; assetId: string };
  connection: { id: string; productId: string };
  video: { assetId: string | null; status: string; qaPassed: boolean; stale: boolean; record: DemoRecord };
  facts: Array<{ id: string; value: string; verified: boolean }>;
  alreadyPublishedForProduct: number;
}): Check[] {
  const { publication: p, video: v } = i;
  const text = `${p.caption} ${v.record.transcript.map((l) => l.text).join(" ")} ${v.record.onScreen.map((o) => o.text).join(" ")}`;
  const live = Boolean(storeDestination(i.facts.map((f) => ({ value: f.value, verified: f.verified }))));
  const factIds = [...new Set(v.record.claims.flatMap((c) => c.factIds))];
  const phaseOk = live ? v.record.ctaPhase === "store_live" : v.record.ctaPhase !== "store_live" && !NOT_YET_DOWNLOADABLE.test(`${p.caption} ${v.record.cta.text}`);
  return [
    { name: "first controlled candidate is ScribbleZap", ok: i.productSlug === FIRST_SOCIAL.order[0] || i.alreadyPublishedForProduct > 0, detail: i.productSlug },
    { name: "the post belongs to this product and its own connection", ok: p.productId === i.productId && i.connection.productId === i.productId && p.connectionId === i.connection.id, detail: "" },
    { name: "the video is the owner-approved, QA-passed, current file", ok: v.status === "approved" && p.assetId === v.assetId && v.qaPassed && !v.stale, detail: `status ${v.status}${v.stale ? ", STALE" : ""}` },
    { name: "Product Truth: every claim is backed by verified facts and page quotes", ok: v.record.claims.every((c) => c.factsVerified && c.sources.every((s) => s.onPage)) && factIds.length > 0 && factIds.every((id) => i.facts.some((f) => f.id === id && f.verified)), detail: `${v.record.claims.length} claims` },
    { name: "the call to action matches the launch state (invitation before launch, store link once live)", ok: phaseOk, detail: `${v.record.cta.text} -> ${p.ctaUrl ?? "none"}` },
    { name: `the link goes to ${FIRST_SOCIAL.brandHost} or the verified store listing only`, ok: host(p.ctaUrl) === FIRST_SOCIAL.brandHost || (live && /^(play\.google\.com|apps\.apple\.com)$/.test(host(p.ctaUrl) ?? "")), detail: host(p.ctaUrl) ?? "none" },
    { name: "no email address anywhere in the post or video text", ok: !EMAIL.test(text), detail: "" },
    { name: "no phone number in the post", ok: !PHONE.test(p.caption.replace(/utm_[a-z_]+=[a-z0-9_]+/gi, "")), detail: "" },
    { name: "the brand is iScream Studio and no personal name is used", ok: !/\bchris\b/i.test(text), detail: "" },
    { name: "not already sent: still approval required (or approved, not published)", ok: ["approval_required", "approved"].includes(p.status), detail: p.status },
    { name: "no duplicate: this product has no published Facebook post yet", ok: i.alreadyPublishedForProduct === 0, detail: `${i.alreadyPublishedForProduct} published` },
  ];
}

/** Has this product's first post gone out, been confirmed live by Meta, and had its first measurement stored? */
export async function firstPostProven(db: StudioDb, productId: string, platform: keyof typeof FIRST_PROVEN_ACTION = "facebook"): Promise<boolean> {
  const rows = await db.select({ id: ms.msAuditEvents.id }).from(ms.msAuditEvents).where(and(eq(ms.msAuditEvents.action, FIRST_PROVEN_ACTION[platform]), eq(ms.msAuditEvents.productId, productId))).limit(1);
  return rows.length > 0;
}

export async function recordFirstPostProven(db: StudioDb, actor: string, productId: string, publicationId: string, detail: Record<string, unknown>, platform: keyof typeof FIRST_PROVEN_ACTION = "facebook") {
  await audit(db, { actor, action: FIRST_PROVEN_ACTION[platform], entity: "publication", entityId: publicationId, productId, detail });
}

/** Mibble Meadow follows only after ScribbleZap's first post proved the complete loop. Throws with the reason otherwise. */
export async function assertRolloutOrder(db: StudioDb, product: { id: string; slug: string }, platform: string): Promise<void> {
  if ((platform !== "facebook" && platform !== "youtube") || product.slug !== FIRST_SOCIAL.order[1]) return;
  const [first] = await db.select({ id: ms.msProducts.id }).from(ms.msProducts).where(sql`${ms.msProducts.slug} = ${FIRST_SOCIAL.order[0]}`).limit(1);
  if (!first || !(await firstPostProven(db, first.id, platform))) throw new Error(`Mibble Meadow waits until ScribbleZap's first ${platform === "youtube" ? "upload has been published, verified live on YouTube, and measured" : "post has been published, verified live on Meta, and measured"}; the rollout order has not been satisfied yet.`);
}

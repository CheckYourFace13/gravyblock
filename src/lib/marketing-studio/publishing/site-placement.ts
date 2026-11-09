/**
 * Where an approved video may go on a website, decided per product:
 *   - The owner's House Accounts (and every internal product) are NEVER written autonomously. They get an embed snippet and a recommended page and position; a person
 *     adds it deliberately. This is the permanent House no-write rule and nothing here can change it.
 *   - A customer product may have the video placed on THEIR OWN site automatically, only when the customer has granted site-write capability for it. Without that grant they
 *     get the embed code, the recommended URL and the position, exactly like a House Account.
 *   - A customer video never targets iScream's channel or site, and never another customer's: a placement target must be on the product's own host.
 * This module only decides and prepares. The adapter that would perform a granted placement lives with the customer's own site connection, outside Marketing Studio.
 */
import { getSetting } from "../runtime";
import type { StudioDb } from "../db";
import { embedFor } from "./video-review";

export type SiteWriteGrant = { granted: boolean; grantedBy?: string; grantedAt?: string; /** page types the customer allowed, e.g. home, feature, faq */ pages?: string[] };
export const siteWriteKey = (productId: string) => `site_write_grant_${productId}`;

export type PlacementDecision = {
  mode: "auto_place" | "recommend_only";
  reason: string;
  embedHtml: string;
  embedUrl: string;
  recommendedUrl: string | null;
  recommendedPosition: string;
};

const ISCREAM_HOSTS = ["iscreamstudio.com"];
const hostOf = (u: string) => {
  try {
    return new URL(u).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Pure: may Marketing Studio place a video on this URL for this product? A customer's target must be on their own host; iScream's site is never a customer target. */
export function placementTargetAllowed(p: { ownerKind: string; productHost: string }, targetUrl: string): { ok: boolean; reason: string } {
  const h = hostOf(targetUrl);
  if (!h) return { ok: false, reason: "not a valid https address" };
  if (p.ownerKind === "customer" && ISCREAM_HOSTS.includes(h)) return { ok: false, reason: "a customer's video never goes on the iScream site" };
  if (p.ownerKind === "customer" && h !== p.productHost.toLowerCase().replace(/^www\./, "")) return { ok: false, reason: "a customer's video is only placed on that customer's own site" };
  return { ok: true, reason: "on the product's own site" };
}

/** Pure: the decision for a product. */
export function decidePlacement(i: { ownerKind: string; grant: SiteWriteGrant | null; pageType?: string }): { mode: PlacementDecision["mode"]; reason: string } {
  if (i.ownerKind !== "customer") return { mode: "recommend_only", reason: "House accounts and internal products are never written to autonomously: embed code and a recommendation are provided" };
  if (!i.grant?.granted) return { mode: "recommend_only", reason: "site-write access has not been granted: embed code and a recommendation are provided" };
  if (i.grant.pages && i.pageType && !i.grant.pages.includes(i.pageType)) return { mode: "recommend_only", reason: `placement on ${i.pageType} pages was not granted` };
  return { mode: "auto_place", reason: "the customer granted site-write access for this kind of page" };
}

export async function placementFor(db: StudioDb, product: { id: string; ownerKind: string; host: string }, v: { videoId: string; title: string; recommendedUrl?: string | null; recommendedPosition?: string; pageType?: string }): Promise<PlacementDecision> {
  const grant = await getSetting<SiteWriteGrant | null>(siteWriteKey(product.id), null, db);
  const d = decidePlacement({ ownerKind: product.ownerKind, grant, pageType: v.pageType });
  const e = embedFor(v.videoId, v.title);
  const target = v.recommendedUrl && placementTargetAllowed({ ownerKind: product.ownerKind, productHost: product.host }, v.recommendedUrl).ok ? v.recommendedUrl : null;
  // a granted placement also needs a valid on-site target; without one it falls back to a recommendation
  const mode = d.mode === "auto_place" && !target ? "recommend_only" : d.mode;
  return { mode, reason: d.mode === "auto_place" && !target ? "no valid page on the customer's own site was identified: embed code and a recommendation are provided" : d.reason, embedHtml: e.iframe, embedUrl: e.embedUrl, recommendedUrl: target, recommendedPosition: v.recommendedPosition ?? "below the main heading of the most relevant page" };
}

/**
 * One entry point for "send this finished video for the owner's review". A product with a connected YouTube channel (its own, or the owner's shared channel for the owner's products)
 * uploads UNLISTED to YouTube; a customer with no channel gets GravyBlock-hosted playback on private object storage. Either way the owner receives the same review email.
 * A customer is never sent to the iScream Studio channel, and a hosted video never needs YouTube.
 */
import type { StudioDb } from "../db";
import { prepareHostedReview } from "../media/hosted-review";
import { listProducts } from "../repository";
import { INTERNAL_SCOPE } from "../scope";
import { playbackFor } from "./hosting";
import { prepareUnlistedReview, type UploadOptions, type UploadOutcome } from "./review-upload";

export async function prepareReview(db: StudioDb, o: UploadOptions): Promise<UploadOutcome> {
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.slug === o.slug);
  if (!product) throw new Error(`${o.slug} is not a Studio product`);
  const dest = await playbackFor(db, product);
  if (dest.kind !== "gravyblock_hosted") return prepareUnlistedReview(db, o);
  const out = await prepareHostedReview(db, { slug: o.slug, videoRowId: o.videoRowId, title: o.title ?? product.name, description: o.description ?? "", intended: o.intended ?? "Organic video, a website embed and a future paid video asset.", specId: o.specId, placement: o.placement, library: o.library, upload: o.upload, log: o.log });
  return { ok: out.ok, blocked: out.blocked, publicationId: out.canonicalId, videoId: out.canonicalId, emailed: out.emailed };
}

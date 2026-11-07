"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStudioAccess } from "@/lib/marketing-studio/auth";
import { UPLOAD_KINDS, FACT_SOURCES, PRODUCT_KINDS, type UploadKind, type ProductKind } from "@/lib/marketing-studio/config";
import {
  addClaim,
  addFact,
  approveAsset,
  createCampaign,
  createProduct,
  removeClaim,
  saveBrandProfile,
  setCampaignStatus,
  setProductStatus,
  softDeleteProduct,
  verifyFact,
} from "@/lib/marketing-studio/repository";
import { enqueueConceptRender } from "@/lib/marketing-studio/creative/queue";
import { generateConcepts, reviewCreative } from "@/lib/marketing-studio/creative/copy";
import { connectAccount, refreshConnectionHealth, revokeAccount } from "@/lib/marketing-studio/publishing/connections";
import { approvePublication, cancelPublication, createPublication, markPublicationDeleted, schedulePublication } from "@/lib/marketing-studio/publishing/queue";
import { collectForPublication } from "@/lib/marketing-studio/measurement/collect";
import { getSetting, setKillSwitch } from "@/lib/marketing-studio/runtime";
import { requireStudioDb } from "@/lib/marketing-studio/db";
import { approveReview, requestChanges } from "@/lib/marketing-studio/publishing/video-review";
import { createVideoFromProduct, reviewVideo } from "@/lib/marketing-studio/video/queue";
import { importRemoteImage } from "@/lib/marketing-studio/remote-import";

const base = "/admin/marketing-studio";

function s(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
}

/** Runs an action, turning any failure into a message on the page instead of a crash. */
async function guarded(back: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Something went wrong";
    redirect(`${back}${back.includes("?") ? "&" : "?"}e=${encodeURIComponent(msg.slice(0, 200))}`);
  }
  revalidatePath(base);
  redirect(back);
}

export async function createProductAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  let id = "";
  try {
    const kind = s(fd, "kind") as ProductKind;
    if (!PRODUCT_KINDS.includes(kind)) throw new Error("Choose a product type");
    const ownerKind = s(fd, "ownerKind") === "house" ? "house" : "internal";
    const p = await createProduct(scope, actor, { name: s(fd, "name"), kind, publicUrl: s(fd, "publicUrl") || null, ownerKind, businessId: s(fd, "businessId") || null });
    id = p.id;
  } catch (err) {
    redirect(`${base}?e=${encodeURIComponent((err instanceof Error ? err.message : "Could not create the product").slice(0, 200))}`);
  }
  revalidatePath(base);
  redirect(`${base}/products/${id}`);
}

export async function productStatusAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, () => setProductStatus(scope, actor, id, s(fd, "status") as "draft" | "active" | "paused" | "archived"));
}

export async function deleteProductAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(base, () => softDeleteProduct(scope, actor, id));
}

export async function saveBrandAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    await saveBrandProfile(scope, actor, id, {
      colors: { primary: s(fd, "primary"), secondary: s(fd, "secondary"), accent: s(fd, "accent") },
      fonts: { heading: s(fd, "headingFont"), body: s(fd, "bodyFont") },
      voiceRules: s(fd, "voiceRules"),
      doNotSay: s(fd, "doNotSay"),
    });
  });
}

export async function addFactAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    const sourceKind = s(fd, "sourceKind") as (typeof FACT_SOURCES)[number];
    await addFact(scope, actor, id, { factKey: s(fd, "factKey"), factValue: s(fd, "factValue"), sourceKind, sourceUrl: s(fd, "sourceUrl") || null });
  });
}

export async function verifyFactAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, () => verifyFact(scope, actor, id, s(fd, "factId")));
}

export async function addClaimAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    const kind = s(fd, "kind") === "prohibited" ? "prohibited" : "approved";
    const factIds = fd.getAll("factIds").filter((v): v is string => typeof v === "string");
    await addClaim(scope, actor, id, { kind, text: s(fd, "text"), factIds, rationale: s(fd, "rationale") });
  });
}

export async function removeClaimAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, () => removeClaim(scope, actor, id, s(fd, "claimId")));
}

export async function importAssetAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    const kind = s(fd, "kind") as UploadKind;
    if (!UPLOAD_KINDS.includes(kind)) throw new Error("Choose an asset type");
    await importRemoteImage(scope, actor, id, { url: s(fd, "url"), kind });
  });
}

export async function approveAssetAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, () => approveAsset(scope, actor, id, s(fd, "assetId"), s(fd, "licenseNote")));
}

export async function createCampaignAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    await createCampaign(scope, actor, id, {
      name: s(fd, "name"),
      objective: s(fd, "objective"),
      audience: s(fd, "audience"),
      channels: fd.getAll("channels").filter((v): v is string => typeof v === "string"),
      automationLevel: Number(s(fd, "automationLevel")) || 1,
      notes: s(fd, "notes"),
    });
  });
}

export async function campaignStatusAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, () => setCampaignStatus(scope, actor, id, s(fd, "campaignId"), s(fd, "status") as "draft" | "needs_review" | "approved" | "complete" | "cancelled"));
}

export async function killSwitchAction(fd: FormData) {
  const { actor } = await requireStudioAccess();
  await guarded(base, () => setKillSwitch(s(fd, "on") === "1", actor));
}

// ---- Phase 1.5 and 2: concepts, creatives, videos ----------------------------------------------------------------------

export async function generateConceptsAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    await generateConcepts(scope, actor, id, { limit: 4 });
  });
}

export async function renderConceptAction(fd: FormData) {
  const { scope } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    await enqueueConceptRender(scope, id, s(fd, "conceptId"));
  });
}

export async function reviewCreativeAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, () => reviewCreative(scope, actor, id, s(fd, "creativeId"), s(fd, "decision") === "approved" ? "approved" : "rejected"));
}

export async function createVideoAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    // Video rendering stays off until the VPS benchmark has passed and an operator has switched it on.
    if (!(await getSetting<boolean>("video_enabled", false))) throw new Error("Video rendering is not enabled: it requires a passing VPS benchmark");
    await createVideoFromProduct(scope, actor, id, Number(s(fd, "seconds")));
  });
}

export async function reviewVideoAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, () => reviewVideo(scope, actor, id, s(fd, "videoId"), s(fd, "decision") === "approved" ? "approved" : "rejected"));
}

/**
 * Owner review decision from the Review screen. It records approve, reject or regenerate-later and nothing else: it does not create a
 * publication, schedule anything, connect anything or start a render.
 */
export async function reviewDecisionAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const requested = s(fd, "back");
  const back = /^\/admin\/marketing-studio\/review(\?[A-Za-z0-9=&_.-]*)?$/.test(requested) ? requested : `${base}/review`;
  const raw = s(fd, "decision");
  const decision = raw === "approved" ? "approved" : raw === "regenerate_later" ? "regenerate_later" : "rejected";
  const productId = s(fd, "productId");
  await guarded(back, async () => {
    if (s(fd, "kind") === "video") await reviewVideo(scope, actor, productId, s(fd, "id"), decision);
    else await reviewCreative(scope, actor, productId, s(fd, "id"), decision);
  });
}

// ---- Phase 3: publishing foundation (nothing posts without approval; live publishing is off by default) ---------------------

export async function createPublicationAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    const media = s(fd, "media"); // "creative:<id>" or "video:<id>"
    const [kind, mediaId] = media.split(":");
    const mode = s(fd, "mode") === "direct" ? "direct" : "export";
    await createPublication(scope, actor, id, {
      creativeId: kind === "creative" ? mediaId : undefined,
      videoId: kind === "video" ? mediaId : undefined,
      platform: s(fd, "platform"),
      mode,
      connectionId: s(fd, "connectionId") || null,
      caption: s(fd, "caption") || undefined,
      title: s(fd, "title") || null,
    });
  });
}

export async function approvePublicationAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, () => approvePublication(scope, actor, id, s(fd, "publicationId")));
}

export async function schedulePublicationAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, () => schedulePublication(scope, actor, id, s(fd, "publicationId"), new Date(s(fd, "when"))));
}

export async function cancelPublicationAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, () => cancelPublication(scope, actor, id, s(fd, "publicationId")));
}

export async function markDeletedAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, () => markPublicationDeleted(scope, actor, id, s(fd, "publicationId")));
}

export async function connectAccountAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    const expires = s(fd, "expiresAt");
    await connectAccount(scope, actor, id, {
      platform: s(fd, "platform") as "facebook" | "instagram" | "youtube" | "tiktok",
      accountLabel: s(fd, "accountLabel"),
      externalAccountId: s(fd, "externalAccountId"),
      tokens: { accessToken: s(fd, "accessToken"), refreshToken: s(fd, "refreshToken") || undefined },
      scopes: fd.getAll("scopes").filter((v): v is string => typeof v === "string"),
      tokenExpiresAt: expires ? new Date(expires) : null,
    });
  });
}

export async function revokeAccountAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    await revokeAccount(scope, actor, id, s(fd, "connectionId"));
  });
}

export async function refreshHealthAction(fd: FormData) {
  const { scope } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    await refreshConnectionHealth(scope, id, s(fd, "connectionId"));
  });
}

export async function collectMetricsAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/insights`, async () => {
    await collectForPublication(scope, actor, id, s(fd, "publicationId"));
  });
}

// ---- Video review: unlisted on YouTube, owner approves (same video becomes public) or requests changes ------------------------

export async function approveVideoReviewAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "publicationId");
  await guarded(`${base}/video-review/${id}`, async () => {
    await approveReview(scope, actor, id, { fetch }, requireStudioDb(), s(fd, "note"));
  });
}

export async function requestVideoChangesAction(fd: FormData) {
  const { actor } = await requireStudioAccess();
  const id = s(fd, "publicationId");
  await guarded(`${base}/video-review/${id}`, async () => {
    await requestChanges(actor, id, s(fd, "note"), requireStudioDb());
  });
}

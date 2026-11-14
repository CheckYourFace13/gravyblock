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
  requireProduct,
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
import { declareKids, isPaused, pauseProduct, resumeProduct } from "@/lib/marketing-studio/publishing/video-policy";
import { setMaxPending, setTarget } from "@/lib/marketing-studio/video-target";
import { enqueue, JOB_PRIORITY } from "@/lib/marketing-studio/runtime";
import { saveVoiceSetting, type ToneKey } from "@/lib/marketing-studio/video/voices";
import { sendVerificationEmail } from "@/lib/marketing-studio/publishing/review-notify";
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

/** Resume video marketing: only here, behind the GravyBlock login. Emails never carry a resume link. */
export async function resumeVideoMarketingAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    await requireProduct(scope, id);
    await resumeProduct(requireStudioDb(), actor, id);
  });
}

export async function pauseVideoMarketingAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    await requireProduct(scope, id);
    await pauseProduct(requireStudioDb(), actor, id);
  });
}

/** The video target: 1, 3, 5 or a custom number. GravyBlock then keeps producing distinct videos on its own until the number is reached or the product is paused. */
export async function setVideoTargetAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    await requireProduct(scope, id);
    const preset = s(fd, "preset");
    await setTarget(requireStudioDb(), actor, id, preset === "custom" ? s(fd, "custom") : preset);
  });
}

/** How many videos may wait for your decision at once before production pauses. */
export async function setMaxPendingAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    const product = await requireProduct(scope, id);
    await setMaxPending(requireStudioDb(), actor, { id, slug: product.slug, kind: product.kind, ownerKind: product.ownerKind }, s(fd, "max"));
  });
}

/** Generate Next Video: queues the next eligible distinct video now (resource limits, a pause and a customer's plan allowance still apply). */
export async function generateNextVideoAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    const product = await requireProduct(scope, id);
    const db = requireStudioDb();
    if (await isPaused(db, id)) throw new Error("Video marketing is paused for this product. Resume it first.");
    await enqueue({ kind: "portfolio_tick", weight: "heavy", priority: JOB_PRIORITY.remediation, productId: id, dedupeKey: `generate_next:${id}:${Math.floor(Date.now() / 60_000)}`, input: { only: product.slug, force: true, by: actor }, maxAttempts: 1 }, db);
  });
}

/** The one-time YouTube made-for-kids declaration for this product. The owner makes it; it is stored and reused on every later upload. */
export async function declareKidsAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  const v = s(fd, "kids");
  await guarded(`${base}/products/${id}`, async () => {
    await requireProduct(scope, id);
    if (v !== "yes" && v !== "no") throw new Error("Choose yes or no");
    await declareKids(requireStudioDb(), actor, { productId: id }, v === "yes");
  });
}

/** Change where this product's video reviews go. The new address gets a confirmation email and is only used after its owner confirms; the old verified one keeps working until then. */
export async function changeReviewEmailAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    const product = await requireProduct(scope, id);
    const out = await sendVerificationEmail(requireStudioDb(), actor, id, s(fd, "email"), product.name);
    if (!out.sent) throw new Error(out.reason ?? "The confirmation email could not be sent");
  });
}

export async function changeVoiceAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    await requireProduct(scope, id);
    const pronunciations = Object.fromEntries(s(fd, "pronunciations").split(String.fromCharCode(10)).map((l) => l.split("=")).filter((p) => p.length === 2 && p[0].trim() && p[1].trim()).map((p) => [p[0].trim(), p[1].trim()]));
    const alt = s(fd, "alternate");
    await saveVoiceSetting(requireStudioDb(), actor, id, { voice: s(fd, "voice"), tone: s(fd, "tone") as ToneKey, variation: s(fd, "variation") as "none" | "pacing" | "alternate", alternates: alt ? [alt] : [], pronunciations });
  });
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

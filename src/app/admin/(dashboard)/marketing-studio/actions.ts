"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStudioAccess } from "@/lib/marketing-studio/auth";
import { ASSET_KINDS, FACT_SOURCES, PRODUCT_KINDS, type AssetKind, type ProductKind } from "@/lib/marketing-studio/config";
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
import { setKillSwitch } from "@/lib/marketing-studio/runtime";
import { importRemoteImage } from "@/lib/marketing-studio/remote-import";
import { storeImageAsset } from "@/lib/marketing-studio/uploads";

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

export async function uploadAssetAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    const kind = s(fd, "kind") as AssetKind;
    if (!ASSET_KINDS.includes(kind)) throw new Error("Choose an asset type");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file");
    await storeImageAsset(scope, actor, id, { bytes: Buffer.from(await file.arrayBuffer()), originalName: file.name, kind, provenance: "owner_upload" });
  });
}

export async function importAssetAction(fd: FormData) {
  const { scope, actor } = await requireStudioAccess();
  const id = s(fd, "productId");
  await guarded(`${base}/products/${id}`, async () => {
    const kind = s(fd, "kind") as AssetKind;
    if (!ASSET_KINDS.includes(kind)) throw new Error("Choose an asset type");
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

/**
 * The verified Brand Kit of one product: the exact logo files (canonical, hashed, never altered), the product's approved name and capitalization, and only the
 * colors, fonts and tagline someone actually supplied or verified. Nothing is inferred: an alternate logo or a brand color is never guessed, and when no valid logo
 * exists the kit says NEEDS BRAND ASSET and videos show the product name as plain text instead of a made-up mark.
 */
import { eq } from "drizzle-orm";
import { ms, type StudioDb } from "../db";
import { getSetting, setSetting } from "../runtime";
import type { CanonicalLogo } from "./logo-integrity";

export const brandKitKey = (productId: string) => `brand_kit_${productId}`;

/** Written into every kit so the rule travels with the data. */
export const PROHIBITED_ALTERATIONS = [
  "recolor", "change or add a background", "put inside another shape or rounded clip", "redraw or regenerate with AI", "crop any part", "stretch or squash",
  "change proportions or spacing inside the logo", "add outline, shadow, glow or other effects to the logo itself", "recreate from text", "change text, capitalization or symbols",
];

export type BrandKit = {
  productId: string;
  /** the name exactly as the owner writes it */
  approvedName: string;
  logos: Array<CanonicalLogo & { variant: string }>;
  /** only values supplied or verified by the owner */
  colors: Array<{ name: string; hex: string; verified: boolean }>;
  fonts: Array<{ family: string; licensed: boolean }>;
  tagline: string | null;
  prohibited: string[];
  updatedAt: string;
};

export const getBrandKit = (db: StudioDb, productId: string) => getSetting<BrandKit | null>(brandKitKey(productId), null, db);

async function productName(db: StudioDb, productId: string): Promise<string> {
  const [p] = await db.select({ name: ms.msProducts.name }).from(ms.msProducts).where(eq(ms.msProducts.id, productId)).limit(1);
  return p?.name ?? "";
}

/** Records a canonical logo in the kit (idempotent per file hash). The first one is the primary variant; later distinct files are listed as separate allowed variants. */
export async function saveCanonicalLogo(db: StudioDb, actor: string, productId: string, logo: CanonicalLogo): Promise<BrandKit> {
  const cur = await getBrandKit(db, productId);
  const kit: BrandKit = cur ?? { productId, approvedName: await productName(db, productId), logos: [], colors: [], fonts: [], tagline: null, prohibited: PROHIBITED_ALTERATIONS, updatedAt: new Date().toISOString() };
  if (kit.logos.some((l) => l.sha256 === logo.sha256)) return kit;
  const next: BrandKit = { ...kit, logos: [...kit.logos, { ...logo, variant: kit.logos.length === 0 ? "primary" : `variant ${kit.logos.length + 1}` }], updatedAt: new Date().toISOString() };
  await setSetting(brandKitKey(productId), next, actor, db, { audited: false });
  return next;
}

export type BrandKitPatch = { approvedName?: string; tagline?: string | null; colors?: BrandKit["colors"]; fonts?: BrandKit["fonts"] };
export async function updateBrandKit(db: StudioDb, actor: string, productId: string, patch: BrandKitPatch): Promise<BrandKit> {
  const cur = (await getBrandKit(db, productId)) ?? { productId, approvedName: await productName(db, productId), logos: [], colors: [], fonts: [], tagline: null, prohibited: PROHIBITED_ALTERATIONS, updatedAt: "" };
  const next: BrandKit = { ...cur, ...patch, prohibited: PROHIBITED_ALTERATIONS, updatedAt: new Date().toISOString() };
  await setSetting(brandKitKey(productId), next, actor, db);
  return next;
}

/** Does this product have an approved logo asset on file? Without one, videos need a brand asset from the owner. */
export async function hasApprovedLogo(db: StudioDb, productId: string): Promise<boolean> {
  const rows = await db.select({ kind: ms.msAssets.kind, approved: ms.msAssets.approved }).from(ms.msAssets).where(eq(ms.msAssets.productId, productId));
  return rows.some((a) => a.kind === "logo" && a.approved === "true");
}

/**
 * Everything a render needs about a product, loaded once: verified facts, prohibited claims, approved assets, theme, and the
 * image data URIs. Shared by static creatives and video cards so both are grounded and checked identically.
 */
import { promises as fs } from "node:fs";
import { and, desc, eq } from "drizzle-orm";
import sharp from "sharp";
import { STUDIO_DIRS } from "../config";
import { ms, type StudioDb } from "../db";
import { requireProduct } from "../repository";
import type { OwnerScope } from "../scope";
import { safeJoin } from "../storage";
import type { QaFact } from "./qa";
import { NEUTRAL_PATTERNS, type Img, type TextSrc } from "./templates";
import { themeFor, type Theme } from "./theme";
import { norm } from "./qa";

export type Fact = typeof ms.msProductFacts.$inferSelect;
export type Asset = typeof ms.msAssets.$inferSelect;

export type ProductContext = {
  product: Awaited<ReturnType<typeof requireProduct>>;
  productName: string;
  theme: Theme;
  facts: Fact[];
  qaFacts: QaFact[];
  prohibited: string[];
  approvedAssets: Asset[];
  logoAsset: Asset | undefined;
  logo: Img | null;
  screenshotAssets: Asset[];
  ctaFactValues: string[];
  allowedUrlHosts: string[];
};

/** Finds which verified fact a rendered string comes from. Unmatched text gets a dead reference so QA fails it. */
export function sourceFor(text: string, productName: string, facts: Fact[], preferred: string[] = []): TextSrc {
  const t = norm(text);
  if (t === norm(productName)) return { kind: "product" };
  if (NEUTRAL_PATTERNS.some((p) => norm(p.replace("{product}", productName)) === t)) return { kind: "neutral" };
  const ordered = [...facts].sort((a, b) => Number(preferred.includes(b.id)) - Number(preferred.includes(a.id)));
  const hit = ordered.find((f) => norm(f.factValue).includes(t));
  return hit ? { kind: "fact", factId: hit.id } : { kind: "fact", factId: "unmatched" };
}

export async function readAssetBytes(asset: Asset): Promise<Buffer> {
  return fs.readFile(safeJoin(STUDIO_DIRS.media, ...asset.storagePath.split("/")));
}

export async function toImg(asset: Asset, maxW: number, maxH: number, alt: string): Promise<Img> {
  const out = await sharp(await readAssetBytes(asset)).rotate().resize({ width: maxW, height: maxH, fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  return { dataUri: `data:image/png;base64,${out.data.toString("base64")}`, w: out.info.width, h: out.info.height, assetId: asset.id, alt };
}

async function dominantColor(asset: Asset): Promise<string | null> {
  try {
    const { dominant } = await sharp(await readAssetBytes(asset)).stats();
    return "#" + [dominant.r, dominant.g, dominant.b].map((v) => v.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

export async function loadProductContext(scope: OwnerScope, productId: string, db: StudioDb): Promise<ProductContext> {
  const product = await requireProduct(scope, productId, db);
  const [brandRow] = await db.select().from(ms.msBrandProfiles).where(eq(ms.msBrandProfiles.productId, product.id)).orderBy(desc(ms.msBrandProfiles.version)).limit(1);
  const allFacts = await db.select().from(ms.msProductFacts).where(and(eq(ms.msProductFacts.productId, product.id), eq(ms.msProductFacts.status, "current")));
  const facts = allFacts.filter((f) => f.verifiedAt);
  const productName = facts.find((f) => f.factKey === "product_name")?.factValue ?? product.name;
  const prohibited = (await db.select().from(ms.msClaims).where(and(eq(ms.msClaims.productId, product.id), eq(ms.msClaims.kind, "prohibited")))).map((c) => c.text);
  const approvedAssets = (await db.select().from(ms.msAssets).where(eq(ms.msAssets.productId, product.id))).filter((a) => a.approved === "true");
  const logoAsset = approvedAssets.find((a) => a.kind === "logo") ?? approvedAssets.find((a) => a.kind === "icon");
  const brandPrimary = ((brandRow?.colors ?? {}) as Record<string, string>).primary ?? (logoAsset ? await dominantColor(logoAsset) : null);
  const hostOf = (u: string) => {
    try {
      return new URL(u).host;
    } catch {
      return null;
    }
  };
  return {
    product,
    productName,
    theme: themeFor(product.kind as never, brandPrimary),
    facts,
    qaFacts: allFacts.map((f) => ({ id: f.id, key: f.factKey, value: f.factValue, verified: Boolean(f.verifiedAt) })),
    prohibited,
    approvedAssets,
    logoAsset,
    logo: logoAsset ? await toImg(logoAsset, 480, 320, `${productName} logo`) : null,
    screenshotAssets: approvedAssets.filter((a) => a.kind === "screenshot"),
    ctaFactValues: facts.filter((f) => f.factKey === "cta").map((f) => f.factValue),
    allowedUrlHosts: [...new Set(facts.filter((f) => ["website_url", "store_url", "cta_url"].includes(f.factKey)).map((f) => hostOf(f.factValue)).filter((h): h is string => Boolean(h)))],
  };
}

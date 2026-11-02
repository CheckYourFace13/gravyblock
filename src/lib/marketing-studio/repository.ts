/**
 * Scoped repository. Every function takes an OwnerScope and resolves the product through it first, so a record can only
 * be read or changed by the scope that owns the product. Nothing here touches any non-ms_ table.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { audit } from "./audit";
import { CAMPAIGN_STATUSES, FACT_SOURCES, PRODUCT_KINDS, type OwnerKind, type ProductKind } from "./config";
import { ms, requireStudioDb, type StudioDb } from "./db";
import { ownershipFor, productVisibility, StudioAccessError, type OwnerScope } from "./scope";

export type Product = typeof ms.msProducts.$inferSelect;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function hashFact(key: string, value: string): string {
  return createHash("sha256").update(`${key}|${value.trim().toLowerCase().replace(/\s+/g, " ")}`).digest("hex").slice(0, 32);
}

function cleanText(v: string, max: number): string {
  // Strip control characters; keep newlines and tabs for multi-line notes.
  return v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

function validPublicUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function listProducts(scope: OwnerScope, db: StudioDb = requireStudioDb()): Promise<Product[]> {
  return db.select().from(ms.msProducts).where(productVisibility(scope)).orderBy(ms.msProducts.name);
}

/** The single gate: returns the product only if this scope owns it, otherwise throws. */
export async function requireProduct(scope: OwnerScope, productId: string, db: StudioDb = requireStudioDb()): Promise<Product> {
  if (!/^[0-9a-f-]{36}$/i.test(productId)) throw new StudioAccessError();
  const [p] = await db.select().from(ms.msProducts).where(and(eq(ms.msProducts.id, productId), productVisibility(scope))).limit(1);
  if (!p) throw new StudioAccessError();
  return p;
}

export async function createProduct(
  scope: OwnerScope,
  actor: string,
  input: { name: string; kind: ProductKind; slug?: string; publicUrl?: string | null; businessId?: string | null; ownerKind?: OwnerKind },
  db: StudioDb = requireStudioDb(),
): Promise<Product> {
  const name = cleanText(input.name, 120);
  if (name.length < 2) throw new Error("Product name is required");
  if (!PRODUCT_KINDS.includes(input.kind)) throw new Error("Unknown product kind");
  const slug = input.slug?.trim() || slugify(name);
  if (!SLUG_RE.test(slug)) throw new Error("Slug must be lowercase letters, numbers and hyphens");
  const own = ownershipFor(scope, input.ownerKind);
  const [row] = await db
    .insert(ms.msProducts)
    .values({
      ...own,
      kind: input.kind,
      name,
      slug,
      publicUrl: validPublicUrl(input.publicUrl),
      businessId: scope.kind === "internal" && input.businessId && /^[0-9a-f-]{36}$/i.test(input.businessId) ? input.businessId : null,
      createdBy: actor,
    })
    .returning();
  await audit(db, { actor, action: "product.create", entity: "product", entityId: row.id, productId: row.id, detail: { kind: row.kind, ownerKind: row.ownerKind } });
  return row;
}

export async function setProductStatus(scope: OwnerScope, actor: string, productId: string, status: "draft" | "active" | "paused" | "archived", db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  await db.update(ms.msProducts).set({ status, updatedAt: new Date() }).where(eq(ms.msProducts.id, productId));
  await audit(db, { actor, action: "product.status", entity: "product", entityId: productId, productId, detail: { status } });
}

/** Soft delete. A purge job (later phase) removes files and rows after the retention window. */
export async function softDeleteProduct(scope: OwnerScope, actor: string, productId: string, db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  await db.update(ms.msProducts).set({ deletedAt: new Date(), status: "archived", updatedAt: new Date() }).where(eq(ms.msProducts.id, productId));
  await audit(db, { actor, action: "product.delete", entity: "product", entityId: productId, productId });
}

// ---- Brand profile -------------------------------------------------------------------------------------------------

export async function getBrandProfile(scope: OwnerScope, productId: string, db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  const [row] = await db.select().from(ms.msBrandProfiles).where(eq(ms.msBrandProfiles.productId, productId)).orderBy(desc(ms.msBrandProfiles.version)).limit(1);
  return row ?? null;
}

export async function saveBrandProfile(
  scope: OwnerScope,
  actor: string,
  productId: string,
  input: { colors?: Record<string, string>; fonts?: Record<string, string>; voiceRules?: string; doNotSay?: string },
  db: StudioDb = requireStudioDb(),
) {
  await requireProduct(scope, productId, db);
  const prev = await getBrandProfile(scope, productId, db);
  const colors: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.colors ?? {})) {
    if (/^#[0-9a-f]{3,8}$/i.test(v) && /^[a-z0-9_]{1,24}$/i.test(k)) colors[k] = v;
  }
  const fonts: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.fonts ?? {})) {
    if (/^[a-z0-9_]{1,24}$/i.test(k)) fonts[k] = cleanText(v, 60);
  }
  const [row] = await db
    .insert(ms.msBrandProfiles)
    .values({
      productId,
      version: (prev?.version ?? 0) + 1,
      colors,
      fonts,
      logoAssetId: prev?.logoAssetId ?? null,
      voiceRules: input.voiceRules ? cleanText(input.voiceRules, 2000) : null,
      doNotSay: input.doNotSay ? cleanText(input.doNotSay, 2000) : null,
    })
    .returning();
  await audit(db, { actor, action: "brand.save", entity: "brand_profile", entityId: row.id, productId, detail: { version: row.version } });
  return row;
}

// ---- Product Truth -------------------------------------------------------------------------------------------------

export async function listFacts(scope: OwnerScope, productId: string, db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  return db.select().from(ms.msProductFacts).where(eq(ms.msProductFacts.productId, productId)).orderBy(ms.msProductFacts.factKey, desc(ms.msProductFacts.createdAt));
}

export async function addFact(
  scope: OwnerScope,
  actor: string,
  productId: string,
  input: { factKey: string; factValue: string; sourceKind: (typeof FACT_SOURCES)[number]; sourceUrl?: string | null; expiresAt?: Date | null },
  db: StudioDb = requireStudioDb(),
) {
  await requireProduct(scope, productId, db);
  const key = input.factKey.trim().toLowerCase();
  if (!/^[a-z0-9_]{2,40}$/.test(key)) throw new Error("Fact key must be lowercase letters, numbers and underscores");
  const value = cleanText(input.factValue, 1000);
  if (!value) throw new Error("Fact value is required");
  if (!FACT_SOURCES.includes(input.sourceKind)) throw new Error("Unknown fact source");
  const contentHash = hashFact(key, value);
  const [dup] = await db
    .select()
    .from(ms.msProductFacts)
    .where(and(eq(ms.msProductFacts.productId, productId), eq(ms.msProductFacts.contentHash, contentHash), eq(ms.msProductFacts.status, "current")))
    .limit(1);
  if (dup) return dup;
  const [row] = await db
    .insert(ms.msProductFacts)
    .values({ productId, factKey: key, factValue: value, sourceKind: input.sourceKind, sourceUrl: validPublicUrl(input.sourceUrl), contentHash, expiresAt: input.expiresAt ?? null })
    .returning();
  await audit(db, { actor, action: "fact.add", entity: "fact", entityId: row.id, productId, detail: { key, sourceKind: input.sourceKind } });
  return row;
}

/** A fact counts as verified only after an operator confirms it. */
export async function verifyFact(scope: OwnerScope, actor: string, productId: string, factId: string, db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  const res = await db
    .update(ms.msProductFacts)
    .set({ verifiedBy: actor, verifiedAt: new Date() })
    .where(and(eq(ms.msProductFacts.id, factId), eq(ms.msProductFacts.productId, productId)))
    .returning({ id: ms.msProductFacts.id });
  if (!res.length) throw new StudioAccessError();
  await audit(db, { actor, action: "fact.verify", entity: "fact", entityId: factId, productId });
}

export async function listClaims(scope: OwnerScope, productId: string, db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  return db.select().from(ms.msClaims).where(eq(ms.msClaims.productId, productId)).orderBy(ms.msClaims.kind, desc(ms.msClaims.createdAt));
}

/** Approved claims must cite at least one VERIFIED, current fact of the same product. Prohibited claims need no facts. */
export async function addClaim(
  scope: OwnerScope,
  actor: string,
  productId: string,
  input: { kind: "approved" | "prohibited"; text: string; factIds?: string[]; rationale?: string },
  db: StudioDb = requireStudioDb(),
) {
  await requireProduct(scope, productId, db);
  const text = cleanText(input.text, 500);
  if (text.length < 3) throw new Error("Claim text is required");
  const factIds = [...new Set(input.factIds ?? [])];
  if (input.kind === "approved") {
    if (factIds.length === 0) throw new Error("An approved claim must cite at least one verified fact");
    const facts = await db.select().from(ms.msProductFacts).where(and(eq(ms.msProductFacts.productId, productId), eq(ms.msProductFacts.status, "current")));
    const usable = new Map(facts.filter((f) => f.verifiedAt).map((f) => [f.id, f]));
    for (const id of factIds) if (!usable.has(id)) throw new Error("Every cited fact must be a verified, current fact of this product");
  }
  const [row] = await db
    .insert(ms.msClaims)
    .values({ productId, kind: input.kind, text, factIds: input.kind === "approved" ? factIds : [], rationale: input.rationale ? cleanText(input.rationale, 500) : null, addedBy: actor })
    .returning();
  await audit(db, { actor, action: "claim.add", entity: "claim", entityId: row.id, productId, detail: { kind: input.kind } });
  return row;
}

export async function removeClaim(scope: OwnerScope, actor: string, productId: string, claimId: string, db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  const res = await db.delete(ms.msClaims).where(and(eq(ms.msClaims.id, claimId), eq(ms.msClaims.productId, productId))).returning({ id: ms.msClaims.id });
  if (!res.length) throw new StudioAccessError();
  await audit(db, { actor, action: "claim.remove", entity: "claim", entityId: claimId, productId });
}

/** The grounding gate later phases use: no verified facts, no generation. */
export async function truthReadiness(scope: OwnerScope, productId: string, db: StudioDb = requireStudioDb()) {
  const facts = await listFacts(scope, productId, db);
  const verified = facts.filter((f) => f.status === "current" && f.verifiedAt);
  const has = (k: string) => verified.some((f) => f.factKey === k);
  const missing = ["product_name", "feature", "website_url"].filter((k) => !has(k) && !(k === "website_url" && has("store_url")));
  return { verifiedFacts: verified.length, ready: missing.length === 0, missing };
}

// ---- Assets (metadata) ---------------------------------------------------------------------------------------------

export async function listAssets(scope: OwnerScope, productId: string, db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  return db.select().from(ms.msAssets).where(eq(ms.msAssets.productId, productId)).orderBy(desc(ms.msAssets.createdAt));
}

export async function approveAsset(scope: OwnerScope, actor: string, productId: string, assetId: string, licenseNote?: string, db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  const res = await db
    .update(ms.msAssets)
    .set({ approved: "true", approvedBy: actor, approvedAt: new Date(), licenseNote: licenseNote ? cleanText(licenseNote, 300) : null })
    .where(and(eq(ms.msAssets.id, assetId), eq(ms.msAssets.productId, productId)))
    .returning({ id: ms.msAssets.id });
  if (!res.length) throw new StudioAccessError();
  await audit(db, { actor, action: "asset.approve", entity: "asset", entityId: assetId, productId });
}

// ---- Campaigns (records only) --------------------------------------------------------------------------------------

export async function listCampaigns(scope: OwnerScope, productId: string, db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  return db.select().from(ms.msCampaigns).where(eq(ms.msCampaigns.productId, productId)).orderBy(desc(ms.msCampaigns.createdAt));
}

export async function createCampaign(
  scope: OwnerScope,
  actor: string,
  productId: string,
  input: { name: string; objective: string; audience?: string; channels?: string[]; automationLevel?: number; notes?: string },
  db: StudioDb = requireStudioDb(),
) {
  await requireProduct(scope, productId, db);
  const name = cleanText(input.name, 120);
  const objective = cleanText(input.objective, 500);
  if (name.length < 2 || objective.length < 3) throw new Error("Campaign name and objective are required");
  // Level 3 (bounded autopilot) is not enabled in Phase 1.
  const level = input.automationLevel === 2 ? 2 : 1;
  const channels = (input.channels ?? []).filter((c) => ["youtube", "facebook", "instagram", "tiktok"].includes(c));
  const [row] = await db
    .insert(ms.msCampaigns)
    .values({ productId, name, objective, audience: input.audience ? cleanText(input.audience, 300) : null, channels, automationLevel: level, notes: input.notes ? cleanText(input.notes, 2000) : null, createdBy: actor })
    .returning();
  await audit(db, { actor, action: "campaign.create", entity: "campaign", entityId: row.id, productId, detail: { level } });
  return row;
}

export async function setCampaignStatus(scope: OwnerScope, actor: string, productId: string, campaignId: string, status: (typeof CAMPAIGN_STATUSES)[number], db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  if (!CAMPAIGN_STATUSES.includes(status)) throw new Error("Unknown campaign status");
  // Nothing publishes in Phase 1, so a campaign cannot enter a publishing state.
  if (status === "scheduled" || status === "live") throw new Error("Scheduling and publishing are not enabled in this phase");
  const res = await db
    .update(ms.msCampaigns)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(ms.msCampaigns.id, campaignId), eq(ms.msCampaigns.productId, productId)))
    .returning({ id: ms.msCampaigns.id });
  if (!res.length) throw new StudioAccessError();
  await audit(db, { actor, action: "campaign.status", entity: "campaign", entityId: campaignId, productId, detail: { status } });
}

export async function productCounts(scope: OwnerScope, productId: string, db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  const one = async (t: typeof ms.msProductFacts | typeof ms.msAssets | typeof ms.msCampaigns | typeof ms.msClaims) => {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(t).where(eq(t.productId, productId));
    return r?.n ?? 0;
  };
  return { facts: await one(ms.msProductFacts), claims: await one(ms.msClaims), assets: await one(ms.msAssets), campaigns: await one(ms.msCampaigns) };
}

/**
 * Publishing queue. Every publication starts as APPROVAL REQUIRED. A direct post happens only if ALL of these hold at the moment of
 * posting: the Studio is enabled and not killed, the global live-publishing setting is on (default off), the publication is approved
 * and scheduled and due, the platform allows direct posting (or an operator attested its review passed), the connection is healthy,
 * the per-platform daily cap has room, and this process won the compare-and-swap claim (so a post can never be sent twice).
 * Export bundles need none of the connection pieces and never post anything.
 */
import { promises as fs } from "node:fs";
import { and, eq, gt, inArray, lte, ne, sql } from "drizzle-orm";
import { audit } from "../audit";
import { STUDIO_DIRS } from "../config";
import { ms, requireStudioDb, type StudioDb } from "../db";
import { requireProduct } from "../repository";
import { backoffMs, disableState, getSetting } from "../runtime";
import type { OwnerScope } from "../scope";
import { StudioAccessError } from "../scope";
import { safeJoin } from "../storage";
import { ADAPTERS, type Deps } from "./adapters";
import { evaluateHealth, tokensForPublish, usable } from "./connections";
import { buildExportBundle } from "./export";
import { formatPayload, specFor, validateForPlatform, type MediaInfo } from "./platforms";

export type Publication = typeof ms.msPublications.$inferSelect;

/** Minimum gap between two posts to the same platform for one product. */
export const MIN_GAP_MS = 30 * 60_000;

export const LIVE_SETTING = "publishing_live_enabled";
export const approvedSetting = (platform: string) => `platform_approved_${platform}`;

async function mediaFor(db: StudioDb, p: { creativeId?: string | null; videoId?: string | null }, productId: string) {
  if (p.creativeId) {
    const [c] = await db.select().from(ms.msCreatives).where(and(eq(ms.msCreatives.id, p.creativeId), eq(ms.msCreatives.productId, productId))).limit(1);
    if (!c || !c.assetId) throw new Error("Creative not found or not rendered");
    if (c.status !== "approved") throw new Error("Only an approved creative can be published or exported");
    const [a] = await db.select().from(ms.msAssets).where(eq(ms.msAssets.id, c.assetId)).limit(1);
    if (!a) throw new Error("Creative asset is missing");
    return { asset: a, info: { kind: "image", width: a.width ?? c.width, height: a.height ?? c.height } as MediaInfo, conceptId: c.conceptId };
  }
  if (p.videoId) {
    const [v] = await db.select().from(ms.msVideos).where(and(eq(ms.msVideos.id, p.videoId), eq(ms.msVideos.productId, productId))).limit(1);
    if (!v || !v.assetId) throw new Error("Video not found or not rendered");
    if (v.status !== "approved") throw new Error("Only an approved video can be published or exported");
    const [a] = await db.select().from(ms.msAssets).where(eq(ms.msAssets.id, v.assetId)).limit(1);
    if (!a) throw new Error("Video asset is missing");
    return { asset: a, info: { kind: "video", width: v.width ?? 1080, height: v.height ?? 1920, durationSec: (v.durationMs ?? 0) / 1000 } as MediaInfo, conceptId: v.conceptId };
  }
  throw new Error("Choose a creative or a video");
}

/** Why a direct post is or is not possible right now. An empty list means it is allowed (the live setting is checked separately). */
export function directBlockers(platform: string, conn: { status: string; revokedAt: Date | null; tokenExpiresAt: Date | null; healthStatus: string; scopes: unknown } | null, attestedApproved: boolean, now = new Date()): string[] {
  const spec = specFor(platform);
  if (!spec) return ["unknown platform"];
  const out: string[] = [];
  if (spec.direct === "manual_only") out.push(`${spec.label} has no usable official direct path`);
  if (spec.direct === "requires_platform_approval" && !attestedApproved) out.push(`${spec.label} direct posting requires platform approval that has not been attested (${spec.approvalNote})`);
  if (!conn) out.push("no connected account");
  else {
    const h = evaluateHealth(conn, now);
    if (!usable(h)) out.push(`the connection is ${h}`);
    const have = (conn.scopes as string[]) ?? [];
    const missing = spec.auth.requiredScopes.filter((s) => !have.includes(s));
    if (missing.length) out.push(`the connection lacks scopes: ${missing.join(", ")}`);
  }
  return out;
}

export async function createPublication(
  scope: OwnerScope,
  actor: string,
  productId: string,
  input: { creativeId?: string; videoId?: string; platform: string; mode?: "direct" | "export"; connectionId?: string | null; caption?: string; title?: string | null; maxAttempts?: number },
  db: StudioDb = requireStudioDb(),
): Promise<{ publication: Publication; duplicate: boolean }> {
  await requireProduct(scope, productId, db);
  const spec = specFor(input.platform);
  if (!spec) throw new Error("Unknown platform");
  const { asset, info, conceptId } = await mediaFor(db, input, productId);
  const [concept] = conceptId ? await db.select().from(ms.msConcepts).where(eq(ms.msConcepts.id, conceptId)).limit(1) : [];
  const caption = (input.caption ?? concept?.caption ?? "").trim();
  const title = input.title ?? (spec.needsTitle ? concept?.headline ?? null : null);
  const problems = validateForPlatform(input.platform, info, { caption, title, ctaUrl: concept?.ctaUrl });
  if (problems.length) throw new Error(`Cannot prepare this for ${spec.label}: ${problems.join("; ")}`);

  let connectionId: string | null = null;
  let mode: "direct" | "export" = input.mode ?? "export";
  if (mode === "direct") {
    // Platform approval comes first, so the operator is told to export instead of being told about a connection that could never help.
    const attestedFirst = await getSetting<boolean>(approvedSetting(input.platform), false, db);
    if (spec.direct !== "available_with_healthy_connection" && !attestedFirst) throw new Error(`Direct posting is not available: ${spec.approvalNote} Use an export bundle instead.`);
    if (!input.connectionId) throw new Error("A direct post needs a connection; use an export bundle if none is connected");
    const [conn] = await db.select().from(ms.msConnections).where(and(eq(ms.msConnections.id, input.connectionId), eq(ms.msConnections.productId, productId), eq(ms.msConnections.platform, input.platform))).limit(1);
    if (!conn) throw new StudioAccessError();
    const attested = await getSetting<boolean>(approvedSetting(input.platform), false, db);
    const blockers = directBlockers(input.platform, conn, attested);
    if (blockers.length) throw new Error(`Direct posting is not available: ${blockers.join("; ")}. Use an export bundle instead.`);
    connectionId = conn.id;
  } else mode = "export";

  const dedupeKey = `${productId}|${input.platform}|${asset.id}|${connectionId ?? "export"}`;
  // A cancelled or revoked item may be queued again; the old row keeps its history under an archived key. Anything else is a duplicate.
  await db.execute(sql`update ms_publications set dedupe_key = dedupe_key || '|archived|' || id::text where dedupe_key = ${dedupeKey} and status in ('cancelled', 'revoked')`);
  const [row] = await db
    .insert(ms.msPublications)
    .values({
      productId,
      conceptId: conceptId ?? null,
      campaignId: concept?.campaignId ?? null,
      creativeId: input.creativeId ?? null,
      videoId: input.videoId ?? null,
      assetId: asset.id,
      connectionId,
      platform: input.platform,
      mode,
      status: "approval_required",
      title,
      caption,
      ctaText: concept?.ctaText ?? null,
      ctaUrl: concept?.ctaUrl ?? null,
      formatted: formatPayload(input.platform, info, { caption, title }),
      dedupeKey,
      maxAttempts: input.maxAttempts ?? 3,
      createdBy: actor,
    })
    .onConflictDoNothing({ target: ms.msPublications.dedupeKey })
    .returning();
  if (!row) {
    const [existing] = await db.select().from(ms.msPublications).where(eq(ms.msPublications.dedupeKey, dedupeKey)).limit(1);
    return { publication: existing, duplicate: true };
  }
  await audit(db, { actor, action: "publication.create", entity: "publication", entityId: row.id, productId, detail: { platform: input.platform, mode } });
  return { publication: row, duplicate: false };
}

async function load(db: StudioDb, scope: OwnerScope, productId: string, id: string): Promise<Publication> {
  await requireProduct(scope, productId, db);
  const [p] = await db.select().from(ms.msPublications).where(and(eq(ms.msPublications.id, id), eq(ms.msPublications.productId, productId))).limit(1);
  if (!p) throw new StudioAccessError();
  return p;
}

export async function approvePublication(scope: OwnerScope, actor: string, productId: string, id: string, db: StudioDb = requireStudioDb()) {
  const p = await load(db, scope, productId, id);
  if (p.status !== "approval_required" && p.status !== "draft") throw new Error(`A publication in state ${p.status} cannot be approved`);
  const res = await db.update(ms.msPublications).set({ status: "approved", approvedBy: actor, approvedAt: new Date(), updatedAt: new Date() }).where(and(eq(ms.msPublications.id, id), inArray(ms.msPublications.status, ["approval_required", "draft"]))).returning({ id: ms.msPublications.id });
  if (!res.length) throw new Error("This publication changed while approving; reload and try again");
  await audit(db, { actor, action: "publication.approve", entity: "publication", entityId: id, productId });
}

export async function schedulePublication(scope: OwnerScope, actor: string, productId: string, id: string, when: Date, db: StudioDb = requireStudioDb()) {
  const p = await load(db, scope, productId, id);
  if (p.status !== "approved") throw new Error("Only an approved publication can be scheduled");
  if (p.mode !== "direct") throw new Error("Export publications are downloaded, not scheduled");
  if (Number.isNaN(when.getTime())) throw new Error("Invalid time");
  const lo = new Date(when.getTime() - MIN_GAP_MS);
  const hi = new Date(when.getTime() + MIN_GAP_MS);
  const clash = await db
    .select({ id: ms.msPublications.id })
    .from(ms.msPublications)
    .where(and(eq(ms.msPublications.productId, productId), eq(ms.msPublications.platform, p.platform), ne(ms.msPublications.id, id), inArray(ms.msPublications.status, ["scheduled", "publishing"]), gt(ms.msPublications.scheduledFor, lo), lte(ms.msPublications.scheduledFor, hi)));
  if (clash.length) throw new Error(`Schedule conflict: another ${p.platform} post for this product is within ${MIN_GAP_MS / 60000} minutes of that time`);
  const res = await db.update(ms.msPublications).set({ status: "scheduled", scheduledFor: when, nextAttemptAt: when, updatedAt: new Date() }).where(and(eq(ms.msPublications.id, id), eq(ms.msPublications.status, "approved"))).returning({ id: ms.msPublications.id });
  if (!res.length) throw new Error("This publication changed while scheduling; reload and try again");
  await audit(db, { actor, action: "publication.schedule", entity: "publication", entityId: id, productId, detail: { when: when.toISOString() } });
}

export async function cancelPublication(scope: OwnerScope, actor: string, productId: string, id: string, db: StudioDb = requireStudioDb()) {
  const p = await load(db, scope, productId, id);
  if (["published", "publishing", "deleted"].includes(p.status)) throw new Error(`A ${p.status} publication cannot be cancelled`);
  await db.update(ms.msPublications).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(ms.msPublications.id, id), ne(ms.msPublications.status, "publishing")));
  await audit(db, { actor, action: "publication.cancel", entity: "publication", entityId: id, productId });
}

/** Builds the manual-upload bundle. Allowed for any approved publication, including direct ones that cannot post yet. Posts nothing. */
export async function exportPublication(scope: OwnerScope, actor: string, productId: string, id: string, db: StudioDb = requireStudioDb()) {
  const p = await load(db, scope, productId, id);
  if (!["approved", "scheduled", "exported"].includes(p.status)) throw new Error("Approve the publication before exporting it");
  const product = await requireProduct(scope, productId, db);
  const [asset] = await db.select().from(ms.msAssets).where(eq(ms.msAssets.id, p.assetId)).limit(1);
  if (!asset) throw new Error("The media file is missing");
  const [video] = p.videoId ? await db.select().from(ms.msVideos).where(eq(ms.msVideos.id, p.videoId)).limit(1) : [];
  const bundle = await buildExportBundle({
    productName: product.name,
    productSlug: product.slug,
    publicationId: p.id,
    platform: p.platform,
    mode: p.mode,
    media: { storagePath: asset.storagePath, mime: asset.mimeType, kind: asset.mimeType === "video/mp4" ? "video" : "image", width: asset.width ?? 0, height: asset.height ?? 0, durationSec: video?.durationMs ? video.durationMs / 1000 : null },
    caption: p.caption,
    title: p.title,
    ctaText: p.ctaText,
    ctaUrl: p.ctaUrl,
    scheduledFor: p.scheduledFor,
  });
  if (p.mode === "export" && p.status !== "exported") await db.update(ms.msPublications).set({ status: "exported", updatedAt: new Date() }).where(eq(ms.msPublications.id, id));
  await audit(db, { actor, action: "publication.export", entity: "publication", entityId: id, productId, detail: { platform: p.platform, bytes: bundle.zip.length } });
  return bundle;
}

/** Records that a post was removed (remote deletion when the platform allows it, otherwise the operator's manual deletion). */
export async function markPublicationDeleted(scope: OwnerScope, actor: string, productId: string, id: string, db: StudioDb = requireStudioDb()) {
  const p = await load(db, scope, productId, id);
  if (p.status !== "published" && p.status !== "exported") throw new Error("Only a published or exported item can be marked deleted");
  await db.update(ms.msPublications).set({ status: "deleted", remoteDeletedAt: new Date(), updatedAt: new Date() }).where(eq(ms.msPublications.id, id));
  await audit(db, { actor, action: "publication.deleted", entity: "publication", entityId: id, productId });
}

export async function listPublications(scope: OwnerScope, productId: string, db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  return db.select().from(ms.msPublications).where(eq(ms.msPublications.productId, productId)).orderBy(ms.msPublications.scheduledFor, ms.msPublications.createdAt);
}

export type DueResult = { skipped?: string; attempted: number; published: number; retried: number; failed: number; blocked: number };

/**
 * Sends due direct publications. With live publishing off (the default) it does nothing at all: no query results are acted on and no
 * network call is made. `deps.fetch` is injectable so tests can prove exactly what would be sent.
 */
export async function runDuePublications(scope: OwnerScope, deps: Deps = { fetch }, db: StudioDb = requireStudioDb(), now = new Date()): Promise<DueResult> {
  const res: DueResult = { attempted: 0, published: 0, retried: 0, failed: 0, blocked: 0 };
  const dis = await disableState(db);
  if (dis.disabled) return { ...res, skipped: `studio disabled: ${dis.reasons.join("; ")}` };
  if (!(await getSetting<boolean>(LIVE_SETTING, false, db))) return { ...res, skipped: "live publishing is off" };

  const due = await db
    .select()
    .from(ms.msPublications)
    .where(and(eq(ms.msPublications.status, "scheduled"), eq(ms.msPublications.mode, "direct"), lte(ms.msPublications.nextAttemptAt, now)))
    .limit(3);
  for (const candidate of due) {
    // Compare-and-swap claim: exactly one runner can move this row from scheduled to publishing.
    const claimed = await db
      .update(ms.msPublications)
      .set({ status: "publishing", attempts: sql`${ms.msPublications.attempts} + 1`, updatedAt: new Date() })
      .where(and(eq(ms.msPublications.id, candidate.id), eq(ms.msPublications.status, "scheduled")))
      .returning();
    if (!claimed.length) continue;
    const p = claimed[0];
    res.attempted++;
    const finish = async (set: Partial<typeof ms.msPublications.$inferInsert>, event: string, detail: Record<string, unknown>) => {
      await db.update(ms.msPublications).set({ ...set, updatedAt: new Date() }).where(eq(ms.msPublications.id, p.id));
      await audit(db, { actor: "studio-worker", action: event, entity: "publication", entityId: p.id, productId: p.productId, detail });
    };
    try {
      // Gate: connection, platform approval, tenant, daily cap.
      const [conn] = p.connectionId ? await db.select().from(ms.msConnections).where(and(eq(ms.msConnections.id, p.connectionId), eq(ms.msConnections.productId, p.productId))).limit(1) : [];
      const attested = await getSetting<boolean>(approvedSetting(p.platform), false, db);
      const blockers = directBlockers(p.platform, conn ?? null, attested, now);
      const spec = specFor(p.platform)!;
      const since = new Date(now.getTime() - 24 * 3_600_000);
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(ms.msPublications).where(and(eq(ms.msPublications.platform, p.platform), eq(ms.msPublications.productId, p.productId), eq(ms.msPublications.status, "published"), gt(ms.msPublications.publishedAt, since)));
      if (n >= spec.rateLimit.ourCap24h) blockers.push(`daily cap of ${spec.rateLimit.ourCap24h} posts reached`);
      if (blockers.length) {
        res.blocked++;
        await finish({ status: "failed", failureReason: `Blocked before sending: ${blockers.join("; ")}` }, "publication.blocked", { blockers });
        continue;
      }
      const tokens = await tokensForPublish(scope, "studio-worker", p.productId, conn!.id, db);
      const [asset] = await db.select().from(ms.msAssets).where(eq(ms.msAssets.id, p.assetId)).limit(1);
      const bytes = await fs.readFile(safeJoin(STUDIO_DIRS.media, ...asset.storagePath.split("/")));
      const out = await ADAPTERS[p.platform as keyof typeof ADAPTERS].publish(
        { platform: p.platform as never, externalAccountId: conn!.externalAccountId ?? "", media: { kind: asset.mimeType === "video/mp4" ? "video" : "image", bytes, mime: asset.mimeType, fileName: `${p.id}.${asset.mimeType === "video/mp4" ? "mp4" : "png"}` }, caption: p.caption, title: p.title, accessToken: tokens.accessToken },
        deps,
      );
      if (out.ok) {
        res.published++;
        await finish({ status: "published", externalPostId: out.externalId, externalUrl: out.url ?? null, publishedAt: new Date(), failureReason: null }, "publication.published", { externalId: out.externalId });
      } else if (out.authFailure) {
        res.failed++;
        await db.update(ms.msConnections).set({ healthStatus: "error", status: "error", healthDetail: out.reason.slice(0, 300) }).where(eq(ms.msConnections.id, conn!.id));
        await finish({ status: "failed", failureReason: out.reason.slice(0, 500) }, "publication.failed", { reason: out.reason, authFailure: true });
      } else if (out.retryable && p.attempts < p.maxAttempts) {
        res.retried++;
        const wait = backoffMs(p.attempts);
        await finish({ status: "scheduled", nextAttemptAt: new Date(now.getTime() + wait), failureReason: out.reason.slice(0, 500) }, "publication.retry", { reason: out.reason, inMs: wait });
      } else {
        res.failed++;
        await finish({ status: "failed", failureReason: out.reason.slice(0, 500) }, "publication.failed", { reason: out.reason });
      }
    } catch (e) {
      res.failed++;
      await finish({ status: "failed", failureReason: (e instanceof Error ? e.message : String(e)).slice(0, 500) }, "publication.failed", { error: true });
    }
  }
  return res;
}

export async function publicationCounts(db: StudioDb = requireStudioDb()) {
  const rows = await db.select({ status: ms.msPublications.status, n: sql<number>`count(*)::int` }).from(ms.msPublications).groupBy(ms.msPublications.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

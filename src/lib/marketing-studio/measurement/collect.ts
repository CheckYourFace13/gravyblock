/**
 * Collects and stores measurement for published Studio posts. Read-only toward the platform, writes only ms_ tables, and never
 * runs when the studio is disabled. A failed collection is recorded as UNKNOWN metrics, not as zeros, and an auth failure marks the
 * connection unhealthy exactly as a failed publish would.
 */
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { audit } from "../audit";
import { ms, requireStudioDb, type StudioDb } from "../db";
import { disableState } from "../runtime";
import { StudioAccessError, type OwnerScope } from "../scope";
import { requireProduct } from "../repository";
import type { Deps } from "../publishing/adapters";
import { evaluateHealth, tokensForPublish, usable } from "../publishing/connections";
import { youtubeTokensForCall } from "../publishing/oauth-youtube";
import { collectYoutubeCounts } from "../publishing/youtube-api";
import { collectFacebookMetrics } from "./facebook-insights";
import { completeSet, confirmed, estimated, mergeSets, unknown, type Metric, type MetricKey, type MetricSet } from "./metrics";

export type Snapshot = typeof ms.msPublicationMetrics.$inferSelect;

export async function recordSnapshot(db: StudioDb, publicationId: string, productId: string, source: "facebook_graph" | "youtube_data_api" | "attribution" | "manual", set: MetricSet): Promise<Snapshot> {
  const [row] = await db.insert(ms.msPublicationMetrics).values({ publicationId, productId, source, metrics: completeSet(set) }).returning();
  return row;
}

/** The merged view of every snapshot of one publication: newest confirmed value per metric. */
export async function currentMetrics(db: StudioDb, publicationId: string) {
  const rows = await db.select().from(ms.msPublicationMetrics).where(eq(ms.msPublicationMetrics.publicationId, publicationId)).orderBy(ms.msPublicationMetrics.collectedAt);
  return { snapshots: rows.length, metrics: mergeSets(rows.map((r) => r.metrics as MetricSet)), lastCollectedAt: rows.length ? rows[rows.length - 1].collectedAt : null };
}

export type CollectResult = { collected: boolean; reason?: string; unknownMetrics: string[]; snapshotId?: string };

export async function collectForPublication(scope: OwnerScope, actor: string, productId: string, publicationId: string, deps: Deps = { fetch }, db: StudioDb = requireStudioDb()): Promise<CollectResult> {
  await requireProduct(scope, productId, db);
  const [p] = await db.select().from(ms.msPublications).where(and(eq(ms.msPublications.id, publicationId), eq(ms.msPublications.productId, productId))).limit(1);
  if (!p) throw new StudioAccessError();
  if (p.status !== "published" || !p.externalPostId) return { collected: false, reason: "only a published post has measurements", unknownMetrics: [] };
  if (p.platform !== "facebook" && p.platform !== "youtube") return { collected: false, reason: `${p.platform} measurement is not available until direct publishing for it is approved`, unknownMetrics: [] };
  const [conn] = p.connectionId ? await db.select().from(ms.msConnections).where(and(eq(ms.msConnections.id, p.connectionId), eq(ms.msConnections.productId, productId))).limit(1) : [];
  if (!conn) return { collected: false, reason: "no connection", unknownMetrics: [] };
  const h = evaluateHealth(conn);
  if (!usable(h)) return { collected: false, reason: `connection is ${h}`, unknownMetrics: [] };
  if (p.platform === "youtube") {
    const t = await youtubeTokensForCall(scope, actor, productId, conn.id, deps, db);
    const yt = await collectYoutubeCounts({ videoId: p.externalPostId, accessToken: t.accessToken }, deps);
    if (yt.authFailure) await db.update(ms.msConnections).set({ healthStatus: "error", status: "error", healthDetail: "YouTube rejected the token while collecting metrics." }).where(eq(ms.msConnections.id, conn.id));
    const why = yt.detail[0] ?? "not reported by YouTube";
    const set: MetricSet = {
      views: yt.views !== null ? confirmed(yt.views) : unknown(why),
      reactions: yt.likes !== null ? confirmed(yt.likes, "likes (YouTube has no other reactions)") : unknown(why),
      comments: yt.comments !== null ? confirmed(yt.comments) : unknown(why),
    };
    const snap = await recordSnapshot(db, p.id, productId, "youtube_data_api", set);
    const full = completeSet(set);
    const unknownMetrics = (Object.keys(full) as MetricKey[]).filter((k) => full[k].status === "unknown");
    await audit(db, { actor, action: "metrics.collect", entity: "publication", entityId: p.id, productId, detail: { platform: "youtube", unknown: unknownMetrics.length, problems: yt.detail.slice(0, 4) } });
    return { collected: true, unknownMetrics, snapshotId: snap.id };
  }
  const [asset] = await db.select({ mimeType: ms.msAssets.mimeType }).from(ms.msAssets).where(eq(ms.msAssets.id, p.assetId)).limit(1);
  const tokens = await tokensForPublish(scope, actor, productId, conn.id, db);
  const out = await collectFacebookMetrics({ externalId: p.externalPostId, kind: asset?.mimeType === "video/mp4" ? "video" : "image", accessToken: tokens.accessToken }, deps);
  if (out.authFailure) await db.update(ms.msConnections).set({ healthStatus: "error", status: "error", healthDetail: "Facebook rejected the token while collecting metrics." }).where(eq(ms.msConnections.id, conn.id));
  const snap = await recordSnapshot(db, p.id, productId, "facebook_graph", out.metrics);
  const full = completeSet(out.metrics);
  const unknownMetrics = (Object.keys(full) as MetricKey[]).filter((k) => full[k].status === "unknown");
  await audit(db, { actor, action: "metrics.collect", entity: "publication", entityId: p.id, productId, detail: { unknown: unknownMetrics.length, problems: out.detail.slice(0, 6) } });
  return { collected: true, unknownMetrics, snapshotId: snap.id };
}

const SIX_HOURS = 6 * 3_600_000;
const THIRTY_DAYS = 30 * 86_400_000;

/** Worker entry: refresh the oldest-measured published posts of the last 30 days, a few per pass. */
export async function collectDueMetrics(scope: OwnerScope, deps: Deps = { fetch }, db: StudioDb = requireStudioDb(), now = new Date()): Promise<{ checked: number; collected: number; skipped?: string }> {
  const dis = await disableState(db);
  if (dis.disabled) return { checked: 0, collected: 0, skipped: `studio disabled: ${dis.reasons.join("; ")}` };
  const pubs = await db
    .select()
    .from(ms.msPublications)
    .where(and(eq(ms.msPublications.status, "published"), inArray(ms.msPublications.platform, ["facebook", "youtube"]), gt(ms.msPublications.publishedAt, new Date(now.getTime() - THIRTY_DAYS))))
    .orderBy(desc(ms.msPublications.publishedAt))
    .limit(25);
  if (!pubs.length) return { checked: 0, collected: 0 };
  const last = await db.select({ publicationId: ms.msPublicationMetrics.publicationId, at: ms.msPublicationMetrics.collectedAt }).from(ms.msPublicationMetrics).where(and(inArray(ms.msPublicationMetrics.publicationId, pubs.map((p) => p.id)), inArray(ms.msPublicationMetrics.source, ["facebook_graph", "youtube_data_api"])));
  const newest = new Map<string, number>();
  for (const r of last) newest.set(r.publicationId, Math.max(newest.get(r.publicationId) ?? 0, r.at.getTime()));
  const due = pubs.filter((p) => now.getTime() - (newest.get(p.id) ?? 0) >= SIX_HOURS).slice(0, 5);
  let collected = 0;
  for (const p of due) {
    try {
      const r = await collectForPublication(scope, "studio-worker", p.productId, p.id, deps, db);
      if (r.collected) collected++;
    } catch {
      /* one bad post must not stop the others; the failure shows as a missing snapshot */
    }
  }
  return { checked: due.length, collected };
}

/**
 * Attribution: site or app visits and signups are only ever recorded as ESTIMATED, because a tagged link is correlation, not proof that the
 * post caused the visit. `source` names where the count came from (for example a first-party counter keyed on the utm_id).
 */
export async function recordAttributedActivity(db: StudioDb, publicationId: string, productId: string, input: { visits?: number; conversions?: number; source: string }): Promise<Snapshot> {
  const set: MetricSet = {};
  const note = `${input.source}: matched by the post's tagged link; correlation, not proof of causation`;
  if (typeof input.visits === "number") set.site_visits = estimated(input.visits, note) as Metric;
  if (typeof input.conversions === "number") set.conversions = estimated(input.conversions, note) as Metric;
  return recordSnapshot(db, publicationId, productId, "attribution", set);
}

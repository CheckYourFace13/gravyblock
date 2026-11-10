/**
 * Storage lifecycle (owner directive 2026-11-10): the VPS disk holds working files, never permanent media.
 *   TEMP          frames, screenshots, temporary audio, intermediate captures: removed after a short retention (storage.ts cleanupTmp, and the capture folders here).
 *   FAILED        a render that failed QA or errored: its file goes after a day.
 *   SUPERSEDED    an older review version: kept three days for rollback and review history, then the large file goes.
 *   PUBLISHED     when the canonical copy lives on YouTube or the customer's platform, the VPS copy is redundant: it goes after seven days. A copy hosted on object storage
 *                 leaves the VPS a day after its upload is verified.
 *   KEPT          metadata, transcript, script, thumbnail, publication ids and performance history are database records and are never purged here.
 * A file shared by several video records (a clean replacement reuses the render) is only purged when NO record that still needs it points at it.
 * Per tenant it tracks bytes, retained and temporary assets and the next purge date, and raises an alert before a tenant reaches its quota.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { and, eq, inArray, like } from "drizzle-orm";
import { audit } from "../audit";
import { LIMITS, STUDIO_DIRS } from "../config";
import { ms, type StudioDb } from "../db";
import { getSetting, setSetting } from "../runtime";
import { safeJoin } from "../storage";

const DAY = 86_400_000;
export const RETENTION_DAYS = { failed: 1, superseded: 3, published: 7, hostedAfterUpload: 1, captures: 3 } as const;
export const QUOTA_WARN_SHARE = 0.8;

export type LifecycleVideo = { id: string; assetId: string | null; status: string; createdAt: number; bytes: number; /** went live (or unlisted) on YouTube or another platform */ onPlatform: boolean; /** verified copy on object storage */ onObjectStore: boolean };
export type PurgeAction = { assetId: string; bytes: number; reason: "failed" | "superseded" | "published" | "hosted"; videoIds: string[] };

const NEEDS_FILE = new Set(["queued", "rendering", "ready_for_review"]);
/** Pure: which asset files may be purged now. An asset is purged only when every record that points at it is purgeable. */
export function planPurge(videos: LifecycleVideo[], now: number): { actions: PurgeAction[]; keep: Array<{ assetId: string; nextPurgeAt: number }> } {
  const byAsset = new Map<string, LifecycleVideo[]>();
  for (const v of videos) if (v.assetId) byAsset.set(v.assetId, [...(byAsset.get(v.assetId) ?? []), v]);
  const actions: PurgeAction[] = [];
  const keep: Array<{ assetId: string; nextPurgeAt: number }> = [];
  for (const [assetId, vs] of byAsset) {
    const due = (v: LifecycleVideo): { at: number; reason: PurgeAction["reason"] } | null => {
      if (NEEDS_FILE.has(v.status) && !v.onObjectStore) return null; // still to be uploaded
      if (v.onObjectStore) return { at: v.createdAt + RETENTION_DAYS.hostedAfterUpload * DAY, reason: "hosted" };
      if (v.status === "failed" || v.status === "qa_failed") return { at: v.createdAt + RETENTION_DAYS.failed * DAY, reason: "failed" };
      if (v.status === "superseded") return { at: v.createdAt + RETENTION_DAYS.superseded * DAY, reason: "superseded" };
      if (v.onPlatform) return { at: v.createdAt + RETENTION_DAYS.published * DAY, reason: "published" };
      return null; // approved and not yet on any platform: the file is the only copy
    };
    const ds = vs.map(due);
    if (ds.some((d) => d === null)) continue;
    const latest = Math.max(...(ds as Array<{ at: number }>).map((d) => d.at));
    if (latest <= now) actions.push({ assetId, bytes: Math.max(...vs.map((v) => v.bytes)), reason: (ds[0] as { reason: PurgeAction["reason"] }).reason, videoIds: vs.map((v) => v.id) });
    else keep.push({ assetId, nextPurgeAt: latest });
  }
  return { actions, keep };
}

export type TenantLedger = { bytes: number; retainedAssets: number; temporaryBytes: number; nextPurgeAt: string | null; quotaBytes: number; alert: boolean };

async function dirBytes(p: string): Promise<number> {
  let n = 0;
  for (const e of await fs.readdir(p, { withFileTypes: true }).catch(() => [])) {
    const f = path.join(p, e.name);
    n += e.isDirectory() ? await dirBytes(f) : (await fs.stat(f).catch(() => null))?.size ?? 0;
  }
  return n;
}

/** Removes old working folders under captures/<product>/. A render that is running keeps a fresh one, so only entries older than the retention go. */
export async function purgeCaptures(now = Date.now(), days: number = RETENTION_DAYS.captures): Promise<{ removed: number; bytes: number }> {
  const root = path.join(STUDIO_DIRS.root, "captures");
  let removed = 0;
  let bytes = 0;
  for (const prod of await fs.readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!prod.isDirectory()) continue;
    for (const e of await fs.readdir(path.join(root, prod.name), { withFileTypes: true }).catch(() => [])) {
      const p = path.join(root, prod.name, e.name);
      const st = await fs.stat(p).catch(() => null);
      if (!st || now - st.mtimeMs < days * DAY) continue;
      bytes += e.isDirectory() ? await dirBytes(p) : st.size;
      await fs.rm(p, { recursive: true, force: true }).catch(() => undefined);
      removed++;
    }
  }
  return { removed, bytes };
}

export async function runLifecycle(db: StudioDb, now = Date.now(), opts: { dryRun?: boolean } = {}) {
  const videos = await db.select().from(ms.msVideos).where(inArray(ms.msVideos.status, ["queued", "rendering", "ready_for_review", "approved", "superseded", "failed", "qa_failed"]));
  const pubs = await db.select({ videoId: ms.msPublications.videoId, status: ms.msPublications.status }).from(ms.msPublications).where(eq(ms.msPublications.platform, "youtube"));
  const onPlatform = new Set(pubs.filter((p) => p.status === "published" && p.videoId).map((p) => p.videoId as string));
  const canon = await db.select({ key: ms.msSettings.key, value: ms.msSettings.value }).from(ms.msSettings).where(like(ms.msSettings.key, "video_canonical_for_%"));
  const hosted = new Set<string>();
  for (const c of canon) {
    const rec = await getSetting<{ providers?: Array<{ kind: string }> } | null>(`video_canonical_${String(c.value)}`, null, db);
    if (rec?.providers?.some((p) => p.kind === "object")) hosted.add(c.key.replace("video_canonical_for_", ""));
  }
  const assets = await db.select().from(ms.msAssets).where(eq(ms.msAssets.kind, "render_video"));
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const lv: LifecycleVideo[] = videos.filter((v) => v.assetId && assetById.has(v.assetId) && !assetById.get(v.assetId)!.storagePath.startsWith("purged/")).map((v) => ({ id: v.id, assetId: v.assetId, status: v.status, createdAt: v.createdAt.getTime(), bytes: assetById.get(v.assetId as string)!.bytes, onPlatform: onPlatform.has(v.id), onObjectStore: hosted.has(v.id) }));
  const plan = planPurge(lv, now);
  let purgedBytes = 0;
  const done: PurgeAction[] = [];
  for (const a of plan.actions) {
    const asset = assetById.get(a.assetId)!;
    if (opts.dryRun) {
      done.push(a);
      continue;
    }
    try {
      await fs.rm(safeJoin(STUDIO_DIRS.media, ...asset.storagePath.split("/")), { force: true });
      await db.update(ms.msAssets).set({ storagePath: `purged/${asset.id}`, bytes: 0 }).where(eq(ms.msAssets.id, asset.id));
      purgedBytes += asset.bytes;
      done.push(a);
      await audit(db, { actor: "storage-lifecycle", action: "storage.purged", entity: "asset", entityId: asset.id, productId: asset.productId, detail: { reason: a.reason, bytes: asset.bytes } });
    } catch {
      /* best effort; tried again next run */
    }
  }
  const captures = opts.dryRun ? { removed: 0, bytes: 0 } : await purgeCaptures(now);

  // per-tenant ledger: what each product holds now, what is temporary, when the next purge is due, and whether it is near its quota
  const products = await db.select({ id: ms.msProducts.id, slug: ms.msProducts.slug }).from(ms.msProducts);
  const ledger: Record<string, TenantLedger> = {};
  const fresh = await db.select().from(ms.msAssets);
  for (const p of products) {
    const mine = fresh.filter((a) => a.productId === p.id && !a.storagePath.startsWith("purged/"));
    const bytes = mine.reduce((n, a) => n + a.bytes, 0);
    const next = plan.keep.filter((k) => assetById.get(k.assetId)?.productId === p.id).map((k) => k.nextPurgeAt);
    const quota = LIMITS.perProductQuotaBytes;
    ledger[p.slug] = { bytes, retainedAssets: mine.length, temporaryBytes: videos.filter((v) => v.productId === p.id && ["failed", "qa_failed", "superseded"].includes(v.status)).reduce((n, v) => n + (assetById.get(v.assetId ?? "")?.bytes ?? 0), 0), nextPurgeAt: next.length ? new Date(Math.min(...next)).toISOString() : null, quotaBytes: quota, alert: bytes >= quota * QUOTA_WARN_SHARE };
    if (ledger[p.slug].alert && !opts.dryRun) {
      const key = `storage_alert_${p.id}_${new Date(now).toISOString().slice(0, 10)}`;
      if (!(await getSetting<boolean>(key, false, db))) {
        await setSetting(key, true, "storage-lifecycle", db, { audited: false });
        await audit(db, { actor: "storage-lifecycle", action: "storage.alert", entity: "product", entityId: p.id, productId: p.id, detail: { bytes, quota } });
      }
    }
  }
  if (!opts.dryRun) await setSetting("storage_ledger", { at: new Date(now).toISOString(), purgedBytes, captures, tenants: ledger }, "storage-lifecycle", db, { audited: false });
  void and;
  return { purged: done.length, purgedBytes, captures, ledger, plan: plan.actions.length };
}

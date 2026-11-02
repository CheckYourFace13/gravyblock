/**
 * Local media storage: directory layout, safe paths, measured usage, quotas, temp cleanup and low-disk protection.
 * Layout: <root>/{tmp,media,logs}; media is content addressed per product: media/<productId>/<sha256>.<ext>.
 * Usage is MEASURED by walking the tree, never estimated.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { LIMITS, STUDIO_DIRS } from "./config";

export class StorageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageLimitError";
  }
}

export async function ensureStorageDirs(): Promise<void> {
  for (const d of [STUDIO_DIRS.tmp, STUDIO_DIRS.media, STUDIO_DIRS.logs]) await fs.mkdir(d, { recursive: true, mode: 0o750 });
}

/** Joins segments under a root and refuses anything that would escape it (traversal, absolute segments, NUL). */
export function safeJoin(root: string, ...segments: string[]): string {
  for (const s of segments) {
    if (typeof s !== "string" || s.length === 0 || s.includes("\0") || path.isAbsolute(s)) throw new Error("unsafe path segment");
  }
  const base = path.resolve(root);
  const full = path.resolve(base, ...segments);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error("path escapes storage root");
  return full;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function productMediaDir(productId: string): string {
  if (!UUID_RE.test(productId)) throw new Error("invalid product id");
  return safeJoin(STUDIO_DIRS.media, productId);
}

async function dirBytes(dir: string): Promise<number> {
  let total = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += await dirBytes(p);
    else if (e.isFile()) {
      try {
        total += (await fs.stat(p)).size;
      } catch {
        /* file vanished mid-walk */
      }
    }
  }
  return total;
}

export async function measureStudioUsage(): Promise<{ totalBytes: number; tmpBytes: number; mediaBytes: number; logsBytes: number }> {
  const [tmpBytes, mediaBytes, logsBytes] = await Promise.all([dirBytes(STUDIO_DIRS.tmp), dirBytes(STUDIO_DIRS.media), dirBytes(STUDIO_DIRS.logs)]);
  return { totalBytes: tmpBytes + mediaBytes + logsBytes, tmpBytes, mediaBytes, logsBytes };
}

export async function measureProductBytes(productId: string): Promise<number> {
  return dirBytes(productMediaDir(productId));
}

export async function diskStatus(): Promise<{ freeBytes: number; totalBytes: number }> {
  const s = await fs.statfs(STUDIO_DIRS.root).catch(() => fs.statfs("/"));
  return { freeBytes: Number(s.bavail) * Number(s.bsize), totalBytes: Number(s.blocks) * Number(s.bsize) };
}

/**
 * Throws StorageLimitError when adding `addBytes` for a product would break the product quota, the global ceiling, or the
 * low-disk floor. Callers stop accepting work instead of touching production headroom.
 */
export async function assertCanStore(productId: string, addBytes: number): Promise<void> {
  const [usage, disk, productBytes] = await Promise.all([measureStudioUsage(), diskStatus(), measureProductBytes(productId)]);
  if (disk.freeBytes - addBytes < LIMITS.freeDiskFloorBytes) throw new StorageLimitError("Free disk space is below the safety floor; Studio is not accepting new files");
  if (usage.totalBytes + addBytes > LIMITS.totalDiskCeilingBytes) throw new StorageLimitError("The Studio disk ceiling would be exceeded");
  if (productBytes + addBytes > LIMITS.perProductQuotaBytes) throw new StorageLimitError("This product's storage quota would be exceeded");
}

export async function lowDisk(): Promise<boolean> {
  return (await diskStatus()).freeBytes < LIMITS.freeDiskFloorBytes;
}

/** Removes temp entries older than the TTL (and any empty leftovers). Returns what it removed. */
export async function cleanupTmp(now = Date.now(), ttlMs: number = LIMITS.tmpTtlMs): Promise<{ removed: number; bytes: number }> {
  let removed = 0;
  let bytes = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(STUDIO_DIRS.tmp, { withFileTypes: true });
  } catch {
    return { removed, bytes };
  }
  for (const e of entries) {
    const p = path.join(STUDIO_DIRS.tmp, e.name);
    try {
      const st = await fs.stat(p);
      if (now - st.mtimeMs < ttlMs) continue;
      bytes += e.isDirectory() ? await dirBytes(p) : st.size;
      await fs.rm(p, { recursive: true, force: true });
      removed++;
    } catch {
      /* best effort */
    }
  }
  return { removed, bytes };
}

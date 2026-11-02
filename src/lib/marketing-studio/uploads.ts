/**
 * Upload validation and storage. The file's real type is decided by its bytes (magic numbers), never by its name or the
 * browser-supplied content type. SVG is rejected because it can carry script. The stored filename is the content hash, so a
 * user-supplied name can never influence a path; the original name is kept only as sanitized display text.
 */
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { audit } from "./audit";
import { LIMITS, RENDER_KINDS, STUDIO_DIRS, UPLOAD_KINDS, type AssetKind } from "./config";
import { ms, requireStudioDb, type StudioDb } from "./db";
import { requireProduct } from "./repository";
import type { OwnerScope } from "./scope";
import { assertCanStore, ensureStorageDirs, productMediaDir, safeJoin } from "./storage";

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export type DetectedImage = { mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; ext: "png" | "jpg" | "webp" | "gif"; width: number | null; height: number | null };

export function detectImage(buf: Buffer): DetectedImage | null {
  if (buf.length >= 24 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", ext: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mime: "image/jpeg", ext: "jpg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return { mime: "image/jpeg", ext: "jpg", width: null, height: null };
  }
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const fmt = buf.toString("ascii", 12, 16);
    if (fmt === "VP8X") return { mime: "image/webp", ext: "webp", width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    return { mime: "image/webp", ext: "webp", width: null, height: null };
  }
  if (buf.length >= 10 && (buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a")) {
    return { mime: "image/gif", ext: "gif", width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  return null;
}

export function sanitizeDisplayName(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim();
  return base.slice(0, 120) || "upload";
}

export type StoredAsset = typeof ms.msAssets.$inferSelect;

/** Validates and stores image bytes for a product, then records the asset row. Used by both uploads and remote import. */
export async function storeImageAsset(
  scope: OwnerScope,
  actor: string,
  productId: string,
  input: { bytes: Buffer; originalName: string; kind: AssetKind; provenance: "owner_upload" | "public_fetch" | "rendered"; sourceUrl?: string | null },
  db: StudioDb = requireStudioDb(),
): Promise<StoredAsset> {
  await requireProduct(scope, productId, db);
  // Operators can only add upload kinds; rendered kinds come only from the studio's own pipeline.
  const allowed: readonly string[] = input.provenance === "rendered" ? RENDER_KINDS : UPLOAD_KINDS;
  if (!allowed.includes(input.kind)) throw new UploadError("Unknown asset kind");
  if (input.bytes.length === 0) throw new UploadError("The file is empty");
  if (input.bytes.length > LIMITS.maxUploadBytes) throw new UploadError("The file is larger than the upload limit");
  const detected = detectImage(input.bytes);
  if (!detected) throw new UploadError("Only PNG, JPEG, WebP and GIF images are accepted");
  if (detected.width !== null && detected.height !== null && (detected.width > 8000 || detected.height > 8000 || detected.width < 1 || detected.height < 1)) {
    throw new UploadError("Image dimensions are outside the accepted range");
  }
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const [existing] = await db.select().from(ms.msAssets).where(and(eq(ms.msAssets.productId, productId), eq(ms.msAssets.sha256, sha256))).limit(1);
  if (existing) return existing;

  await ensureStorageDirs();
  await assertCanStore(productId, input.bytes.length);
  const dir = productMediaDir(productId);
  await fs.mkdir(dir, { recursive: true, mode: 0o770 });
  const rel = path.join(productId, `${sha256}.${detected.ext}`);
  const finalPath = safeJoin(STUDIO_DIRS.media, productId, `${sha256}.${detected.ext}`);
  const tmpPath = safeJoin(STUDIO_DIRS.tmp, `${randomUUID()}.part`);
  await fs.writeFile(tmpPath, input.bytes, { mode: 0o660 });
  await fs.rename(tmpPath, finalPath);

  const [row] = await db
    .insert(ms.msAssets)
    .values({
      productId,
      kind: input.kind,
      storagePath: rel.split(path.sep).join("/"),
      sha256,
      mimeType: detected.mime,
      bytes: input.bytes.length,
      width: detected.width,
      height: detected.height,
      originalName: sanitizeDisplayName(input.originalName),
      provenance: input.provenance,
      sourceUrl: input.sourceUrl ?? null,
    })
    .returning();
  await audit(db, { actor, action: "asset.store", entity: "asset", entityId: row.id, productId, detail: { kind: input.kind, bytes: row.bytes, provenance: input.provenance } });
  return row;
}

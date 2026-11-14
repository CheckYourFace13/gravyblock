import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { audit } from "../audit";
import { STUDIO_DIRS, VIDEO } from "../config";
import { ms, type StudioDb } from "../db";
import { requireProduct } from "../repository";
import type { OwnerScope } from "../scope";
import { assertCanStore, ensureStorageDirs, productMediaDir, safeJoin } from "../storage";
import { UploadError } from "../uploads";

async function sha256File(file: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(file)) h.update(chunk as Buffer);
  return h.digest("hex");
}

/** Moves a finished MP4 from the job's temp directory into the product's media directory, after checking it really is an MP4. */
export async function storeVideoFile(scope: OwnerScope, actor: string, productId: string, file: string, meta: { width: number; height: number; name: string }, db: StudioDb) {
  await requireProduct(scope, productId, db);
  const st = await fs.stat(file);
  if (st.size === 0 || st.size > VIDEO.maxBytes) throw new UploadError("The video is empty or larger than the size limit");
  const fh = await fs.open(file, "r");
  const head = Buffer.alloc(12);
  await fh.read(head, 0, 12, 0);
  await fh.close();
  if (head.toString("ascii", 4, 8) !== "ftyp") throw new UploadError("The file is not an MP4");
  const sha = await sha256File(file);
  const [existing] = await db.select().from(ms.msAssets).where(and(eq(ms.msAssets.productId, productId), eq(ms.msAssets.sha256, sha))).limit(1);
  if (existing && !existing.storagePath.startsWith("purged/")) return existing;
  await ensureStorageDirs();
  await assertCanStore(productId, st.size);
  await fs.mkdir(productMediaDir(productId), { recursive: true, mode: 0o770 });
  const finalPath = safeJoin(STUDIO_DIRS.media, productId, `${sha}.mp4`);
  await fs.rename(file, finalPath);
  if (existing) {
    // the same bytes were stored before and the retention policy has since purged that file: the render just made is that file again, so it is put back (never left pointing at nothing)
    const [back] = await db.update(ms.msAssets).set({ storagePath: path.posix.join(productId, `${sha}.mp4`), bytes: st.size }).where(eq(ms.msAssets.id, existing.id)).returning();
    await audit(db, { actor, action: "asset.restore", entity: "asset", entityId: existing.id, productId, detail: { kind: "render_video", bytes: st.size, reason: "identical render of a purged file" } });
    return back;
  }
  const [row] = await db
    .insert(ms.msAssets)
    .values({ productId, kind: "render_video", storagePath: path.posix.join(productId, `${sha}.mp4`), sha256: sha, mimeType: "video/mp4", bytes: st.size, width: meta.width, height: meta.height, originalName: meta.name, provenance: "rendered" })
    .returning();
  await audit(db, { actor, action: "asset.store", entity: "asset", entityId: row.id, productId, detail: { kind: "render_video", bytes: st.size } });
  return row;
}

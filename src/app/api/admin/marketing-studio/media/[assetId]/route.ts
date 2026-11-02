import { promises as fs } from "node:fs";
import { eq } from "drizzle-orm";
import { STUDIO_DIRS } from "@/lib/marketing-studio/config";
import { ms, requireStudioDb } from "@/lib/marketing-studio/db";
import { notFoundResponse, studioApiAuthorized } from "@/lib/marketing-studio/http";
import { requireProduct } from "@/lib/marketing-studio/repository";
import { INTERNAL_SCOPE } from "@/lib/marketing-studio/scope";
import { safeJoin } from "@/lib/marketing-studio/storage";

export const dynamic = "force-dynamic";

const SERVABLE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4"]);

/**
 * Operator-only preview and download of a stored asset. The asset id is resolved through the product's scope, the file path is
 * rebuilt from the stored relative path under the media root (never from the request), and only known media types are served.
 */
export async function GET(req: Request, ctx: { params: Promise<{ assetId: string }> }) {
  if (!(await studioApiAuthorized())) return notFoundResponse();
  const { assetId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) return notFoundResponse();
  const db = requireStudioDb();
  const [asset] = await db.select().from(ms.msAssets).where(eq(ms.msAssets.id, assetId)).limit(1);
  if (!asset || !SERVABLE.has(asset.mimeType)) return notFoundResponse();
  try {
    await requireProduct(INTERNAL_SCOPE, asset.productId, db);
    const full = safeJoin(STUDIO_DIRS.media, ...asset.storagePath.split("/"));
    const bytes = await fs.readFile(full);
    const download = new URL(req.url).searchParams.get("download") === "1";
    const ext = asset.storagePath.split(".").pop() ?? "bin";
    const base = (asset.originalName ?? "asset").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/\.[A-Za-z0-9]+$/, "").slice(0, 80) || "asset";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": asset.mimeType,
        "content-length": String(bytes.length),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; img-src 'self' data:; media-src 'self'; sandbox",
        "content-disposition": `${download ? "attachment" : "inline"}; filename="${base}.${ext}"`,
      },
    });
  } catch {
    return notFoundResponse();
  }
}

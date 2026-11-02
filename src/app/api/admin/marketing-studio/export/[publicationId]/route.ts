import { eq } from "drizzle-orm";
import { ms, requireStudioDb } from "@/lib/marketing-studio/db";
import { notFoundResponse, studioApiAuthorized } from "@/lib/marketing-studio/http";
import { exportPublication } from "@/lib/marketing-studio/publishing/queue";
import { INTERNAL_SCOPE } from "@/lib/marketing-studio/scope";

export const dynamic = "force-dynamic";

/** Operator-only download of a manual-upload bundle. Builds the ZIP on demand; nothing is posted anywhere. */
export async function GET(_req: Request, ctx: { params: Promise<{ publicationId: string }> }) {
  if (!(await studioApiAuthorized())) return notFoundResponse();
  const { publicationId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(publicationId)) return notFoundResponse();
  try {
    const db = requireStudioDb();
    const [p] = await db.select({ productId: ms.msPublications.productId }).from(ms.msPublications).where(eq(ms.msPublications.id, publicationId)).limit(1);
    if (!p) return notFoundResponse();
    const bundle = await exportPublication(INTERNAL_SCOPE, "admin", p.productId, publicationId, db);
    return new Response(new Uint8Array(bundle.zip), {
      headers: {
        "content-type": "application/zip",
        "content-length": String(bundle.zip.length),
        "content-disposition": `attachment; filename="${bundle.fileName}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "export failed";
    return new Response(msg.slice(0, 200), { status: /Approve|approved/.test(msg) ? 409 : 404 });
  }
}

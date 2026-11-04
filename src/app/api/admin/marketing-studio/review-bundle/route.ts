import { requireStudioDb } from "@/lib/marketing-studio/db";
import { notFoundResponse, studioApiAuthorized } from "@/lib/marketing-studio/http";
import { buildReviewBundle } from "@/lib/marketing-studio/review-bundle";
import { INTERNAL_SCOPE } from "@/lib/marketing-studio/scope";

export const dynamic = "force-dynamic";

/** Operator-only owner-review download. Built on demand, never written to a public location, and it posts nothing anywhere. */
export async function GET() {
  if (!(await studioApiAuthorized())) return notFoundResponse();
  try {
    const bundle = await buildReviewBundle(INTERNAL_SCOPE, requireStudioDb());
    return new Response(new Uint8Array(bundle.zip), {
      headers: {
        "content-type": "application/zip",
        "content-length": String(bundle.zip.length),
        "content-disposition": `attachment; filename="${bundle.fileName}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  } catch {
    return notFoundResponse();
  }
}

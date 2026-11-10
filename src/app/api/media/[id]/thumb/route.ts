import { studioEnabledByEnv } from "@/lib/marketing-studio/config";
import { requireStudioDb } from "@/lib/marketing-studio/db";
import { notFoundResponse } from "@/lib/marketing-studio/http";
import { getCanonical } from "@/lib/marketing-studio/media/canonical";
import { storeFromEnv } from "@/lib/marketing-studio/media/object-store";

export const dynamic = "force-dynamic";

/** The still image for the review email and the player poster. It is only a thumbnail of a video that has a canonical record; the video itself is never exposed here. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!studioEnabledByEnv()) return notFoundResponse();
  const { id } = await ctx.params;
  const c = await getCanonical(requireStudioDb(), id);
  const obj = c?.providers.find((p) => p.kind === "object");
  const s = storeFromEnv();
  if (!c || c.status === "retired" || !obj || obj.kind !== "object" || !obj.thumbKey || !s.ok) return notFoundResponse();
  return new Response(null, { status: 302, headers: { location: s.store.signedUrl(obj.thumbKey, { ttlSec: 3600 }), "cache-control": "private, max-age=600" } });
}

import { studioEnabledByEnv } from "@/lib/marketing-studio/config";
import { requireStudioDb } from "@/lib/marketing-studio/db";
import { notFoundResponse } from "@/lib/marketing-studio/http";
import { choosePlayback, getCanonical, verifyMediaAccess } from "@/lib/marketing-studio/media/canonical";
import { storeFromEnv } from "@/lib/marketing-studio/media/object-store";

export const dynamic = "force-dynamic";

/**
 * The only door to a hosted video file. The bucket is private: this sends the viewer to a short-lived signed address after checking that the video is public, or that the viewer
 * holds the owner's review link. Nothing is listable, and the address stops working minutes later.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!studioEnabledByEnv()) return notFoundResponse();
  const { id } = await ctx.params;
  const c = await getCanonical(requireStudioDb(), id);
  if (!c) return notFoundResponse();
  const u = new URL(req.url);
  const allowed = c.status === "public" || verifyMediaAccess(id, u.searchParams.get("t"), process.env.MARKETING_SECRET_KEY);
  if (!allowed) return notFoundResponse();
  const pb = choosePlayback(c);
  const s = storeFromEnv();
  if (!pb || pb.kind !== "object" || !s.ok) return notFoundResponse();
  const url = s.store.signedUrl(pb.key, { ttlSec: 900, ...(u.searchParams.get("download") === "1" && c.status === "public" ? { download: `${c.title.slice(0, 60)}.mp4` } : {}) });
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

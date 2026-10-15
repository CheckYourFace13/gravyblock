import { getDb } from "@/lib/db";
import { signFeedBody } from "@/lib/site-publish/signing";
import { buildManagedFeed } from "@/lib/site-publish/managed-feed";

export const dynamic = "force-dynamic";

/**
 * Signed publishing feed for a connected first-party site. Read-only and public
 * (everything in it is content that is meant to appear on the site); integrity
 * comes from the Ed25519 signature in `x-gravyblock-signature`.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) return Response.json({ error: "not_found" }, { status: 404 });
  const db = getDb();
  if (!db) return Response.json({ error: "unavailable" }, { status: 503 });

  const body = JSON.stringify(await buildManagedFeed(businessId));
  const sig = signFeedBody(body);
  if (!sig) return Response.json({ error: "unavailable" }, { status: 503 });
  return new Response(body, {
    headers: { "content-type": "application/json", "x-gravyblock-signature": sig, "cache-control": "public, s-maxage=30, stale-while-revalidate=120" },
  });
}

import { and, desc, eq } from "drizzle-orm";
import { getDb, jobs, publishedContent } from "@/lib/db";
import { signFeedBody } from "@/lib/site-publish/signing";

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

  const items = await db
    .select()
    .from(publishedContent)
    .where(and(eq(publishedContent.businessId, businessId), eq(publishedContent.channel, "managed_feed"), eq(publishedContent.status, "published")))
    .orderBy(desc(publishedContent.createdAt))
    .limit(100);

  const overrideRows = await db
    .select({ payload: jobs.payload, createdAt: jobs.createdAt, status: jobs.status })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), eq(jobs.type, "site_override")))
    .orderBy(desc(jobs.createdAt))
    .limit(500);
  const latest = new Map<string, { payload: Record<string, unknown>; status: string }>();
  for (const r of overrideRows) {
    const p = (r.payload ?? {}) as Record<string, unknown>;
    const path = typeof p.path === "string" ? p.path : null;
    if (path && !latest.has(path)) latest.set(path, { payload: p, status: r.status });
  }
  const overrides = [...latest.values()]
    .filter((o) => o.status === "active")
    .map((o) => {
      const p = o.payload;
      return { path: p.path, title: p.title ?? null, description: p.description ?? null, ogImage: p.ogImage ?? null, jsonLd: p.jsonLd ?? null };
    });

  const body = JSON.stringify({
    version: 1,
    businessId,
    generatedAt: new Date().toISOString(),
    items: items.map((i) => {
      const slug = (i.publicUrl ?? "").split("/").filter(Boolean).pop() ?? i.id;
      return {
        slug,
        title: i.title,
        description: i.metaDescription ?? null,
        bodyHtml: i.body,
        coverImageUrl: i.coverImageUrl ?? null,
        publishedAt: i.createdAt.toISOString(),
      };
    }),
    overrides,
  });
  const sig = signFeedBody(body);
  if (!sig) return Response.json({ error: "unavailable" }, { status: 503 });
  return new Response(body, {
    headers: { "content-type": "application/json", "x-gravyblock-signature": sig, "cache-control": "public, s-maxage=30, stale-while-revalidate=120" },
  });
}

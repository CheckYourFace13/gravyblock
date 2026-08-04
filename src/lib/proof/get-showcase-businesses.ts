import { desc, eq, inArray } from "drizzle-orm";
import { getDb, businesses, publishedContent, visibilitySnapshots } from "@/lib/db";

export type ShowcaseBusiness = {
  id: string;
  name: string;
  vertical: string | null;
  city: string | null;
  score: number | null;
  scoreDelta: number | null;
  articleCount: number;
  recentArticles: Array<{ title: string; publicUrl: string }>;
};

function cityFromAddress(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",");
  if (parts.length >= 2) return parts[1].trim();
  return null;
}

/** Businesses opted into the public /proof showcase, with live score + published content. */
export async function getShowcaseBusinesses(): Promise<ShowcaseBusiness[]> {
  const db = getDb();
  if (!db) return [];

  let rows: Array<{ id: string; name: string; vertical: string | null; address: string | null }> = [];
  try {
    rows = await db
      .select({
        id: businesses.id,
        name: businesses.name,
        vertical: businesses.vertical,
        address: businesses.address,
      })
      .from(businesses)
      .where(eq(businesses.showcaseOptIn, "true"))
      .limit(12);
  } catch {
    return []; // column may not exist yet on older DBs
  }

  // Defense in depth: the parent company never appears here (owner directive),
  // on top of the same guard in the admin toggle action.
  const visible = rows.filter((b) => !b.name.toLowerCase().includes("iscream"));
  if (!visible.length) return [];

  const ids = visible.map((b) => b.id);
  const [snapshots, articles] = await Promise.all([
    db
      .select({
        businessId: visibilitySnapshots.businessId,
        overallScore: visibilitySnapshots.overallScore,
        createdAt: visibilitySnapshots.createdAt,
      })
      .from(visibilitySnapshots)
      .where(inArray(visibilitySnapshots.businessId, ids))
      .orderBy(desc(visibilitySnapshots.createdAt))
      .limit(200),
    db
      .select({
        businessId: publishedContent.businessId,
        title: publishedContent.title,
        publicUrl: publishedContent.publicUrl,
        status: publishedContent.status,
        channel: publishedContent.channel,
        createdAt: publishedContent.createdAt,
      })
      .from(publishedContent)
      .where(inArray(publishedContent.businessId, ids))
      .orderBy(desc(publishedContent.createdAt))
      .limit(300),
  ]);

  return visible.map((b) => {
    const snaps = snapshots.filter((s) => s.businessId === b.id);
    const published = articles.filter(
      (a) => a.businessId === b.id && a.status === "published" && a.channel === "internal_site" && a.publicUrl,
    );
    const latest = snaps[0]?.overallScore ?? null;
    const previous = snaps[1]?.overallScore ?? null;
    return {
      id: b.id,
      name: b.name,
      vertical: b.vertical,
      city: cityFromAddress(b.address),
      score: latest,
      scoreDelta: latest !== null && previous !== null ? latest - previous : null,
      articleCount: published.length,
      recentArticles: published.slice(0, 3).map((a) => ({ title: a.title, publicUrl: a.publicUrl! })),
    };
  });
}

import { desc, eq, inArray } from "drizzle-orm";
import { getDb, businesses, publishedContent, visibilitySnapshots } from "@/lib/db";

export type ShowcaseBusiness = {
  id: string;
  name: string;
  vertical: string | null;
  city: string | null;
  score: number | null;
  scoreDelta: number | null;
  /** True when the latest snapshot uses a newer scoring methodology than the previous one — no comparable trend exists yet. */
  baselineJustEstablished: boolean;
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
  // scoreMethodVersion is a recently-added column — a deploy where the schema
  // push hasn't landed yet must not 500 this public page. Fall back to the
  // pre-versioning shape (delta always gated off) rather than crash.
  const snapshotsQuery = db
    .select({
      businessId: visibilitySnapshots.businessId,
      overallScore: visibilitySnapshots.overallScore,
      scoreMethodVersion: visibilitySnapshots.scoreMethodVersion,
      createdAt: visibilitySnapshots.createdAt,
    })
    .from(visibilitySnapshots)
    .where(inArray(visibilitySnapshots.businessId, ids))
    .orderBy(desc(visibilitySnapshots.createdAt))
    .limit(200)
    .catch(async () =>
      (
        await db
          .select({
            businessId: visibilitySnapshots.businessId,
            overallScore: visibilitySnapshots.overallScore,
            createdAt: visibilitySnapshots.createdAt,
          })
          .from(visibilitySnapshots)
          .where(inArray(visibilitySnapshots.businessId, ids))
          .orderBy(desc(visibilitySnapshots.createdAt))
          .limit(200)
      ).map((s) => ({ ...s, scoreMethodVersion: null as string | null })),
    );

  const [snapshots, articles] = await Promise.all([
    snapshotsQuery,
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
    // A trend delta is only meaningful when both snapshots were produced by
    // the same scoring formula — comparing across a methodology change (e.g.
    // the legacy "previousScore + 2" formula vs. visibility-v2) would show a
    // fabricated-looking jump/drop that has nothing to do with real change.
    const sameMethod =
      snaps[0]?.scoreMethodVersion != null && snaps[0].scoreMethodVersion === snaps[1]?.scoreMethodVersion;
    const scoreDelta = sameMethod && latest !== null && previous !== null ? latest - previous : null;
    const baselineJustEstablished = !sameMethod && snaps[0]?.scoreMethodVersion != null && snaps.length > 0;
    return {
      id: b.id,
      name: b.name,
      vertical: b.vertical,
      city: cityFromAddress(b.address),
      score: latest,
      scoreDelta,
      baselineJustEstablished,
      articleCount: published.length,
      recentArticles: published.slice(0, 3).map((a) => ({ title: a.title, publicUrl: a.publicUrl! })),
    };
  });
}

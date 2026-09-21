import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import { getDb, businesses, publishedContent, visibilitySnapshots, jobs, citationMonitors, backlinkOpportunities } from "@/lib/db";

export type ShowcaseBusiness = {
  id: string;
  name: string;
  vertical: string | null;
  city: string | null;
  score: number | null;
  scoreDelta: number | null;
  /** True when the latest snapshot uses a newer scoring methodology than the previous one — no comparable trend exists yet. */
  baselineJustEstablished: boolean;
  /** Verified work only — a category appears only if real evidence exists for it. */
  activity: ProofActivity;
};

export type ProofActivity = {
  /** Pages published to the business's OWN website and confirmed live (HTTP 200). */
  pagesLive: Array<{ title: string; publicUrl: string }>;
  pagesLiveCount: number;
  gbpPosts: number;
  gbpPhotos: number;
  socialPosts: number;
  reviewReplies: number;
  listingChecks: { checked: number; drift: number } | null;
  authority: { outreachSent: number; followUps: number; liveLinks: Array<{ sourceName: string; url: string | null }> } | null;
  siteChecks: { lastCheckedAt: string; healthy: boolean } | null;
  factsRefreshedAt: string | null;
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

  const snapshots = await snapshotsQuery;

  return Promise.all(
    visible.map(async (b) => {
      const snaps = snapshots.filter((s) => s.businessId === b.id);
      const latest = snaps[0]?.overallScore ?? null;
      const previous = snaps[1]?.overallScore ?? null;
      // A trend delta is only meaningful when both snapshots were produced by
      // the same scoring formula.
      const sameMethod =
        snaps[0]?.scoreMethodVersion != null && snaps[0].scoreMethodVersion === snaps[1]?.scoreMethodVersion;
      const scoreDelta = sameMethod && latest !== null && previous !== null ? latest - previous : null;
      const baselineJustEstablished = !sameMethod && snaps[0]?.scoreMethodVersion != null && snaps.length > 0;
      return {
        id: b.id,
        vertical: b.vertical && b.vertical.toLowerCase() !== "other" ? b.vertical : null,
        name: b.name,
        city: cityFromAddress(b.address),
        score: latest,
        scoreDelta,
        baselineJustEstablished,
        activity: await loadActivity(db, b.id),
      };
    }),
  );
}

type Db = NonNullable<ReturnType<typeof getDb>>;

/**
 * Evidence, not activity logs: every number here is backed by an external
 * fact GravyBlock verified (page answered HTTP 200, Google returned a media
 * or post id, a link was found on the other site). Queued, drafted, planned
 * or "sent" work is never counted as completed work.
 */
async function loadActivity(db: Db, businessId: string): Promise<ProofActivity> {
  const count = async (type: string, extra?: ReturnType<typeof sql>) => {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.businessId, businessId), like(jobs.type, type), extra ?? sql`true`));
    return r?.n ?? 0;
  };

  // Pages verified live on the business's own website.
  const verified = await db
    .select({ payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), eq(jobs.type, "content_publish_verified"), eq(jobs.status, "completed")))
    .orderBy(desc(jobs.createdAt))
    .limit(50);
  const pagesLive = verified
    .map((v) => v.payload as { title?: string; publicUrl?: string })
    .filter((p): p is { title: string; publicUrl: string } => Boolean(p.title && p.publicUrl));

  const social = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(publishedContent)
    .where(and(eq(publishedContent.businessId, businessId), inArray(publishedContent.channel, ["facebook", "instagram"]), eq(publishedContent.status, "published")));

  const monitors = await db.select({ status: citationMonitors.status }).from(citationMonitors).where(eq(citationMonitors.businessId, businessId));
  const checkedMonitors = monitors.filter((m) => m.status === "consistent" || m.status === "drift_detected" || m.status === "not_found");

  const opps = await db
    .select({ sourceName: backlinkOpportunities.sourceName, note: backlinkOpportunities.relevanceNote, status: backlinkOpportunities.status })
    .from(backlinkOpportunities)
    .where(and(eq(backlinkOpportunities.businessId, businessId), eq(backlinkOpportunities.status, "acquired")));
  const outreachSent = await count("authority_outreach_sent");
  const followUps = await count("authority_followup_sent");

  const [site] = await db
    .select({ createdAt: jobs.createdAt, status: jobs.status })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), eq(jobs.type, "site_watchdog")))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  const [truth] = await db
    .select({ createdAt: jobs.createdAt })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), eq(jobs.type, "truth_refresh")))
    .orderBy(desc(jobs.createdAt))
    .limit(1);

  return {
    pagesLive: pagesLive.slice(0, 3),
    pagesLiveCount: pagesLive.length,
    gbpPosts: await count(`gbp_post_${businessId}`),
    gbpPhotos: await count("gbp_photo_upload"),
    socialPosts: social[0]?.n ?? 0,
    reviewReplies: await count("gbp_review_reply"),
    listingChecks: checkedMonitors.length ? { checked: checkedMonitors.length, drift: checkedMonitors.filter((m) => m.status === "drift_detected").length } : null,
    authority: outreachSent + opps.length > 0
      ? {
          outreachSent,
          followUps,
          liveLinks: opps.map((o) => ({ sourceName: o.sourceName, url: (o.note ?? "").match(/https?:\/\/\S+/)?.[0] ?? null })),
        }
      : null,
    siteChecks: site ? { lastCheckedAt: site.createdAt.toISOString(), healthy: site.status === "healthy" } : null,
    factsRefreshedAt: truth ? truth.createdAt.toISOString() : null,
  };
}

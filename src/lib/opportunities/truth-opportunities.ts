/**
 * Business Truth → opportunity creation. Runs after a truth refresh and turns newly VERIFIED
 * facts into candidate opportunities — generically, by fact key, for any business. A fact is
 * "new" when its contentHash hasn't been turned into an opportunity before (contentHash changes
 * whenever the underlying value changes, not on every re-observation), so this is naturally
 * idempotent: re-running it after nothing changed records nothing new.
 *
 *   new service        -> content_gap (a dedicated page may be worth creating)
 *   new offer/event     -> social (worth promoting while it's current)
 *   new article/project -> backlink (authority now has a fresh asset to pitch)
 *
 * The queue decides which of these are actually worthwhile — this module only proposes.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { businesses, businessFacts, contentQueue, getDb, publishedContent } from "@/lib/db";
import { getBusinessTruth } from "@/lib/truth";
import { recordOpportunity } from "./queue";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function createOpportunitiesFromTruth(businessId: string): Promise<{ recorded: number }> {
  const db = getDb();
  if (!db) return { recorded: 0 };
  const truth = await getBusinessTruth(businessId);
  if (!truth.sufficient) return { recorded: 0 };
  let recorded = 0;

  const facts = await db.select().from(businessFacts).where(and(eq(businessFacts.businessId, businessId), eq(businessFacts.status, "current")));

  // New service -> is there already a page for it?
  const existingTitles = new Set(
    (
      await db
        .select({ title: contentQueue.title })
        .from(contentQueue)
        .where(eq(contentQueue.businessId, businessId))
        .orderBy(desc(contentQueue.createdAt))
        .limit(300)
    ).map((r) => norm(r.title)),
  );
  for (const f of facts.filter((x) => x.factKey === "service")) {
    if ([...existingTitles].some((t) => t.includes(norm(f.factValue)))) continue;
    const r = await recordOpportunity({
      businessId,
      opportunityType: "content_gap",
      subtype: "new_service_no_page",
      engine: "truth_opportunities",
      valueClass: "growth",
      evidence: { service: f.factValue, sourceUrl: f.sourceUrl },
      expectedImpact: 50,
      confidence: 55,
      cost: 3,
      risk: 2,
      requiredCapability: "website_write",
      autoEligible: false, // content-planner already discovers and queues services on its own cadence; this is a visibility signal, not a second writer
      ttlDays: 60,
      dedupeKey: `truth_opp:service:${businessId}:${f.contentHash}`,
    });
    if (r.recorded) recorded++;
  }

  // New/current offer or event -> worth promoting while it's live.
  for (const f of facts.filter((x) => (x.factKey === "offer" || x.factKey === "event") && (!x.expiresAt || x.expiresAt.getTime() > Date.now()))) {
    const r = await recordOpportunity({
      businessId,
      opportunityType: "social",
      subtype: "promote_current_offer",
      engine: "truth_opportunities",
      valueClass: "growth",
      evidence: { offer: f.factValue, sourceUrl: f.sourceUrl, expiresAt: f.expiresAt?.toISOString() ?? null },
      expectedImpact: 45,
      confidence: 60,
      cost: 1,
      risk: 1,
      requiredCapability: "social",
      autoEligible: true,
      ttlDays: 14,
      dedupeKey: `truth_opp:offer:${businessId}:${f.contentHash}`,
    });
    if (r.recorded) recorded++;
  }

  // New article/project the company published -> a fresh asset authority outreach can pitch.
  const publishedUrls = new Set((await db.select({ publicUrl: publishedContent.publicUrl }).from(publishedContent).where(eq(publishedContent.businessId, businessId))).map((r) => r.publicUrl));
  for (const f of facts.filter((x) => x.factKey === "recent_content" && x.sourceUrl)) {
    const r = await recordOpportunity({
      businessId,
      opportunityType: "backlink",
      subtype: "new_asset_available",
      engine: "truth_opportunities",
      valueClass: publishedUrls.has(f.sourceUrl) ? "growth" : "hygiene", // the company's own new content is a stronger asset than a generic page
      evidence: { title: f.factValue, sourceUrl: f.sourceUrl },
      expectedImpact: 40,
      confidence: 50,
      cost: 2,
      risk: 2,
      requiredCapability: "authority_contact",
      autoEligible: true,
      ttlDays: 45,
      dedupeKey: `truth_opp:content:${businessId}:${f.contentHash}`,
    });
    if (r.recorded) recorded++;
  }

  return { recorded };
}

export async function createOpportunitiesFromTruthBatch(businessIds: string[]): Promise<{ businesses: number; recorded: number }> {
  let recorded = 0;
  for (const id of businessIds) {
    try {
      const r = await createOpportunitiesFromTruth(id);
      recorded += r.recorded;
    } catch (err) {
      console.error("[truth-opportunities] failed", { businessId: id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { businesses: businessIds.length, recorded };
}

const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];

/** Self-selecting daily batch over paid businesses — idempotent (contentHash-keyed), so a daily cadence is plenty. */
export async function runTruthOpportunitiesBatch(limit = 15): Promise<{ businesses: number; recorded: number }> {
  const db = getDb();
  if (!db) return { businesses: 0, recorded: 0 };
  const rows = await db.select({ id: businesses.id }).from(businesses).where(inArray(businesses.planTier, PAID_TIERS)).limit(limit);
  return createOpportunitiesFromTruthBatch(rows.map((r) => r.id));
}

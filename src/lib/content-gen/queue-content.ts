/**
 * Content planning entry point used by the worker and the manual
 * generate-content route.
 *
 * Replaced the old template generator (which built titles like "Best {industry}
 * in {city}" and fell back to the literal words "your city" / "your state" when
 * facts were missing, and queued GBP/Reddit/video/newsletter/press-release
 * drafts nothing ever consumed). Everything now flows from the Business Truth
 * layer: website content is planned from verified facts and only when a
 * publishing destination is connected; social posts are planned from verified
 * facts only when a Facebook Page is connected.
 */

import { getDb, businesses } from "@/lib/db";
import { eq } from "drizzle-orm";
import { normalizePlanTierFromDb } from "@/lib/plans";
import { planTruthGroundedContent } from "@/lib/autopilot/content-planner";
import { planTruthGroundedSocial } from "@/lib/social/truth-social";

export async function queueContentForBusiness(businessId: string): Promise<{ queued: number; skipped: string }> {
  const db = getDb();
  if (!db) return { queued: 0, skipped: "no_database" };

  const [biz] = await db.select({ planTier: businesses.planTier }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) return { queued: 0, skipped: "business_not_found" };
  const tier = normalizePlanTierFromDb(biz.planTier);
  if (tier === "free") return { queued: 0, skipped: "not_a_paid_plan" };

  const isTop = tier === "pro" || tier === "agency";
  const site = await planTruthGroundedContent({ businessId, maxItems: isTop ? 3 : 2, maxLocationPages: isTop || tier === "growth" ? 1 : 0 });
  let social = { queued: 0, reason: "not_on_plan" };
  if (tier === "growth" || isTop) social = await planTruthGroundedSocial(businessId);

  const queued = site.queued + social.queued;
  return { queued, skipped: queued > 0 ? "" : site.state !== "planned" ? site.state : social.reason };
}

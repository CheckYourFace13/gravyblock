/**
 * What the public Real Growth Stories page may show. The rule that matters: ONLY claims the owner approved can render, with these refresh rules.
 *   - A claim's numbers refresh automatically from live data, but only while its approved wording (template) is still the wording the data now produces.
 *   - If the data would now produce different wording (for example "no live link verified yet" becoming "1 live link verified"), the claim is HIDDEN
 *     rather than shown stale or shown unreviewed, and the story is flagged as having changes waiting for owner review.
 *   - A claim key that was never approved can never appear.
 *   - With no approval row for a site, nothing about it is public.
 */
import { and, desc, eq } from "drizzle-orm";
import { caseStudyApprovals, getDb } from "@/lib/db";
import { buildGrowthStory, PILOT_SLUGS } from "./build";
import { renderClaim, type Claim, type Stage } from "./model";

export type ApprovedClaim = Pick<Claim, "key" | "stage" | "template" | "values">;
export type PublicStory = { slug: string; publicName: string; disclosure: string; asOf: string; approvedAt: string; claims: Array<{ stage: Stage; text: string }>; pendingReview: number };

/** Pure: decide what a story shows given the approved snapshot and the freshly built claims. */
export function applyApproval(approved: ApprovedClaim[], fresh: Claim[]): { shown: Array<{ stage: Stage; text: string }>; pending: number } {
  const shown: Array<{ stage: Stage; text: string }> = [];
  let pending = 0;
  for (const a of approved) {
    const f = fresh.find((c) => c.key === a.key);
    if (f && f.template === a.template) shown.push({ stage: a.stage, text: renderClaim(f) });
    else pending++; // wording changed (or no data any more): hidden until the owner reviews the new wording
  }
  // claims that exist now but were never approved are counted for the owner, never shown
  for (const f of fresh) if (!approved.some((a) => a.key === f.key)) pending++;
  return { shown, pending };
}

export async function getApprovedStories(): Promise<PublicStory[]> {
  const db = getDb();
  if (!db) return [];
  const out: PublicStory[] = [];
  for (const slug of Object.keys(PILOT_SLUGS)) {
    const story = await buildGrowthStory(slug).catch(() => null);
    if (!story) continue;
    const [ap] = await db
      .select()
      .from(caseStudyApprovals)
      .where(and(eq(caseStudyApprovals.businessId, story.businessId), eq(caseStudyApprovals.status, "approved")))
      .orderBy(desc(caseStudyApprovals.approvedAt))
      .limit(1);
    if (!ap) continue;
    const { shown, pending } = applyApproval(ap.claims as ApprovedClaim[], story.claims);
    if (!shown.length) continue;
    out.push({ slug, publicName: ap.publicName, disclosure: ap.disclosure, asOf: story.generatedAt, approvedAt: ap.approvedAt.toISOString(), claims: shown, pendingReview: pending });
  }
  return out;
}

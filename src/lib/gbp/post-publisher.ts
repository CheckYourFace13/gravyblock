/**
 * GBP Post Auto-Publisher
 *
 * For each paid business (growth+) with Google connected:
 *   1. Check if we already posted a GBP post this week (via jobs table)
 *   2. Find their most recent published article for topic material
 *   3. Generate a 150-300 word GBP post summarising the article
 *   4. Publish via createGbpPost()
 *
 * Runs once per week per business — gated by hasJobRunThisWeek per businessId.
 */

import { eq, and, inArray, desc, gte, ne } from "drizzle-orm";
import { getDb, businesses, publishedContent, jobs } from "@/lib/db";
import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";
import { createGbpPost, isGbpConnected } from "@/lib/integrations/gbp-write";
import { normalizePlanTierFromDb } from "@/lib/plans";
import { ensureFreshTruth, promotableContent } from "@/lib/truth";
import { containsPlaceholderArtifact } from "@/lib/content-gen/quality-guard";

const ELIGIBLE_TIERS = ["growth", "pro", "agency"];

const STYLE_RULES = `Writing rules:
- No em dashes. Use commas or short sentences instead.
- No AI clichés: "delve", "leverage", "comprehensive", "robust", "moreover", "furthermore", "tapestry".
- Sound like a knowledgeable local business owner.
- No markdown, no hashtags — plain text only.`;

async function generateGbpPost(params: {
  businessName: string;
  city: string | null;
  topicTitle: string;
  topicExcerpt: string;
  truthBlock: string;
}): Promise<string | null> {
  return openRouterChat({
    model: MODELS.content,
    messages: [{
      role: "user",
      content: `${params.truthBlock}

Write a Google Business Profile post for ${params.businessName}${params.city ? ` in ${params.city}` : ""}.

Topic (from the company's own website): "${params.topicTitle}"
Source text:
${params.topicExcerpt.slice(0, 1500)}

${STYLE_RULES}

Requirements:
- 80-200 words, plain text paragraphs
- Use ONLY the verified facts above and the source text; do not invent offers, prices, dates, staff or claims
- Start with a natural hook${params.city ? ` (mention ${params.city} only because it is a verified fact above)` : ""}
- End with a soft CTA like "Learn more on our website"
- No markdown formatting, no hashtags

Write the Google post now.`,
    }],
    maxTokens: 350,
    temperature: 0.5,
  });
}

function cityFromAddress(address: string | null | undefined): string {
  if (!address) return "your city";
  const parts = address.split(",");
  if (parts.length >= 2) return parts[1].trim();
  return address.trim();
}

async function hasGbpPostThisWeek(businessId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const weekStart = new Date();
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay()); // Sunday
  // Use per-business job type so we can query without JSON path filters
  const jobType = `gbp_post_${businessId}`;
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, jobType), gte(jobs.createdAt, weekStart)))
    .limit(1);
  return Boolean(row);
}

export type GbpPostResult = { posted: boolean; reason?: string; postName?: string };

/** Post one GBP update for a single business — the unit the opportunity queue orchestrator calls. */
export async function postGbpForBusiness(businessId: string): Promise<GbpPostResult> {
  const db = getDb();
  if (!db) return { posted: false, reason: "no_db" };

  const [biz] = await db.select({ id: businesses.id, name: businesses.name, planTier: businesses.planTier, website: businesses.website }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) return { posted: false, reason: "business_not_found" };
  const tier = normalizePlanTierFromDb(biz.planTier);
  if (!ELIGIBLE_TIERS.includes(tier)) return { posted: false, reason: "plan_not_eligible" };
  if (await hasGbpPostThisWeek(biz.id)) return { posted: false, reason: "already_posted_this_week" };
  if (!(await isGbpConnected(biz.id))) return { posted: false, reason: "gbp_not_connected" };

  try {
    // Topic comes from what the company itself published: a page GravyBlock
    // published to their real website, else the newest page on their own site
    // (Business Truth layer), else a service they list. Never invented.
    const truth = await ensureFreshTruth(biz.id);
    if (!truth.sufficient) return { posted: false, reason: `insufficient_truth:${truth.insufficientReason}` };
    const [article] = await db
      .select({ title: publishedContent.title, body: publishedContent.body, publicUrl: publishedContent.publicUrl })
      .from(publishedContent)
      .where(and(eq(publishedContent.businessId, biz.id), eq(publishedContent.status, "published"), ne(publishedContent.channel, "internal_site")))
      .orderBy(desc(publishedContent.createdAt))
      .limit(1);
    const recentFact = promotableContent(truth.facts)[0];
    const topic = article
      ? { title: article.title, excerpt: article.body, url: article.publicUrl }
      : recentFact
        ? { title: recentFact.value, excerpt: recentFact.value, url: recentFact.sourceUrl }
        : truth.services[0]
          ? { title: truth.services[0], excerpt: truth.services[0], url: null as string | null }
          : null;
    if (!topic) return { posted: false, reason: "no_topic_available" };

    const postText = await generateGbpPost({
      businessName: truth.businessName || biz.name,
      city: truth.verifiedCity,
      topicTitle: topic.title,
      topicExcerpt: topic.excerpt,
      truthBlock: truth.promptBlock,
    });
    if (!postText || containsPlaceholderArtifact(postText)) return { posted: false, reason: "generation_failed" };

    const ctaUrl = topic.url ?? biz.website ?? undefined;
    const result = await createGbpPost(biz.id, {
      summary: postText.trim(),
      callToActionType: ctaUrl ? "LEARN_MORE" : undefined,
      callToActionUrl: ctaUrl,
    });

    if (!result.ok) {
      console.error("[gbp-post-publisher] post failed", { businessId: biz.id, error: result.error });
      return { posted: false, reason: result.error ?? "post_failed" };
    }
    // Record per-business so we don't re-post this week
    await db.insert(jobs).values({
      businessId: biz.id,
      type: `gbp_post_${biz.id}`,
      status: "completed",
      payload: { businessId: biz.id, postName: result.postName, articleTitle: topic.title, topicUrl: topic.url },
    });
    console.info("[gbp-post-publisher] published GBP post", { businessId: biz.id, postName: result.postName });
    return { posted: true, postName: result.postName };
  } catch (err) {
    console.error("[gbp-post-publisher] error", { businessId: biz.id, error: err instanceof Error ? err.message : String(err) });
    return { posted: false, reason: "exception" };
  }
}

export async function runGbpPostBatch(
  batchSize = 3,
): Promise<{ processed: number; posted: number; errors: number }> {
  const db = getDb();
  if (!db) return { processed: 0, posted: 0, errors: 0 };

  const eligibleBizRows = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(inArray(businesses.planTier, ELIGIBLE_TIERS))
    .limit(batchSize * 4);

  let processed = 0;
  let posted = 0;
  let errors = 0;

  for (const biz of eligibleBizRows) {
    if (processed >= batchSize) break;
    const r = await postGbpForBusiness(biz.id);
    if (r.reason === "already_posted_this_week" || r.reason === "gbp_not_connected" || r.reason === "plan_not_eligible") continue;
    processed++;
    if (r.posted) posted++;
    else if (r.reason !== "no_topic_available" && !r.reason?.startsWith("insufficient_truth")) errors++;
  }

  return { processed, posted, errors };
}

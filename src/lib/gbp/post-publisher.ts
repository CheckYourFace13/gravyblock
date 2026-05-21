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

import { eq, and, inArray, desc, gte } from "drizzle-orm";
import { getDb, businesses, publishedContent, jobs } from "@/lib/db";
import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";
import { createGbpPost, isGbpConnected } from "@/lib/integrations/gbp-write";
import { normalizePlanTierFromDb } from "@/lib/plans";

const ELIGIBLE_TIERS = ["growth", "pro", "agency"];

const STYLE_RULES = `Writing rules:
- No em dashes. Use commas or short sentences instead.
- No AI clichés: "delve", "leverage", "comprehensive", "robust", "moreover", "furthermore", "tapestry".
- Sound like a knowledgeable local business owner.
- No markdown, no hashtags — plain text only.`;

async function generateGbpPost(params: {
  businessName: string;
  city: string;
  articleTitle: string;
  articleExcerpt: string;
}): Promise<string | null> {
  return openRouterChat({
    model: MODELS.content,
    messages: [{
      role: "user",
      content: `Write a Google Business Profile post for ${params.businessName} in ${params.city}.

Topic: "${params.articleTitle}"
Article excerpt:
${params.articleExcerpt.slice(0, 1500)}

${STYLE_RULES}

Requirements:
- 150-250 words
- Start with an engaging local hook (mention ${params.city})
- Share one useful insight from the article
- End with a soft CTA like "Learn more on our website" or "Call us today"
- No markdown formatting, no hashtags, plain text paragraphs

Write the Google post now.`,
    }],
    maxTokens: 350,
    temperature: 0.75,
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

export async function runGbpPostBatch(
  batchSize = 3,
): Promise<{ processed: number; posted: number; errors: number }> {
  const db = getDb();
  if (!db) return { processed: 0, posted: 0, errors: 0 };

  const eligibleBizRows = await db
    .select({ id: businesses.id, name: businesses.name, planTier: businesses.planTier, address: businesses.address, website: businesses.website })
    .from(businesses)
    .where(inArray(businesses.planTier, ELIGIBLE_TIERS))
    .limit(batchSize * 4);

  let processed = 0;
  let posted = 0;
  let errors = 0;

  for (const biz of eligibleBizRows) {
    if (processed >= batchSize) break;

    const tier = normalizePlanTierFromDb(biz.planTier);
    if (!ELIGIBLE_TIERS.includes(tier)) continue;

    // Skip if already posted this week
    if (await hasGbpPostThisWeek(biz.id)) continue;

    const connected = await isGbpConnected(biz.id);
    if (!connected) continue;

    processed++;

    try {
      // Get their latest published article
      const [article] = await db
        .select({ title: publishedContent.title, body: publishedContent.body })
        .from(publishedContent)
        .where(and(
          eq(publishedContent.businessId, biz.id),
          eq(publishedContent.status, "published"),
        ))
        .orderBy(desc(publishedContent.createdAt))
        .limit(1);

      if (!article) continue;

      const city = cityFromAddress(biz.address);
      const postText = await generateGbpPost({
        businessName: biz.name,
        city,
        articleTitle: article.title,
        articleExcerpt: article.body,
      });

      if (!postText) continue;

      const result = await createGbpPost(biz.id, {
        summary: postText.trim(),
        callToActionType: biz.website ? "LEARN_MORE" : undefined,
        callToActionUrl: biz.website ?? undefined,
      });

      if (result.ok) {
        posted++;
        // Record per-business so we don't re-post this week
        await db.insert(jobs).values({
          type: `gbp_post_${biz.id}`,
          status: "completed",
          payload: { businessId: biz.id, postName: result.postName, articleTitle: article.title },
        });
        console.info("[gbp-post-publisher] published GBP post", {
          businessId: biz.id,
          postName: result.postName,
        });
      } else {
        errors++;
        console.error("[gbp-post-publisher] post failed", { businessId: biz.id, error: result.error });
      }
    } catch (err) {
      errors++;
      console.error("[gbp-post-publisher] error", {
        businessId: biz.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { processed, posted, errors };
}

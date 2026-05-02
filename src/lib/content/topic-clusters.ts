/**
 * ─── Feature #6: Topic Cluster Map ───────────────────────────────────────────
 * Generates a structured topical map — pillar topics and supporting articles —
 * so customers can see content coverage and gaps at a glance.
 *
 * Cost: one AI call per business per month, ~$0.002.
 */

import { eq } from "drizzle-orm";
import { getDb, businesses, businessConfigs, publishedContent, contentQueue } from "@/lib/db";
import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";

export type SupportingArticle = {
  title: string;
  keyword: string;
  status: "published" | "queued" | "gap"; // gap = suggested but not yet created
};

export type TopicCluster = {
  pillar: string;          // Main topic / pillar page title
  keyword: string;         // Primary keyword
  articles: SupportingArticle[];
};

type ClusterMap = {
  clusters: TopicCluster[];
};

/**
 * Generate a topic cluster map for a business.
 * Merges existing published content and queued items with AI-suggested gaps.
 */
export async function generateTopicClusterMap(businessId: string): Promise<TopicCluster[]> {
  const db = getDb();
  if (!db) return [];

  const [biz] = await db
    .select({ name: businesses.name, vertical: businesses.vertical, address: businesses.address })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) return [];

  const [config] = await db
    .select({ targetKeywords: businessConfigs.targetKeywords, serviceDescription: businessConfigs.serviceDescription })
    .from(businessConfigs)
    .where(eq(businessConfigs.businessId, businessId))
    .limit(1);

  const city = biz.address?.split(",")?.[1]?.trim() ?? "your city";

  // Gather existing content for context
  const [existing, queued] = await Promise.all([
    db
      .select({ title: publishedContent.title })
      .from(publishedContent)
      .where(eq(publishedContent.businessId, businessId))
      .limit(20),
    db
      .select({ title: contentQueue.title })
      .from(contentQueue)
      .where(eq(contentQueue.businessId, businessId))
      .limit(20),
  ]);

  const existingTitles = existing.map((e) => `- ${e.title} [published]`).join("\n");
  const queuedTitles = queued.map((q) => `- ${q.title} [queued]`).join("\n");

  const prompt = `You are a local SEO strategist. Create a topic cluster map for this business.

Business: ${biz.name}
Industry: ${biz.vertical ?? "local business"}
City: ${city}
Keywords: ${config?.targetKeywords ?? "not specified"}
Services: ${config?.serviceDescription ?? "not specified"}

Existing published content:
${existingTitles || "none yet"}

Queued content:
${queuedTitles || "none yet"}

Create 3-4 topic clusters. Each cluster has:
- One pillar topic (broad, high-traffic)
- 3-5 supporting articles (specific, long-tail)
- Mark each supporting article as "published", "queued", or "gap" (not yet created)
  - Match "published" to the existing published content titles above
  - Match "queued" to queued content titles above
  - Everything else is "gap"

Return ONLY valid JSON in this exact format:
{
  "clusters": [
    {
      "pillar": "Pillar topic title",
      "keyword": "primary keyword",
      "articles": [
        { "title": "Article title", "keyword": "keyword", "status": "published" },
        { "title": "Article title", "keyword": "keyword", "status": "gap" }
      ]
    }
  ]
}`;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];

  try {
    const raw = await openRouterChat({
      model: MODELS.content,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1000,
      temperature: 0.3,
    });

    if (!raw) return [];

    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const parsed = JSON.parse(cleaned) as ClusterMap;
    return parsed.clusters ?? [];
  } catch (err) {
    console.error("[topic-clusters] parse error", { error: String(err) });
    return [];
  }
}

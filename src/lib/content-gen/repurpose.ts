import { eq, and, inArray } from "drizzle-orm";
import { getDb, publishedContent, businesses, businessConfigs, contentQueue } from "@/lib/db";
import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";
import { normalizePlanTierFromDb } from "@/lib/plans";

const STYLE_RULES = `Writing rules:
- No em dashes. Use commas or periods instead.
- No AI clichés: do not use "delve", "leverage", "comprehensive", "robust", "moreover", "furthermore", "tapestry", "nuanced", "landscape".
- Write like a knowledgeable local, specific and direct.
- Do not pad with filler phrases or generic openers.`;

type SocialVariant = "instagram_caption" | "facebook_post" | "linkedin_post";

async function repurposeToInstagram(article: string, businessName: string, city: string): Promise<string | null> {
  return openRouterChat({
    model: MODELS.content,
    messages: [{
      role: "user",
      content: `Repurpose this article into an Instagram caption for ${businessName} in ${city}.

Article:
${article.slice(0, 2000)}

${STYLE_RULES}

Requirements:
- 80-120 words
- Strong hook in first line (no "Hey there!")
- Highlight one specific insight from the article
- Soft CTA mentioning ${city}
- End with 8-12 relevant hashtags on a new line
- No markdown headers

Write the caption now.`,
    }],
    maxTokens: 300,
    temperature: 0.8,
  });
}

async function repurposeToFacebook(article: string, businessName: string, city: string): Promise<string | null> {
  return openRouterChat({
    model: MODELS.content,
    messages: [{
      role: "user",
      content: `Repurpose this article into a Facebook business post for ${businessName} in ${city}.

Article:
${article.slice(0, 2000)}

${STYLE_RULES}

Requirements:
- 120-200 words
- Friendly and community-focused
- Surface one practical tip or insight from the article
- Mention ${city} once naturally
- End with a question to encourage comments
- No markdown headers, plain paragraphs

Write the post now.`,
    }],
    maxTokens: 350,
    temperature: 0.75,
  });
}

async function repurposeToLinkedIn(article: string, businessName: string, city: string): Promise<string | null> {
  return openRouterChat({
    model: MODELS.content,
    messages: [{
      role: "user",
      content: `Repurpose this article into a LinkedIn post for the owner of ${businessName} in ${city}.

Article:
${article.slice(0, 2000)}

${STYLE_RULES}

Requirements:
- 150-250 words
- Professional but not stiff
- Position the writer as a local expert
- Short paragraphs (2-3 sentences max each)
- End with a thought-provoking question or CTA
- No markdown headers

Write the post now.`,
    }],
    maxTokens: 400,
    temperature: 0.7,
  });
}

const VARIANT_GENERATORS: Record<SocialVariant, (article: string, biz: string, city: string) => Promise<string | null>> = {
  instagram_caption: repurposeToInstagram,
  facebook_post: repurposeToFacebook,
  linkedin_post: repurposeToLinkedIn,
};

const VARIANTS_BY_PLAN: Record<string, SocialVariant[]> = {
  free: [],
  starter: [],
  growth: ["instagram_caption", "facebook_post", "linkedin_post"],
  pro: ["instagram_caption", "facebook_post", "linkedin_post"],
  agency: ["instagram_caption", "facebook_post", "linkedin_post"],
};

function cityFromAddress(address: string | null | undefined): string {
  if (!address) return "your city";
  const parts = address.split(",");
  if (parts.length >= 2) return parts[1].trim();
  return address.trim();
}

export async function repurposePublishedArticle(publishedContentId: string): Promise<{ queued: number }> {
  const db = getDb();
  if (!db) return { queued: 0 };

  const [article] = await db
    .select()
    .from(publishedContent)
    .where(and(eq(publishedContent.id, publishedContentId), eq(publishedContent.status, "published")))
    .limit(1);

  if (!article || !article.businessId) return { queued: 0 };

  const [biz] = await db
    .select({ name: businesses.name, address: businesses.address, planTier: businesses.planTier })
    .from(businesses)
    .where(eq(businesses.id, article.businessId))
    .limit(1);

  if (!biz) return { queued: 0 };

  const tier = normalizePlanTierFromDb(biz.planTier);
  const variants = VARIANTS_BY_PLAN[tier] ?? [];
  if (variants.length === 0) return { queued: 0 };

  const city = cityFromAddress(biz.address);
  const rows: Array<typeof contentQueue.$inferInsert> = [];

  for (const variant of variants) {
    const generator = VARIANT_GENERATORS[variant];
    const body = await generator(article.body, biz.name, city);
    if (!body) continue;
    rows.push({
      businessId: article.businessId,
      kind: variant,
      title: `${variant.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}: ${article.title}`,
      outline: body,
      // Store source article ID so runRepurposeBatch can deduplicate
      targetKeyword: publishedContentId,
      status: "queued",
      variant: "social_repurpose",
    });
  }

  if (rows.length > 0) {
    await db.insert(contentQueue).values(rows);
  }

  return { queued: rows.length };
}

export async function runRepurposeBatch(batchSize = 5): Promise<{ processed: number; queued: number }> {
  const db = getDb();
  if (!db) return { processed: 0, queued: 0 };

  // Find recently published articles that haven't been repurposed yet (no social variants in queue)
  const recentArticles = await db
    .select({ id: publishedContent.id, businessId: publishedContent.businessId })
    .from(publishedContent)
    .where(and(
      eq(publishedContent.status, "published"),
      eq(publishedContent.channel, "internal_site"),
    ))
    .orderBy(publishedContent.createdAt)
    .limit(batchSize * 3);

  if (recentArticles.length === 0) return { processed: 0, queued: 0 };

  // Check which article IDs have already been repurposed (stored in targetKeyword)
  const articleIds = recentArticles.map((a) => a.id);
  const alreadyRepurposed = await db
    .select({ targetKeyword: contentQueue.targetKeyword })
    .from(contentQueue)
    .where(and(
      eq(contentQueue.variant, "social_repurpose"),
      inArray(contentQueue.targetKeyword, articleIds),
    ))
    .limit(1000);

  const repurposedArticleIds = new Set(
    alreadyRepurposed.map((r) => r.targetKeyword).filter(Boolean) as string[],
  );

  const unprocessed = recentArticles.filter((a) => !repurposedArticleIds.has(a.id));

  let processed = 0;
  let totalQueued = 0;

  for (const article of unprocessed.slice(0, batchSize)) {
    const result = await repurposePublishedArticle(article.id);
    totalQueued += result.queued;
    processed += 1;
  }

  return { processed, queued: totalQueued };
}

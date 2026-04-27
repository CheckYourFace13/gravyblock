import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";

export type ContentType = "article" | "gbp_post" | "reddit_post";

export type GeneratedContent = {
  type: ContentType;
  title: string;
  body: string;
  targetKeyword: string;
};

export type GenerateLocalContentParams = {
  businessName: string;
  industry: string;
  city: string;
  state: string;
  keywords: string[];
  tone: string;
  serviceDescription: string;
};

const STYLE_RULES = `Writing rules:
- No em dashes. Use commas or periods instead.
- No AI clichés: do not use "delve", "leverage", "comprehensive", "robust", "moreover", "furthermore", "tapestry", "nuanced", "landscape".
- Write like a knowledgeable local, specific and direct.
- Do not pad with filler phrases or generic openers like "In today's world" or "In conclusion".
- Use the city name naturally, not repetitively.`;

async function generateArticle(params: GenerateLocalContentParams): Promise<GeneratedContent | null> {
  const primaryKeyword = params.keywords[0] ?? `${params.industry} in ${params.city}`;
  const title = `Best ${params.industry} in ${params.city}: What to Look for in 2025`;

  const prompt = `Write a local SEO article for a business in ${params.city}, ${params.state}.

Business: ${params.businessName}
Industry: ${params.industry}
Target keywords: ${params.keywords.join(", ")}
Services: ${params.serviceDescription}
Tone: ${params.tone}

Article title: ${title}
Target keyword: ${primaryKeyword}

${STYLE_RULES}

Structure:
- One H1 (the title)
- 2-3 H2 sections with practical advice for locals
- 600-900 words total
- End with a soft, specific mention of ${params.businessName} as an example in ${params.city}

Write the full article in markdown now.`;

  const body = await openRouterChat({
    model: MODELS.content,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1200,
    temperature: 0.7,
  });

  if (!body) return null;

  return {
    type: "article",
    title,
    body,
    targetKeyword: primaryKeyword,
  };
}

async function generateGbpPost(params: GenerateLocalContentParams): Promise<GeneratedContent | null> {
  const primaryKeyword = params.keywords[0] ?? `${params.industry} ${params.city}`;
  const title = `${params.businessName} — ${params.city} Update`;

  const prompt = `Write a Google Business Profile post for a local business.

Business: ${params.businessName}
Industry: ${params.industry}
City: ${params.city}, ${params.state}
Services: ${params.serviceDescription}
Tone: ${params.tone}

${STYLE_RULES}

Requirements:
- 150-200 words
- Short, punchy paragraphs
- Mention one specific service or seasonal angle
- Include a clear call-to-action at the end naming ${params.city}
- No markdown headers, just plain paragraphs

Write the post now.`;

  const body = await openRouterChat({
    model: MODELS.content,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 400,
    temperature: 0.7,
  });

  if (!body) return null;

  return {
    type: "gbp_post",
    title,
    body,
    targetKeyword: primaryKeyword,
  };
}

async function generateRedditPost(params: GenerateLocalContentParams): Promise<GeneratedContent | null> {
  const primaryKeyword = params.keywords[1] ?? params.keywords[0] ?? `${params.industry} ${params.city}`;
  const title = `Looking for a good ${params.industry} in ${params.city} — here's what helped me`;

  const prompt = `Write a helpful Reddit-style community post for r/${params.city.toLowerCase().replace(/\s+/g, "")} or r/${params.industry.toLowerCase().replace(/\s+/g, "")}.

Business to mention naturally: ${params.businessName}
Industry: ${params.industry}
City: ${params.city}, ${params.state}
Services: ${params.serviceDescription}

${STYLE_RULES}

Requirements:
- 200-300 words
- First-person, conversational, community-helpful tone
- Answer the implicit question: "What should I look for in a ${params.industry}?"
- Give 3-4 genuine practical tips based on the service description
- Mention ${params.businessName} once near the end as a place the poster has used, naturally
- No hard sell, no marketing language
- Plain paragraphs, no markdown headers

Write the post now.`;

  const body = await openRouterChat({
    model: MODELS.content,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 500,
    temperature: 0.75,
  });

  if (!body) return null;

  return {
    type: "reddit_post",
    title,
    body,
    targetKeyword: primaryKeyword,
  };
}

export async function generateLocalContent(
  params: GenerateLocalContentParams,
): Promise<GeneratedContent[]> {
  const results = await Promise.allSettled([
    generateArticle(params),
    generateGbpPost(params),
    generateRedditPost(params),
  ]);

  const generated: GeneratedContent[] = [];

  for (const result of results) {
    if (result.status === "fulfilled" && result.value !== null) {
      generated.push(result.value);
    } else if (result.status === "rejected") {
      console.error("[content-gen] generation failed for one content type", {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  return generated;
}

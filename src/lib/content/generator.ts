import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";

const SYSTEM_PROMPT = `You are a local SEO content writer for GravyBlock, an automated local growth platform. You write clear, helpful, locally-relevant content for small businesses.

Rules:
- Write in plain, professional English. No jargon, no fluff, no filler phrases.
- Include the city name naturally 3-4 times throughout the piece.
- End every piece with a specific, local call-to-action (CTA) that names the city.
- Do not invent specific claims, awards, or statistics about the business.
- Do not use "In today's fast-paced world", "In conclusion", or similar openers.
- Format output as clean markdown with one H1, 2-3 H2s, and short paragraphs.
- Target length: 500-700 words for articles, 400-550 words for location pages.`;

type GenerateParams = {
  businessName: string;
  city: string;
  vertical: string | null;
  title: string;
  outline: string;
  targetKeyword: string | null;
  changeSummary?: string;
  address?: string | null;
  // Feature #3: Brand voice — injects business personality into every article
  brandVoice?: string | null;
};

export async function generateArticleBody(params: GenerateParams): Promise<string | null> {
  return openRouterChat({
    model: MODELS.content,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Write a local SEO article for this business:

Business name: ${params.businessName}
City: ${params.city}
Industry: ${params.vertical ?? "local business"}
Article title: ${params.title}
Target keyword: ${params.targetKeyword ?? "local services"}
Angle / outline: ${params.outline}${params.changeSummary ? `\nRecent context: ${params.changeSummary}` : ""}${params.brandVoice ? `\nBrand voice / tone: ${params.brandVoice}` : ""}

Write the full article in markdown now.`,
      },
    ],
  });
}

export async function generateLocalPageBody(params: GenerateParams): Promise<string | null> {
  return openRouterChat({
    model: MODELS.content,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Write a service-area location page for this business:

Business name: ${params.businessName}
City: ${params.city}${params.address ? `\nAddress: ${params.address}` : ""}
Industry: ${params.vertical ?? "local business"}
Page title: ${params.title}
Angle / outline: ${params.outline}${params.brandVoice ? `\nBrand voice / tone: ${params.brandVoice}` : ""}

Focus on local trust, service-area coverage, and neighborhood proof. Write the full page in markdown now.`,
      },
    ],
  });
}

// ─── Feature #2: Auto meta tags ──────────────────────────────────────────────

export async function generateMetaTags(params: {
  title: string;
  body: string;
  targetKeyword: string | null;
  businessName: string;
  city: string;
}): Promise<{ metaTitle: string; metaDescription: string } | null> {
  const raw = await openRouterChat({
    model: MODELS.content,
    maxTokens: 150,
    temperature: 0.3,
    messages: [
      {
        role: "user",
        content: `Write an SEO meta title and meta description for this article.

Article title: ${params.title}
Business: ${params.businessName} (${params.city})
Target keyword: ${params.targetKeyword ?? params.title}
Article excerpt: ${params.body.slice(0, 300)}

Rules:
- Meta title: 50-60 characters, include keyword and city naturally
- Meta description: 140-155 characters, compelling, includes a call to action
- Return ONLY valid JSON: {"metaTitle":"...","metaDescription":"..."}`,
      },
    ],
  });

  if (!raw) return null;
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    return JSON.parse(cleaned) as { metaTitle: string; metaDescription: string };
  } catch {
    return null;
  }
}

export async function generateOutreachPitch(params: {
  businessName: string;
  city: string;
  targetName: string;
  targetUrl: string;
  referenceUrl: string;
  changeSummary: string;
}): Promise<string | null> {
  return openRouterChat({
    model: MODELS.outreach,
    maxTokens: 300,
    temperature: 0.6,
    messages: [
      {
        role: "system",
        content:
          "You write short, professional outreach emails for local businesses. Be direct and specific. No fluff, no excessive flattery.",
      },
      {
        role: "user",
        content: `Write a 3-4 sentence outreach pitch from a local business to a community website or directory.

Business: ${params.businessName} (${params.city})
Target site: ${params.targetName} (${params.targetUrl})
Reference content: ${params.referenceUrl}
Context: ${params.changeSummary}

Propose a relevant local resource contribution or listing. Write only the pitch body — no subject line, no greeting, no sign-off.`,
      },
    ],
  });
}

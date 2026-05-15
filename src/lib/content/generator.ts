import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";

const SYSTEM_PROMPT = `You are a local SEO content writer for GravyBlock, an automated local growth platform. You write clear, helpful, locally-relevant content for small businesses optimized for both traditional search and AI-powered answer engines (ChatGPT, Perplexity, Google AI Overviews).

Core rules:
- Write in plain, professional English. No jargon, no fluff, no filler phrases.
- Include the city name naturally 3-4 times throughout the piece.
- End every piece with a specific, local call-to-action (CTA) that names the city.
- Do not invent specific claims, awards, or statistics about the business.
- Do not use "In today's fast-paced world", "In conclusion", or similar openers.
- Format output as clean markdown with one H1, 2-3 H2s, and short paragraphs.
- Target length: 500-700 words for articles, 400-550 words for location pages.

AEO/GEO citeable format (required for every piece):
- DIRECT ANSWER FIRST: The very first paragraph (before any H2) must be 1-2 sentences that directly answer the article's core question. Write it so an AI assistant could quote it verbatim as the answer.
- QUESTION H2s: Every H2 heading must be phrased as a question (e.g., "How Does Local SEO Help Restaurants in Austin?", "What Makes a Trusted Plumber Stand Out?").
- NUMBERED STEPS: Include at least one numbered list (1. 2. 3.) for any process, checklist, or sequence.
- KEY TAKEAWAY: Include exactly one blockquote (> text) with the single most important, quotable sentence from the piece.
- ATTRIBUTED STATS: If citing any statistic or research finding, attribute it explicitly: "According to Google..." or "A BrightLocal study found..." Never invent statistics.
- BOTTOM LINE: Immediately before the CTA, write one sentence starting with "Bottom line:" summarizing the core advice.`;

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

Required structure (in order):
1. H1 title
2. Direct answer paragraph (1-2 sentences answering the article's core question — AI engines will quote this)
3. 2-3 H2 sections each phrased as a question, each with body text and at least one numbered list or bullets
4. One blockquote (> ...) with the most quotable sentence
5. "Bottom line:" sentence
6. Local CTA naming ${params.city}

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

Required structure (in order):
1. H1 title
2. Direct answer paragraph: 1-2 sentences stating exactly what this business does in ${params.city} and who it serves — written so an AI assistant could quote it as a recommendation
3. 2-3 H2 sections each phrased as a question about the service area or business
4. One blockquote (> ...) with the strongest trust or proof statement
5. "Bottom line:" sentence
6. Local CTA naming ${params.city}

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
- Meta description: 140-155 characters — write it as a direct factual statement that answers the article's core question, not a marketing hook. AI search tools (ChatGPT, Perplexity, Google AI Overviews) pull meta descriptions as citation text, so it must read as a standalone fact or answer a real question.
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

// ─── Feature #5: Citeable excerpt extraction ─────────────────────────────────
// Pulls the direct-answer paragraph and blockquote from generated markdown.
// These are the sentences most likely to be quoted by ChatGPT, Perplexity,
// and Google AI Overviews. Used by the AI Citation Monitor to show customers
// what AI engines are likely citing from their published content.

export function extractCiteableExcerpts(markdown: string): {
  directAnswer: string | null;
  keyTakeaway: string | null;
  bottomLine: string | null;
} {
  const lines = markdown.split("\n").map((l) => l.trim()).filter(Boolean);

  // Direct answer: first non-heading paragraph (before first H2)
  let directAnswer: string | null = null;
  let pastH1 = false;
  for (const line of lines) {
    if (line.startsWith("# ")) { pastH1 = true; continue; }
    if (line.startsWith("## ")) break; // stop at first H2
    if (pastH1 && !line.startsWith("#") && !line.startsWith(">") && line.length > 40) {
      directAnswer = line;
      break;
    }
  }

  // Key takeaway: blockquote line (> ...)
  const blockquoteLine = lines.find((l) => l.startsWith("> "));
  const keyTakeaway = blockquoteLine ? blockquoteLine.replace(/^>\s*/, "").trim() : null;

  // Bottom line: line starting with "Bottom line:"
  const bottomLineLine = lines.find((l) => l.toLowerCase().startsWith("bottom line:"));
  const bottomLine = bottomLineLine ?? null;

  return { directAnswer, keyTakeaway, bottomLine };
}

// ─── Outreach ─────────────────────────────────────────────────────────────────

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

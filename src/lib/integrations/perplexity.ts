import { openRouterChat } from "@/lib/integrations/openrouter";

// Real, distinct engines — each genuinely queried, not one model relabeled three ways.
// - perplexity/sonar: Perplexity's actual production model, natively web-grounded.
// - openai/gpt-5-mini:online: real OpenAI model + OpenRouter's web-search plugin
//   (native grounding for OpenAI on OpenRouter), the closest feasible proxy for
//   ChatGPT's own web-search behavior available outside OpenAI's own product.
// - google/gemini-3.1-flash-lite:online: real Gemini model + native web grounding,
//   a reasonable proxy for Google AI Overviews.
// All three have live web access, unlike a bare model completion — without that,
// no amount of new content GravyBlock publishes could ever be "discovered".
const ENGINES: { platform: "perplexity" | "chatgpt" | "gemini"; model: string }[] = [
  { platform: "perplexity", model: "perplexity/sonar" },
  { platform: "chatgpt", model: "openai/gpt-5-mini:online" },
  { platform: "gemini", model: "google/gemini-3.1-flash-lite:online" },
];

export type AIVisibilityResult = {
  platform: "perplexity" | "chatgpt" | "gemini";
  query: string;
  mentioned: boolean;
  sentiment: "positive" | "neutral" | "negative";
  snippet: string | null;
  confidence: number;
};

function detectMention(text: string, businessName: string): boolean {
  return text.toLowerCase().includes(businessName.toLowerCase());
}

function detectSentiment(text: string, businessName: string): "positive" | "neutral" | "negative" {
  const lower = text.toLowerCase();
  const nameIdx = lower.indexOf(businessName.toLowerCase());
  if (nameIdx === -1) return "neutral";
  const context = lower.slice(Math.max(0, nameIdx - 80), nameIdx + 120);
  const positiveWords = ["great", "excellent", "top", "best", "highly", "recommended", "loved", "popular"];
  const negativeWords = ["poor", "bad", "worst", "avoid", "negative", "complaint", "issue", "problem"];
  const pos = positiveWords.filter((w) => context.includes(w)).length;
  const neg = negativeWords.filter((w) => context.includes(w)).length;
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

function extractSnippet(text: string, businessName: string, maxLen = 200): string | null {
  const idx = text.toLowerCase().indexOf(businessName.toLowerCase());
  if (idx === -1) return null;
  const snippet = text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + 160)).trim();
  return snippet.length > maxLen ? snippet.slice(0, maxLen) + "…" : snippet;
}

/**
 * Probes real AI engines for whether they mention this business. One query per
 * engine (not per engine per query) to keep cost predictable — these are paid
 * models, not the near-free batch model used for content generation.
 * Engines that fail individually (rate limit, API error) are skipped rather
 * than discarding the whole batch — partial real results beat none.
 */
export async function checkBusinessVisibilityInAI(input: {
  businessName: string;
  city: string;
  vertical: string | null;
}): Promise<AIVisibilityResult[]> {
  const { businessName, city, vertical } = input;
  const category = vertical ?? "local business";

  const queries = [
    `Best ${category} in ${city}`,
    `Top-rated ${category} near ${city}`,
    `Who are the leading ${category} providers in ${city}?`,
  ];

  const attempts = await Promise.allSettled(
    ENGINES.map(async (engine, idx) => {
      const query = queries[idx % queries.length];
      const responseText = await openRouterChat({
        model: engine.model,
        maxTokens: 512,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: `${query} Give a short answer with specific business names if you know them.`,
          },
        ],
      });
      if (responseText === null) return null;

      const mentioned = detectMention(responseText, businessName);
      const result: AIVisibilityResult = {
        platform: engine.platform,
        query,
        mentioned,
        sentiment: mentioned ? detectSentiment(responseText, businessName) : "neutral",
        snippet: mentioned ? extractSnippet(responseText, businessName) : null,
        confidence: mentioned ? 90 : 70,
      };
      return result;
    }),
  );

  const results: AIVisibilityResult[] = [];
  for (const attempt of attempts) {
    if (attempt.status === "fulfilled" && attempt.value !== null) {
      results.push(attempt.value);
    }
  }
  return results;
}

import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";

export type AIVisibilityResult = {
  platform: "perplexity" | "openrouter";
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

export async function checkBusinessVisibilityInAI(input: {
  businessName: string;
  city: string;
  vertical: string | null;
}): Promise<AIVisibilityResult[]> {
  const { businessName, city, vertical } = input;
  const category = vertical ?? "local business";
  const results: AIVisibilityResult[] = [];

  const queries = [
    `Best ${category} in ${city}`,
    `Top-rated ${category} near ${city}`,
    `Who are the leading ${category} providers in ${city}?`,
  ];

  for (const query of queries) {
    const responseText = await openRouterChat({
      model: MODELS.visibility,
      maxTokens: 512,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: `${query} Give a short answer with specific business names if you know them.`,
        },
      ],
    });

    if (responseText === null) {
      // API key not configured — return empty so caller uses synthetic fallback
      return [];
    }

    const mentioned = detectMention(responseText, businessName);
    results.push({
      platform: "perplexity",
      query,
      mentioned,
      sentiment: mentioned ? detectSentiment(responseText, businessName) : "neutral",
      snippet: mentioned ? extractSnippet(responseText, businessName) : null,
      confidence: mentioned ? 90 : 70,
    });
  }

  return results;
}

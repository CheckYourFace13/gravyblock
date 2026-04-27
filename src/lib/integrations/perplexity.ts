export type AIVisibilityResult = {
  platform: "perplexity" | "chatgpt" | "gemini";
  query: string;
  mentioned: boolean;
  sentiment: "positive" | "neutral" | "negative";
  snippet: string | null;
  confidence: number;
};

type PerplexityMessage = {
  role: "user" | "assistant";
  content: string;
};

type PerplexityResponse = {
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
};

function getApiKey(): string | null {
  return process.env.PERPLEXITY_API_KEY ?? null;
}

async function queryPerplexity(prompt: string): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: prompt }] satisfies PerplexityMessage[],
        max_tokens: 512,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      console.error("[perplexity] API error", res.status);
      return null;
    }

    const data = (await res.json()) as PerplexityResponse;
    return data.choices?.[0]?.message?.content ?? null;
  } catch (error) {
    console.error("[perplexity] fetch failed", { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

function detectMention(text: string, businessName: string): boolean {
  const needle = businessName.toLowerCase();
  return text.toLowerCase().includes(needle);
}

function detectSentiment(text: string, businessName: string): "positive" | "neutral" | "negative" {
  const lower = text.toLowerCase();
  const name = businessName.toLowerCase();
  const nameIdx = lower.indexOf(name);
  if (nameIdx === -1) return "neutral";

  // Look at the 200 chars surrounding the mention
  const context = lower.slice(Math.max(0, nameIdx - 80), nameIdx + 120);
  const positiveWords = ["great", "excellent", "top", "best", "highly", "recommended", "loved", "well-regarded", "popular"];
  const negativeWords = ["poor", "bad", "worst", "avoid", "negative", "complaint", "issue", "problem"];

  const positiveCount = positiveWords.filter((w) => context.includes(w)).length;
  const negativeCount = negativeWords.filter((w) => context.includes(w)).length;

  if (positiveCount > negativeCount) return "positive";
  if (negativeCount > positiveCount) return "negative";
  return "neutral";
}

function extractSnippet(text: string, businessName: string, maxLen = 200): string | null {
  const nameIdx = text.toLowerCase().indexOf(businessName.toLowerCase());
  if (nameIdx === -1) return null;
  const start = Math.max(0, nameIdx - 40);
  const end = Math.min(text.length, nameIdx + 160);
  const snippet = text.slice(start, end).trim();
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
    const prompt = `${query} Give me a short answer with specific business names if you know them.`;
    const responseText = await queryPerplexity(prompt);

    if (responseText === null) {
      // API not available — return empty (caller falls back to synthetic)
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

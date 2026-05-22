export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterResponse = {
  choices: Array<{ message: { content: string } }>;
};

// Model aliases — swap here to change cost/quality tradeoff globally
// Batch models run in background workers (rate limits are fine — they're spread over time)
// Interactive model is used for real-time user-facing requests — falls back if rate-limited
export const MODELS = {
  content: "mistralai/mistral-7b-instruct:free",     // batch: content generation
  outreach: "mistralai/mistral-7b-instruct:free",    // interactive: profile pull, copy
  visibility: "mistralai/mistral-7b-instruct:free",  // batch: AI visibility probes
} as const;

// Free-tier fallback chain — tried in order if primary model rate-limits (429)
const FALLBACK_MODELS = [
  "mistralai/mistral-7b-instruct:free",
  "google/gemma-2-9b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
];

async function callModel(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
  maxTokens: number,
  temperature: number,
): Promise<{ text: string | null; rateLimited: boolean }> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com",
        "X-Title": "GravyBlock",
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
    });

    if (res.status === 429) {
      console.warn("[openrouter] rate limited", { model });
      return { text: null, rateLimited: true };
    }

    if (!res.ok) {
      const text = await res.text();
      console.error("[openrouter] API error", { model, status: res.status, body: text.slice(0, 200) });
      return { text: null, rateLimited: false };
    }

    const data = (await res.json()) as OpenRouterResponse;
    return { text: data.choices?.[0]?.message?.content ?? null, rateLimited: false };
  } catch (error) {
    console.error("[openrouter] fetch failed", { model, error: error instanceof Error ? error.message : String(error) });
    return { text: null, rateLimited: false };
  }
}

export async function openRouterChat(params: {
  model: string;
  messages: OpenRouterMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const maxTokens = params.maxTokens ?? 1500;
  const temperature = params.temperature ?? 0.7;

  // Try primary model first
  const primary = await callModel(apiKey, params.model, params.messages, maxTokens, temperature);
  if (primary.text) return primary.text;

  // If rate-limited, try fallbacks in order (skipping the primary)
  if (primary.rateLimited) {
    for (const fallback of FALLBACK_MODELS) {
      if (fallback === params.model) continue;
      const result = await callModel(apiKey, fallback, params.messages, maxTokens, temperature);
      if (result.text) {
        console.info("[openrouter] used fallback model", { primary: params.model, fallback });
        return result.text;
      }
      if (!result.rateLimited) break; // non-rate-limit error — stop trying
    }
  }

  return null;
}

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterResponse = {
  choices: Array<{ message: { content: string } }>;
};

type CallResult = { text: string | null; rateLimited: boolean; modelNotFound: boolean };

// Model aliases — swap here to change cost/quality tradeoff globally
// Batch models run in background workers (rate limits are fine — they're spread over time)
// Interactive model is used for real-time user-facing requests — falls back if rate-limited
export const MODELS = {
  content: "meta-llama/llama-3.1-8b-instruct",    // batch: content generation (~$0.04/M tokens)
  outreach: "meta-llama/llama-3.1-8b-instruct",   // interactive: profile pull, copy
  visibility: "meta-llama/llama-3.1-8b-instruct", // batch: AI visibility probes
} as const;

// Fallback chain — tried in order if primary model rate-limits or has no endpoints
const FALLBACK_MODELS = [
  "meta-llama/llama-3.1-8b-instruct",
  "openai/gpt-4o-mini",
  "meta-llama/llama-3.2-3b-instruct:free",
  "qwen/qwen-2.5-7b-instruct:free",
];

async function callModel(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
  maxTokens: number,
  temperature: number,
): Promise<CallResult> {
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
      return { text: null, rateLimited: true, modelNotFound: false };
    }

    if (!res.ok) {
      const body = await res.text();
      const modelNotFound = res.status === 404 && body.includes("No endpoints found");
      if (modelNotFound) {
        console.warn("[openrouter] model not found, skipping", { model });
      } else {
        console.error("[openrouter] API error", { model, status: res.status, body: body.slice(0, 200) });
      }
      return { text: null, rateLimited: false, modelNotFound };
    }

    const data = (await res.json()) as OpenRouterResponse;
    return { text: data.choices?.[0]?.message?.content ?? null, rateLimited: false, modelNotFound: false };
  } catch (error) {
    console.error("[openrouter] fetch failed", { model, error: error instanceof Error ? error.message : String(error) });
    return { text: null, rateLimited: false, modelNotFound: false };
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

  // If rate-limited or model missing, try fallbacks in order (skipping the primary)
  if (primary.rateLimited || primary.modelNotFound) {
    for (const fallback of FALLBACK_MODELS) {
      if (fallback === params.model) continue;
      const result = await callModel(apiKey, fallback, params.messages, maxTokens, temperature);
      if (result.text) {
        console.info("[openrouter] used fallback model", { primary: params.model, fallback });
        return result.text;
      }
      // Keep trying if rate-limited or model not found; stop on real errors (auth, server, etc.)
      if (!result.rateLimited && !result.modelNotFound) break;
    }
  }

  return null;
}

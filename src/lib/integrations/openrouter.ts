export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterResponse = {
  choices: Array<{ message: { content: string } }>;
};

// Model aliases — swap here to change cost/quality tradeoff globally
export const MODELS = {
  content: "google/gemini-2.0-flash-001",  // cheap, solid for local SEO articles
  outreach: "anthropic/claude-3-haiku",    // better writing for short persuasive copy
  visibility: "perplexity/sonar",           // real web search for AI mention checks
} as const;

export async function openRouterChat(params: {
  model: string;
  messages: OpenRouterMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com",
        "X-Title": "GravyBlock",
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        max_tokens: params.maxTokens ?? 1500,
        temperature: params.temperature ?? 0.7,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[openrouter] API error", { status: res.status, body: text.slice(0, 200) });
      return null;
    }

    const data = (await res.json()) as OpenRouterResponse;
    return data.choices?.[0]?.message?.content ?? null;
  } catch (error) {
    console.error("[openrouter] fetch failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

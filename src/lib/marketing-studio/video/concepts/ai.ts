/**
 * One bounded call to the approved OpenRouter account for the creative step. No browsing, no tools: the model receives text and returns JSON. Every call is
 * cached, counted against the monthly cap before it is made, and costed from the provider's own usage report afterwards.
 */
import type { StudioDb } from "../../db";
import { assertRoom, cacheKey, getCached, putCached, record } from "./ai-budget";

/** An inexpensive, capable model (about $0.10 per million tokens in, $0.50 out). Changing it is a code change on purpose. */
export const AI_MODEL = "anthropic/claude-haiku-5.5";
const PRICE_IN = 0.1 / 1_000_000;
const PRICE_OUT = 0.5 / 1_000_000;

export type AiResult = { text: string; micros: number; cached: boolean; model: string };

export async function askJson(db: StudioDb, p: { specId: string; purpose: string; system: string; user: string; maxTokens: number; temperature?: number }): Promise<AiResult> {
  const key = cacheKey(AI_MODEL, p.system, p.user);
  const hit = await getCached(db, key);
  if (hit) return { text: hit.text, micros: 0, cached: true, model: hit.model };
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set for the Studio worker; AI generation is off and the studio carries on without it");
  // worst case, doubled: the whole prompt at 3 characters a token plus the full output allowance
  const worst = Math.ceil(((p.system.length + p.user.length) / 3 * PRICE_IN + p.maxTokens * PRICE_OUT) * 2 * 1_000_000);
  await assertRoom(db, worst);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com", "X-Title": "GravyBlock Marketing Studio" },
    body: JSON.stringify({ model: AI_MODEL, messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }], max_tokens: p.maxTokens, temperature: p.temperature ?? 0.8, response_format: { type: "json_object" }, reasoning: { effort: "low" }, usage: { include: true } }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: Array<{ finish_reason?: string; message?: { content?: string; refusal?: string | null } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } };
  const text = data.choices?.[0]?.message?.content ?? "";
  const tin = data.usage?.prompt_tokens ?? Math.ceil((p.system.length + p.user.length) / 3);
  const tout = data.usage?.completion_tokens ?? Math.ceil(text.length / 3);
  // the provider's exact cost when it reports one, else the published token prices
  const micros = Math.round((typeof data.usage?.cost === "number" ? data.usage.cost : tin * PRICE_IN + tout * PRICE_OUT) * 1_000_000);
  await record(db, { specId: p.specId, purpose: p.purpose, model: AI_MODEL, tokensIn: tin, tokensOut: tout, micros });
  if (!text) throw new Error(`the model returned no text (finish_reason ${data.choices?.[0]?.finish_reason ?? "none"}, refusal ${data.choices?.[0]?.message?.refusal ?? "none"}); cost ${micros} micro-dollars was still counted`);
  await putCached(db, key, { text, micros, model: AI_MODEL });
  return { text, micros, cached: false, model: AI_MODEL };
}

/** The first JSON object in a model reply, tolerant of fences and chatter around it. */
export function parseJson<T>(text: string): T | null {
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

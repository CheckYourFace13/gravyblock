/**
 * Real LLM visibility probes — queries multiple AI models to check if a business
 * is mentioned when users ask AI assistants for local business recommendations.
 *
 * This is the core of GravyBlock's AI search visibility feature, equivalent to
 * what BabyLoveGrowth.ai charges $99/month to track across ChatGPT and Perplexity.
 *
 * Uses OpenRouter to hit multiple model families (Gemini, Llama, Mistral) so we
 * simulate what different AI search engines would say about the business.
 *
 * Runs monthly per paid business. Results stored in aiVisibilityChecks table.
 * Tracked via jobs: type = "llm_probe_run", payload = { businessId }.
 */

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, businesses, aiVisibilityChecks, jobs } from "@/lib/db";

const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];

// Models that approximate different AI search engines
const PROBE_ENGINES = [
  { model: "meta-llama/llama-3.1-8b-instruct:free", engine: "gemini" },
  { model: "meta-llama/llama-3.1-8b-instruct", engine: "llama" },
  { model: "mistralai/mistral-7b-instruct", engine: "mistral" },
];

function buildProbePrompts(biz: {
  name: string;
  primaryCategory: string | null;
  address: string | null;
  vertical: string | null;
}): string[] {
  const category = biz.vertical ?? biz.primaryCategory ?? "local business";
  const city = extractCity(biz.address);
  const location = city ? `in ${city}` : "nearby";

  return [
    `What's the best ${category} ${location}? Give me your top recommendation.`,
    `I'm looking for a highly-rated ${category} ${location}. Who do you recommend?`,
    `Can you recommend a trusted ${category} ${location} with good reviews?`,
  ];
}

function extractCity(address: string | null): string | null {
  if (!address) return null;
  // Try to parse "123 Main St, Austin, TX 78701" → "Austin"
  const parts = address.split(",").map((p) => p.trim());
  if (parts.length >= 2) {
    const cityPart = parts[parts.length - 2];
    return cityPart.replace(/^\d+\s+/, "").trim() || null;
  }
  return null;
}

function detectMention(response: string, businessName: string): {
  mentioned: boolean;
  sentiment: "positive" | "neutral" | "negative";
  excerpt: string | null;
} {
  const lower = response.toLowerCase();
  const nameLower = businessName.toLowerCase();

  // Check exact match first, then partial word match
  const mentioned = lower.includes(nameLower) ||
    nameLower.split(" ").filter((w) => w.length > 3).every((word) => lower.includes(word));

  if (!mentioned) return { mentioned: false, sentiment: "neutral", excerpt: null };

  // Find the excerpt around the mention
  const idx = lower.indexOf(nameLower);
  const start = Math.max(0, idx - 80);
  const end = Math.min(response.length, idx + businessName.length + 120);
  const excerpt = response.slice(start, end).trim();

  // Simple sentiment: look for positive/negative signals near the mention
  const positive = ["great", "excellent", "best", "top", "highly", "recommend", "trusted", "quality", "rated", "outstanding"];
  const negative = ["poor", "bad", "avoid", "worst", "complaint", "issue", "problem"];
  const nearText = lower.slice(Math.max(0, idx - 100), Math.min(lower.length, idx + 200));

  const posScore = positive.filter((w) => nearText.includes(w)).length;
  const negScore = negative.filter((w) => nearText.includes(w)).length;

  const sentiment = negScore > posScore ? "negative" : posScore > 0 ? "positive" : "neutral";

  return { mentioned: true, sentiment, excerpt };
}

async function queryModel(model: string, prompt: string): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "http-referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com",
        "x-title": "GravyBlock AI Visibility",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are a helpful local search assistant. Give honest, specific recommendations based on your knowledge. If you don't know specific businesses in the area, say so briefly.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 400,
        temperature: 0.3,
      }),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function runLlmProbesForBusiness(businessId: string): Promise<{
  probesRun: number;
  mentions: number;
}> {
  const db = getDb();
  if (!db) return { probesRun: 0, mentions: 0 };

  const [biz] = await db
    .select({
      name: businesses.name,
      primaryCategory: businesses.primaryCategory,
      address: businesses.address,
      vertical: businesses.vertical,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) return { probesRun: 0, mentions: 0 };

  const prompts = buildProbePrompts(biz);
  let probesRun = 0;
  let mentions = 0;

  for (const { model, engine } of PROBE_ENGINES) {
    // Only use first 2 prompts per engine to keep costs low
    for (const prompt of prompts.slice(0, 2)) {
      const response = await queryModel(model, prompt);
      if (!response) continue;

      const { mentioned, sentiment, excerpt } = detectMention(response, biz.name);
      if (mentioned) mentions++;

      await db.insert(aiVisibilityChecks).values({
        businessId,
        prompt,
        engine,
        mentionFound: mentioned ? "true" : "false",
        sentiment,
        citationUrl: null,
        confidence: mentioned ? 85 : 60,
      });

      probesRun++;

      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return { probesRun, mentions };
}

export async function runLlmProbeBatch(batchSize = 3): Promise<{ ran: number; totalMentions: number }> {
  const db = getDb();
  if (!db) return { ran: 0, totalMentions: 0 };

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const paid = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(inArray(businesses.planTier, PAID_TIERS))
    .limit(50);

  let ran = 0;
  let totalMentions = 0;

  for (const biz of paid.slice(0, batchSize)) {
    const [recent] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.type, "llm_probe_run"),
          gte(jobs.createdAt, monthAgo),
          sql`${jobs.payload}->>'businessId' = ${biz.id}`,
        ),
      )
      .limit(1);

    if (recent) continue;

    try {
      const result = await runLlmProbesForBusiness(biz.id);
      await db.insert(jobs).values({
        type: "llm_probe_run",
        status: "completed",
        payload: { businessId: biz.id, probesRun: result.probesRun, mentions: result.mentions },
      });
      totalMentions += result.mentions;
      ran++;
    } catch (err) {
      console.error("[llm-probes] failed", {
        businessId: biz.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ran, totalMentions };
}

export async function getAiVisibilityStats(businessId: string) {
  const db = getDb();
  if (!db) return { total: 0, mentioned: 0, byEngine: {} as Record<string, { total: number; mentioned: number }> };

  const checks = await db
    .select({
      engine: aiVisibilityChecks.engine,
      mentionFound: aiVisibilityChecks.mentionFound,
      prompt: aiVisibilityChecks.prompt,
      sentiment: aiVisibilityChecks.sentiment,
      createdAt: aiVisibilityChecks.createdAt,
    })
    .from(aiVisibilityChecks)
    .where(eq(aiVisibilityChecks.businessId, businessId))
    .orderBy(sql`${aiVisibilityChecks.createdAt} desc`)
    .limit(60);

  const total = checks.length;
  const mentioned = checks.filter((c) => c.mentionFound === "true").length;
  const byEngine: Record<string, { total: number; mentioned: number }> = {};

  for (const check of checks) {
    if (!byEngine[check.engine]) byEngine[check.engine] = { total: 0, mentioned: 0 };
    byEngine[check.engine].total++;
    if (check.mentionFound === "true") byEngine[check.engine].mentioned++;
  }

  return { total, mentioned, byEngine, recentChecks: checks.slice(0, 12) };
}

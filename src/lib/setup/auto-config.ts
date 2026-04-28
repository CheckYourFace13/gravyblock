/**
 * Auto-generates a businessConfig from existing business data when the owner
 * has not filled out the setup form. Uses the LLM to synthesize reasonable
 * service description, keywords, and tone from GBP profile data.
 *
 * Called by the worker when queueContentForBusiness encounters a business
 * with no config row.
 */

import { eq } from "drizzle-orm";
import { getDb, businesses, businessConfigs, jobs } from "@/lib/db";
import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";

function cityFromAddress(address: string | null | undefined): string {
  if (!address) return "";
  const parts = address.split(",");
  return parts[1]?.trim() ?? "";
}

function stateFromAddress(address: string | null | undefined): string {
  if (!address) return "";
  const parts = address.split(",");
  return parts[2]?.trim().split(/\s+/)[0] ?? "";
}

type AutoConfigResult = {
  ok: boolean;
  skipped?: string;
};

export async function autoConfigBusiness(businessId: string): Promise<AutoConfigResult> {
  const db = getDb();
  if (!db) return { ok: false, skipped: "no_db" };

  // Check if config already exists
  const [existing] = await db
    .select({ id: businessConfigs.id })
    .from(businessConfigs)
    .where(eq(businessConfigs.businessId, businessId))
    .limit(1);

  if (existing) return { ok: false, skipped: "config_exists" };

  // Check if we already tried this business
  const [alreadyTried] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.type, `auto_config_${businessId}`))
    .limit(1);

  if (alreadyTried) return { ok: false, skipped: "already_attempted" };

  const [biz] = await db
    .select({
      name: businesses.name,
      vertical: businesses.vertical,
      primaryCategory: businesses.primaryCategory,
      address: businesses.address,
      website: businesses.website,
      phone: businesses.phone,
      rating: businesses.rating,
      reviewCount: businesses.reviewCount,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) return { ok: false, skipped: "business_not_found" };

  const city = cityFromAddress(biz.address);
  const state = stateFromAddress(biz.address);
  const industry = biz.vertical ?? biz.primaryCategory ?? "local business";

  const prompt = `You are writing marketing config for a local business. Based on this business profile data, generate:
1. A 2-3 sentence service description (what they do, who they serve, and what makes them good)
2. 5-8 target SEO keywords (comma-separated, local-intent phrases like "plumber in Austin TX")
3. Target city or cities (1-3, based on address)

Business data:
- Name: ${biz.name}
- Industry/Category: ${industry}
- Location: ${[city, state].filter(Boolean).join(", ") || "US"}
- Website: ${biz.website ?? "none listed"}
- Phone: ${biz.phone ?? "none listed"}
- Google rating: ${biz.rating ?? "unknown"} (${biz.reviewCount ?? 0} reviews)

Return ONLY valid JSON in this format, no markdown, no explanation:
{
  "serviceDescription": "...",
  "targetKeywords": "keyword1, keyword2, keyword3, keyword4, keyword5",
  "targetCities": "City, State"
}`;

  const response = await openRouterChat({
    model: MODELS.content,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 400,
    temperature: 0.5,
  });

  // Record the attempt regardless of success
  await db.insert(jobs).values({
    type: `auto_config_${businessId}`,
    status: "completed",
    payload: { businessId },
  });

  if (!response) return { ok: false, skipped: "no_llm_response" };

  let parsed: { serviceDescription?: string; targetKeywords?: string; targetCities?: string };
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? response);
  } catch {
    console.error("[auto-config] JSON parse failed", { businessId, response: response.slice(0, 200) });
    return { ok: false, skipped: "json_parse_failed" };
  }

  if (!parsed.serviceDescription) return { ok: false, skipped: "no_service_description" };

  await db.insert(businessConfigs).values({
    businessId,
    source: "auto_generated",
    serviceDescription: parsed.serviceDescription,
    targetKeywords: parsed.targetKeywords ?? null,
    targetCities: parsed.targetCities ?? (city || null),
    tone: "professional",
  });

  console.info("[auto-config] config generated", { businessId, industry });
  return { ok: true };
}

/** Run auto-config for all paid businesses without a config, up to batchSize per call. */
export async function runAutoConfigBatch(batchSize = 5): Promise<{ configured: number; skipped: number }> {
  const db = getDb();
  if (!db) return { configured: 0, skipped: 0 };

  const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];

  // Get paid businesses without a config
  const allPaid = await db
    .select({ id: businesses.id, planTier: businesses.planTier })
    .from(businesses)
    .limit(200);

  const paidBizIds = allPaid
    .filter((b) => PAID_TIERS.includes(b.planTier ?? ""))
    .map((b) => b.id);

  if (paidBizIds.length === 0) return { configured: 0, skipped: 0 };

  const existingConfigs = await db
    .select({ businessId: businessConfigs.businessId })
    .from(businessConfigs);

  const configuredIds = new Set(existingConfigs.map((c) => c.businessId));
  const unconfigured = paidBizIds.filter((id) => !configuredIds.has(id));

  let configured = 0;
  let skipped = 0;

  for (const bizId of unconfigured.slice(0, batchSize)) {
    const result = await autoConfigBusiness(bizId);
    if (result.ok) configured++;
    else skipped++;
  }

  return { configured, skipped };
}

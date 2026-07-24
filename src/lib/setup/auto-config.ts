/**
 * Auto-generates a full businessConfig from existing business data + website scrape.
 * Runs via the worker for every paid business without a config row.
 */

import { eq, inArray } from "drizzle-orm";
import { getDb, businesses, businessConfigs, jobs, auditFindings, placeProfiles } from "@/lib/db";
import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";
import { extractJsonObject } from "@/lib/ai/json-extract";

const MAX_AUTO_CONFIG_ATTEMPTS = 3;

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

/** Fetch the business homepage and extract readable text (max 2000 chars). */
async function scrapeWebsiteText(url: string): Promise<string> {
  try {
    const normalised = url.startsWith("http") ? url : `https://${url}`;
    const res = await fetch(normalised, {
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "GravyBlock-Crawler/1.0 (marketing analysis)" },
    });
    if (!res.ok) return "";
    const html = await res.text();
    // Strip tags, collapse whitespace, take first 2000 chars
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);
    return text;
  } catch {
    return "";
  }
}

type AutoConfigResult = { ok: boolean; skipped?: string };

export async function autoConfigBusiness(businessId: string): Promise<AutoConfigResult> {
  const db = getDb();
  if (!db) return { ok: false, skipped: "no_db" };

  // Skip if config already exists
  const [existing] = await db
    .select({ id: businessConfigs.id })
    .from(businessConfigs)
    .where(eq(businessConfigs.businessId, businessId))
    .limit(1);
  if (existing) return { ok: false, skipped: "config_exists" };

  // Skip only after repeated failures — a single transient LLM/parse hiccup
  // must not permanently strand a paying customer with no config at all.
  // Each failed attempt is logged under a distinct type so it doesn't collide
  // with (or get mistaken for) a successful completion.
  const priorAttempts = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.type, `auto_config_attempt_${businessId}`));
  if (priorAttempts.length >= MAX_AUTO_CONFIG_ATTEMPTS) return { ok: false, skipped: "max_attempts_reached" };

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
      businessModel: businesses.businessModel,
      focusArea: businesses.focusArea,
      targetScope: businesses.targetScope,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) return { ok: false, skipped: "business_not_found" };

  const city = cityFromAddress(biz.address);
  const state = stateFromAddress(biz.address);
  const industry = biz.vertical ?? biz.primaryCategory ?? "local business";

  // Scrape website for richer context
  const websiteText = biz.website ? await scrapeWebsiteText(biz.website) : "";

  // Pull any audit findings for extra context
  const findings = await db
    .select({ title: auditFindings.title, category: auditFindings.category })
    .from(auditFindings)
    .where(eq(auditFindings.businessId, businessId))
    .limit(8);

  // Pull place profile for types/categories
  const [place] = await db
    .select({ types: placeProfiles.types })
    .from(placeProfiles)
    .where(eq(placeProfiles.businessId, businessId))
    .limit(1);

  const prompt = `You are setting up a GravyBlock marketing profile for a local business. Generate a complete, realistic business profile using ONLY the data provided. Do NOT invent facts.

BUSINESS DATA:
- Name: ${biz.name}
- Category: ${industry}
- Address: ${biz.address ?? "not provided"}
- City/State: ${[city, state].filter(Boolean).join(", ") || "US"}
- Website: ${biz.website ?? "none"}
- Phone: ${biz.phone ?? "none"}
- Google rating: ${biz.rating ?? "unknown"} (${biz.reviewCount ?? 0} reviews)
- Business model: ${biz.businessModel ?? "single_location"}
${place?.types ? `- Place types: ${JSON.stringify(place.types)}` : ""}
${findings.length ? `- Audit findings:\n${findings.map((f) => `  • ${f.category}: ${f.title}`).join("\n")}` : ""}
${websiteText ? `\nWEBSITE CONTENT (first 2000 chars):\n${websiteText}` : ""}

Return ONLY valid JSON, no markdown, no extra text:
{
  "serviceDescription": "2-3 sentences: what they do, who they serve, what makes them reliable",
  "uniqueSellingPoints": "3-4 bullet points starting with •",
  "tone": "professional|friendly|authoritative|casual",
  "targetKeywords": "5-8 comma-separated SEO phrases with location, e.g. plumber Austin TX",
  "targetCities": "comma-separated cities they serve",
  "focusArea": "local|regional|national|online",
  "targetScope": "primary city and state, e.g. Austin, TX",
  "additionalContext": "1-2 sentences of extra context from website/data useful for writing content"
}`;

  // Builds a usable config straight from scraped/Google data, no LLM needed —
  // used once we've exhausted retries so the business still ends up with a
  // real businessConfigs row instead of silently having none forever.
  function buildFallbackConfig() {
    const location = [city, state].filter(Boolean).join(", ");
    return {
      serviceDescription: `${biz!.name} is a ${industry.toLowerCase()}${location ? ` serving ${location}` : ""}.`,
      uniqueSellingPoints: null,
      tone: "professional",
      targetKeywords: null,
      targetCities: city || null,
      focusArea: biz!.focusArea ?? "local",
      targetScope: biz!.targetScope ?? (city ? `${city}, ${state}` : null),
      additionalContext: websiteText ? websiteText.slice(0, 300) : null,
    };
  }

  // Logs the failed attempt; only after MAX_AUTO_CONFIG_ATTEMPTS do we stop
  // retrying and fall back to a scrape-only config so onboarding never just
  // silently dead-ends for the customer.
  async function recordFailureAndMaybeFallback(reason: string): Promise<AutoConfigResult> {
    await db!.insert(jobs).values({
      type: `auto_config_attempt_${businessId}`,
      status: "failed",
      payload: { businessId, reason },
    });
    const attemptCount = priorAttempts.length + 1;
    if (attemptCount < MAX_AUTO_CONFIG_ATTEMPTS) {
      console.warn(`[auto-config] attempt ${attemptCount} failed (${reason}), will retry next batch`, { businessId });
      return { ok: false, skipped: reason };
    }
    console.warn(`[auto-config] giving up after ${attemptCount} attempts (${reason}), using scrape-only fallback`, { businessId });
    await db!.insert(businessConfigs).values({
      businessId,
      source: "auto_generated_fallback",
      ...buildFallbackConfig(),
    });
    return { ok: true, skipped: `fallback_after_${reason}` };
  }

  const response = await openRouterChat({
    model: MODELS.outreach,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 600,
    temperature: 0.4,
  });

  if (!response) return recordFailureAndMaybeFallback("no_llm_response");

  let parsed: Record<string, string>;
  try {
    const jsonText = extractJsonObject(response);
    if (!jsonText) throw new Error("no JSON object found in response");
    parsed = JSON.parse(jsonText) as Record<string, string>;
  } catch (err) {
    console.warn("[auto-config] JSON parse failed", {
      businessId,
      error: err instanceof Error ? err.message : String(err),
      response: response.slice(0, 200),
    });
    return recordFailureAndMaybeFallback("json_parse_failed");
  }

  if (!parsed.serviceDescription) return recordFailureAndMaybeFallback("no_service_description");

  await db.insert(businessConfigs).values({
    businessId,
    source: "auto_generated",
    serviceDescription: parsed.serviceDescription,
    uniqueSellingPoints: parsed.uniqueSellingPoints ?? null,
    tone: (parsed.tone as string) ?? "professional",
    targetKeywords: parsed.targetKeywords ?? null,
    targetCities: parsed.targetCities ?? (city || null),
    focusArea: (parsed.focusArea as string) ?? biz.focusArea ?? "local",
    targetScope: parsed.targetScope ?? biz.targetScope ?? (city ? `${city}, ${state}` : null),
    additionalContext: parsed.additionalContext ?? null,
  });

  console.info("[auto-config] full profile generated", { businessId, industry, hasWebsiteText: websiteText.length > 0 });
  return { ok: true };
}

/** Run auto-config for all paid businesses without a config, up to batchSize per call. */
export async function runAutoConfigBatch(batchSize = 5): Promise<{ configured: number; skipped: number }> {
  const db = getDb();
  if (!db) return { configured: 0, skipped: 0 };

  const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];

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

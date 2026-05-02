"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, businesses, businessConfigs, placeProfiles, auditFindings } from "@/lib/db";
import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";
import { requireBusinessAccess } from "@/lib/auth/customer-guards";

export type BusinessProfileData = {
  serviceDescription: string;
  uniqueSellingPoints: string;
  tone: string;
  brandVoice: string;
  targetKeywords: string;
  targetCities: string;
  competitorNames: string;
  additionalContext: string;
  focusArea: string;
  targetScope: string;
  instagramHandle: string;
  facebookUrl: string;
};

export async function getBusinessProfile(businessId: string): Promise<{
  business: {
    name: string;
    address: string | null;
    website: string | null;
    primaryCategory: string | null;
    vertical: string | null;
    rating: string | null;
    reviewCount: number | null;
    phone: string | null;
  };
  config: BusinessProfileData | null;
  profileExists: boolean;
}> {
  await requireBusinessAccess(businessId);
  const db = getDb();
  if (!db) throw new Error("No database");

  const [biz] = await db
    .select({
      name: businesses.name,
      address: businesses.address,
      website: businesses.website,
      primaryCategory: businesses.primaryCategory,
      vertical: businesses.vertical,
      rating: businesses.rating,
      reviewCount: businesses.reviewCount,
      phone: businesses.phone,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) throw new Error("Business not found");

  const [cfg] = await db
    .select()
    .from(businessConfigs)
    .where(eq(businessConfigs.businessId, businessId))
    .limit(1);

  return {
    business: biz,
    config: cfg
      ? {
          serviceDescription: cfg.serviceDescription ?? "",
          uniqueSellingPoints: cfg.uniqueSellingPoints ?? "",
          tone: cfg.tone ?? "professional",
          brandVoice: cfg.brandVoice ?? "",
          targetKeywords: cfg.targetKeywords ?? "",
          targetCities: cfg.targetCities ?? "",
          competitorNames: cfg.competitorNames ?? "",
          additionalContext: cfg.additionalContext ?? "",
          focusArea: cfg.focusArea ?? "local",
          targetScope: cfg.targetScope ?? "",
          instagramHandle: cfg.instagramHandle ?? "",
          facebookUrl: cfg.facebookUrl ?? "",
        }
      : null,
    profileExists: Boolean(cfg),
  };
}

export async function saveBusinessProfile(
  businessId: string,
  data: BusinessProfileData,
): Promise<{ ok: boolean; error?: string }> {
  await requireBusinessAccess(businessId);
  const db = getDb();
  if (!db) return { ok: false, error: "No database" };

  try {
    const existing = await db
      .select({ id: businessConfigs.id })
      .from(businessConfigs)
      .where(eq(businessConfigs.businessId, businessId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(businessConfigs)
        .set({
          serviceDescription: data.serviceDescription,
          uniqueSellingPoints: data.uniqueSellingPoints,
          tone: data.tone,
          brandVoice: data.brandVoice || null,
          targetKeywords: data.targetKeywords,
          targetCities: data.targetCities,
          competitorNames: data.competitorNames,
          additionalContext: data.additionalContext,
          focusArea: data.focusArea,
          targetScope: data.targetScope,
          instagramHandle: data.instagramHandle,
          facebookUrl: data.facebookUrl,
          updatedAt: new Date(),
        })
        .where(eq(businessConfigs.businessId, businessId));
    } else {
      await db.insert(businessConfigs).values({
        businessId,
        source: "owner_form",
        serviceDescription: data.serviceDescription,
        uniqueSellingPoints: data.uniqueSellingPoints,
        tone: data.tone,
        brandVoice: data.brandVoice || null,
        targetKeywords: data.targetKeywords,
        targetCities: data.targetCities,
        competitorNames: data.competitorNames,
        additionalContext: data.additionalContext,
        focusArea: data.focusArea,
        targetScope: data.targetScope,
        instagramHandle: data.instagramHandle,
        facebookUrl: data.facebookUrl,
      });
    }

    revalidatePath(`/workspace/${businessId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}

export async function generateBusinessProfile(businessId: string): Promise<{
  ok: boolean;
  profile?: BusinessProfileData;
  error?: string;
}> {
  await requireBusinessAccess(businessId);
  const db = getDb();
  if (!db) return { ok: false, error: "No database" };

  // Gather all available data
  const [biz] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) return { ok: false, error: "Business not found" };

  const [place] = await db
    .select()
    .from(placeProfiles)
    .where(eq(placeProfiles.businessId, businessId))
    .limit(1);

  const findings = await db
    .select({ title: auditFindings.title, detail: auditFindings.detail, category: auditFindings.category })
    .from(auditFindings)
    .where(eq(auditFindings.businessId, businessId))
    .limit(10);

  const prompt = `You are helping a local business owner set up their GravyBlock marketing profile. Based on the data below, generate a realistic, specific business profile. Do NOT make up facts — only use what is provided or make reasonable inferences clearly labeled.

BUSINESS DATA:
- Name: ${biz.name}
- Category: ${biz.primaryCategory ?? biz.vertical ?? "unknown"}
- Address: ${biz.address ?? "not provided"}
- Website: ${biz.website ?? "not provided"}
- Phone: ${biz.phone ?? "not provided"}
- Google rating: ${biz.rating ?? "unknown"} (${biz.reviewCount ?? 0} reviews)
- Business model: ${biz.businessModel ?? "single_location"}
${place ? `- Place types: ${JSON.stringify(place.types ?? [])}` : ""}
${findings.length ? `- Top audit findings:\n${findings.map((f) => `  • ${f.category}: ${f.title}`).join("\n")}` : ""}

Return ONLY a valid JSON object with these exact keys (no markdown, no explanation):
{
  "serviceDescription": "2-3 sentence description of what this business does and who it serves",
  "uniqueSellingPoints": "3-4 bullet points of what makes this business stand out (based on category/data)",
  "tone": "professional|friendly|authoritative|casual",
  "brandVoice": "2-3 sentences describing the writing style and personality — e.g. 'Conversational and warm, like a trusted neighbor. Uses simple language, avoids jargon, and always ends with a clear action.'",
  "targetKeywords": "comma-separated list of 5-8 search terms this business should rank for",
  "targetCities": "comma-separated city names they serve (based on address/region)",
  "competitorNames": "",
  "additionalContext": "any other relevant context about the business that would help AI write better content",
  "focusArea": "local|regional|national|online",
  "targetScope": "city and state they primarily serve",
  "instagramHandle": "",
  "facebookUrl": ""
}`;

  const raw = await openRouterChat({
    model: MODELS.outreach,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 800,
    temperature: 0.4,
  });

  if (!raw) return { ok: false, error: "AI generation failed — check OPENROUTER_API_KEY" };

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]) as BusinessProfileData;
    return { ok: true, profile: parsed };
  } catch {
    return { ok: false, error: "Could not parse AI response — try again" };
  }
}

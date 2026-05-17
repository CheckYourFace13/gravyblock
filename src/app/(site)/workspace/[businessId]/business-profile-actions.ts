"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, businesses, businessConfigs, placeProfiles, auditFindings, socialProfiles } from "@/lib/db";
import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";
import { requireBusinessAccess } from "@/lib/auth/customer-guards";

export type BusinessProfileData = {
  serviceDescription: string;
  uniqueSellingPoints: string;
  tone: string;
  brandVoice: string;
  targetKeywords: string;
  /** Stored as "{city}, {state} (within {radius} miles)" — parsed by the UI */
  targetCities: string;
  competitorNames: string;
  additionalContext: string;
  focusArea: string;
  targetScope: string;
  instagramHandle: string;
  facebookUrl: string;
};

export type DiscoveredSocial = {
  platform: string;
  url: string;
  handle: string | null;
  confidence: number;
};

/** Scrape homepage and return first 3000 chars of readable text */
async function scrapeWebsiteText(url: string): Promise<{ text: string; ok: boolean }> {
  try {
    const normalised = url.startsWith("http") ? url : `https://${url}`;
    const res = await fetch(normalised, {
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "GravyBlock-Crawler/1.0 (marketing analysis)" },
    });
    if (!res.ok) return { text: "", ok: false };
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);
    return { text, ok: true };
  } catch {
    return { text: "", ok: false };
  }
}

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
  discoveredSocials: DiscoveredSocial[];
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

  // Fetch any social profiles discovered at scan time
  const socials = await db
    .select({
      platform: socialProfiles.platform,
      url: socialProfiles.url,
      handle: socialProfiles.handle,
      confidence: socialProfiles.confidence,
    })
    .from(socialProfiles)
    .where(eq(socialProfiles.businessId, businessId))
    .orderBy(socialProfiles.confidence);

  // Dedupe by platform, keep highest confidence
  const bestByPlatform = new Map<string, typeof socials[0]>();
  for (const s of socials) {
    const prev = bestByPlatform.get(s.platform);
    if (!prev || s.confidence > prev.confidence) bestByPlatform.set(s.platform, s);
  }
  const discoveredSocials = [...bestByPlatform.values()];

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
    discoveredSocials,
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
  sources?: { websiteScraped: boolean; socialFound: string[]; websiteUrl: string | null };
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

  // Pull discovered social profiles
  const socials = await db
    .select({ platform: socialProfiles.platform, url: socialProfiles.url, handle: socialProfiles.handle, confidence: socialProfiles.confidence })
    .from(socialProfiles)
    .where(eq(socialProfiles.businessId, businessId));

  const bestSocials = new Map<string, typeof socials[0]>();
  for (const s of socials) {
    const prev = bestSocials.get(s.platform);
    if (!prev || s.confidence > prev.confidence) bestSocials.set(s.platform, s);
  }

  const fbProfile = bestSocials.get("facebook");
  const igProfile = bestSocials.get("instagram");
  const socialFoundPlatforms = [...bestSocials.keys()];

  // Scrape the website for richer context — this is the PRIMARY source
  const { text: websiteText, ok: websiteOk } = biz.website
    ? await scrapeWebsiteText(biz.website)
    : { text: "", ok: false };

  const socialContext = socialFoundPlatforms.length > 0
    ? `\nSOCIAL PROFILES FOUND ON WEBSITE:\n${[...bestSocials.values()].map(s => `- ${s.platform}: ${s.url}${s.handle ? ` (@${s.handle})` : ""}`).join("\n")}`
    : "";

  const prompt = `You are helping a local business owner set up their GravyBlock marketing profile. Use the WEBSITE CONTENT as the PRIMARY source — it is the most accurate description of the business. Only use Google data to fill gaps.

BUSINESS DATA (from Google):
- Name: ${biz.name}
- Category: ${biz.primaryCategory ?? biz.vertical ?? "unknown"}
- Address: ${biz.address ?? "not provided"}
- Website: ${biz.website ?? "not provided"}
- Phone: ${biz.phone ?? "not provided"}
- Google rating: ${biz.rating ?? "unknown"} (${biz.reviewCount ?? 0} reviews)
${place ? `- Place types: ${JSON.stringify(place.types ?? [])}` : ""}
${findings.length ? `- Top audit findings:\n${findings.map((f) => `  • ${f.category}: ${f.title}`).join("\n")}` : ""}
${socialContext}
${websiteText ? `\nWEBSITE CONTENT (scrape — use this as primary source):\n${websiteText}` : "\nNOTE: Website could not be scraped. Use Google data only."}

INSTRUCTIONS:
- Pull the service description directly from website language where possible — don't paraphrase
- Unique selling points should reflect what the website actually emphasizes
- Target keywords should match the services and city mentioned on the site
- Service area: set targetScope to the primary city from the address/site
- Social handles: use the discovered social profiles above — do NOT invent these
- If something is not mentioned on the website or in the data, leave it blank rather than guessing

Return ONLY a valid JSON object with these exact keys (no markdown, no explanation):
{
  "serviceDescription": "2-3 sentences pulled from the website describing what this business does and who it serves",
  "uniqueSellingPoints": "3-4 bullet points (starting with •) drawn from the website's own language about what sets them apart",
  "tone": "professional|friendly|authoritative|casual",
  "brandVoice": "2-3 sentences describing the writing style based on the website's actual copy",
  "targetKeywords": "comma-separated list of 5-8 search terms this business should rank for",
  "targetCities": "${biz.address?.split(",")[1]?.trim() ?? ""}, ${biz.address?.split(",")[2]?.trim()?.split(/\s+/)[0] ?? ""} (within 25 miles)",
  "competitorNames": "",
  "additionalContext": "any other relevant context from the website useful for AI content writing",
  "focusArea": "local|regional|national|online",
  "targetScope": "primary city and state from the website/address",
  "instagramHandle": "${igProfile?.handle ?? igProfile?.url ?? ""}",
  "facebookUrl": "${fbProfile?.url ?? ""}"
}`;

  const raw = await openRouterChat({
    model: MODELS.outreach,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 900,
    temperature: 0.3,
  });

  // If AI is unavailable, build a basic profile directly from scraped + Google data
  if (!raw) {
    const city = biz.address?.split(",")[1]?.trim() ?? "";
    const state = biz.address?.split(",")[2]?.trim()?.split(/\s+/)[0] ?? "";
    const vertical = biz.primaryCategory ?? biz.vertical ?? "local business";
    const fallbackProfile: BusinessProfileData = {
      serviceDescription: websiteText
        ? websiteText.slice(0, 300).replace(/\s+/g, " ").trim()
        : `${biz.name} is a ${vertical} serving ${city}${state ? ", " + state : ""}.`,
      uniqueSellingPoints: findings.length
        ? findings.slice(0, 4).map((f) => `• ${f.title}`).join("\n")
        : `• Local ${vertical} serving ${city}\n• ${biz.reviewCount ?? 0} Google reviews`,
      tone: "friendly",
      brandVoice: `Clear, helpful, and locally-focused content for ${city} customers.`,
      targetKeywords: `${vertical} ${city}, ${vertical} near me, best ${vertical} in ${city}`,
      targetCities: `${city}${state ? ", " + state : ""} (within 25 miles)`,
      competitorNames: "",
      additionalContext: "",
      focusArea: "local",
      targetScope: `${city}${state ? ", " + state : ""}`,
      instagramHandle: igProfile?.handle ? (igProfile.handle.startsWith("@") ? igProfile.handle : `@${igProfile.handle}`) : (igProfile?.url ?? ""),
      facebookUrl: fbProfile?.url ?? "",
    };
    return {
      ok: true,
      profile: fallbackProfile,
      sources: { websiteScraped: websiteOk, socialFound: socialFoundPlatforms, websiteUrl: biz.website },
    };
  }

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]) as BusinessProfileData;

    // Ensure discovered socials override AI guesses
    if (igProfile?.handle) parsed.instagramHandle = igProfile.handle.startsWith("@") ? igProfile.handle : `@${igProfile.handle}`;
    else if (igProfile?.url) parsed.instagramHandle = igProfile.url;
    if (fbProfile?.url) parsed.facebookUrl = fbProfile.url;

    return {
      ok: true,
      profile: parsed,
      sources: {
        websiteScraped: websiteOk,
        socialFound: socialFoundPlatforms,
        websiteUrl: biz.website,
      },
    };
  } catch {
    return { ok: false, error: "Could not parse AI response — try again" };
  }
}

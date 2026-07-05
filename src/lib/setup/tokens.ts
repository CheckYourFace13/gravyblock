import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, setupTokens, businessConfigs, businesses, socialProfiles } from "@/lib/db";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createSetupToken(businessId: string, email: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await db.insert(setupTokens).values({ businessId, token, email, expiresAt });
  return token;
}

/** Best (highest-confidence) discovered social URL per platform, from the scan. */
async function getDiscoveredSocials(db: NonNullable<ReturnType<typeof getDb>>, businessId: string) {
  const rows = await db
    .select({ platform: socialProfiles.platform, url: socialProfiles.url, handle: socialProfiles.handle, confidence: socialProfiles.confidence })
    .from(socialProfiles)
    .where(eq(socialProfiles.businessId, businessId));
  const bestByPlatform = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const prev = bestByPlatform.get(r.platform);
    if (!prev || r.confidence > prev.confidence) bestByPlatform.set(r.platform, r);
  }
  return bestByPlatform;
}

export async function resolveSetupToken(token: string) {
  const db = getDb();
  if (!db) return null;
  const [row] = await db.select().from(setupTokens).where(eq(setupTokens.token, token)).limit(1);
  if (!row) return null;
  if (row.usedAt) return null;
  if (new Date() > row.expiresAt) return null;
  const [biz] = await db.select().from(businesses).where(eq(businesses.id, row.businessId)).limit(1);
  const [config] = await db.select().from(businessConfigs).where(eq(businessConfigs.businessId, row.businessId)).limit(1);
  const socials = await getDiscoveredSocials(db, row.businessId);
  return {
    token: row,
    business: biz ?? null,
    config: config ?? null,
    discoveredSocials: {
      instagram: socials.get("instagram")?.handle ?? socials.get("instagram")?.url ?? "",
      tiktok: socials.get("tiktok")?.handle ?? socials.get("tiktok")?.url ?? "",
      facebook: socials.get("facebook")?.url ?? "",
    },
  };
}

export type SetupFormData = {
  targetKeywords: string;
  targetCities: string;
  serviceDescription: string;
  uniqueSellingPoints: string;
  tone: string;
  competitorNames: string;
  instagramHandle: string;
  facebookUrl: string;
  tiktokHandle: string;
  additionalContext: string;
};

export async function saveSetupConfig(token: string, data: SetupFormData): Promise<boolean> {
  const db = getDb();
  if (!db) return false;

  const resolved = await resolveSetupToken(token);
  if (!resolved) return false;

  const { businessId } = resolved.token;

  await db
    .insert(businessConfigs)
    .values({
      businessId,
      source: "owner_form",
      targetKeywords: data.targetKeywords || null,
      targetCities: data.targetCities || null,
      serviceDescription: data.serviceDescription || null,
      uniqueSellingPoints: data.uniqueSellingPoints || null,
      tone: data.tone || "professional",
      competitorNames: data.competitorNames || null,
      instagramHandle: data.instagramHandle || null,
      facebookUrl: data.facebookUrl || null,
      tiktokHandle: data.tiktokHandle || null,
      additionalContext: data.additionalContext || null,
    })
    .onConflictDoUpdate({
      target: businessConfigs.businessId,
      set: {
        source: "owner_form",
        targetKeywords: data.targetKeywords || null,
        targetCities: data.targetCities || null,
        serviceDescription: data.serviceDescription || null,
        uniqueSellingPoints: data.uniqueSellingPoints || null,
        tone: data.tone || "professional",
        competitorNames: data.competitorNames || null,
        instagramHandle: data.instagramHandle || null,
        facebookUrl: data.facebookUrl || null,
        tiktokHandle: data.tiktokHandle || null,
        additionalContext: data.additionalContext || null,
        updatedAt: new Date(),
      },
    });

  await db
    .update(setupTokens)
    .set({ usedAt: new Date() })
    .where(eq(setupTokens.token, token));

  return true;
}

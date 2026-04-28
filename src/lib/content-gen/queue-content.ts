import { eq, and, count } from "drizzle-orm";
import { getDb, businesses, businessConfigs, contentQueue } from "@/lib/db";
import { generateLocalContent, CONTENT_TYPES_BY_PLAN, type ContentType } from "./generate";
import { normalizePlanTierFromDb } from "@/lib/plans";
import { findCrossLinkPartner } from "./cross-link";

const QUEUE_THRESHOLD = 10;

function parseKeywords(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCities(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function cityFromAddress(address: string | null | undefined): string {
  if (!address) return "";
  const parts = address.split(",");
  if (parts.length >= 2) return parts[1].trim();
  return address.trim();
}

function stateFromAddress(address: string | null | undefined): string {
  if (!address) return "";
  // "123 Main St, Austin, TX 78701" — state is the first token of parts[2]
  const parts = address.split(",");
  if (parts.length >= 3) return parts[2].trim().split(/\s+/)[0] ?? "";
  return "";
}

function kindForType(type: ContentType): string {
  return type;
}

export async function queueContentForBusiness(
  businessId: string,
): Promise<{ queued: number; skipped: string }> {
  const db = getDb();
  if (!db) {
    return { queued: 0, skipped: "no_database" };
  }

  // Check pending queue depth — don't re-queue if already at threshold
  const [countRow] = await db
    .select({ count: count() })
    .from(contentQueue)
    .where(
      and(
        eq(contentQueue.businessId, businessId),
        eq(contentQueue.status, "queued"),
      ),
    );
  const pendingCount = countRow?.count ?? 0;
  if (pendingCount >= QUEUE_THRESHOLD) {
    return { queued: 0, skipped: "already_has_queued_content" };
  }

  // Fetch business details
  const [biz] = await db
    .select({
      name: businesses.name,
      address: businesses.address,
      primaryCategory: businesses.primaryCategory,
      vertical: businesses.vertical,
      planTier: businesses.planTier,
      focusArea: businesses.focusArea,
      targetScope: businesses.targetScope,
      website: businesses.website,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) {
    return { queued: 0, skipped: "business_not_found" };
  }

  // Fetch business config (may not exist yet)
  const [config] = await db
    .select()
    .from(businessConfigs)
    .where(eq(businessConfigs.businessId, businessId))
    .limit(1);

  const industry =
    config
      ? undefined
      : (biz.vertical ?? biz.primaryCategory ?? "local business");

  const addressCity = cityFromAddress(biz.address);
  const addressState = stateFromAddress(biz.address);

  const keywords = parseKeywords(config?.targetKeywords);
  const targetCities = parseCities(config?.targetCities);

  // Use the first target city if available, fall back to address city
  const city = (targetCities[0] ?? addressCity) || "your city";
  const state = addressState || "your state";

  const resolvedIndustry = industry ?? biz.vertical ?? biz.primaryCategory ?? "local business";
  const tier = normalizePlanTierFromDb(biz.planTier);

  // For growth+ plans, try to find a cross-link partner from the same city
  const crossLinkPartner = (tier === "growth" || tier === "pro" || tier === "agency")
    ? await findCrossLinkPartner(businessId, city, resolvedIndustry)
    : null;

  const focusArea = (biz.focusArea ?? "local") as "local" | "regional" | "national" | "online";
  const targetScope = biz.targetScope ?? config?.targetScope ?? undefined;

  // Online businesses default their keyword scope to their niche, not city
  const defaultKeyword = focusArea === "online" || focusArea === "national"
    ? resolvedIndustry
    : `${biz.vertical ?? "local business"} ${city}`;

  const params = {
    businessName: biz.name,
    industry: resolvedIndustry,
    city,
    state,
    keywords: keywords.length > 0 ? keywords : [defaultKeyword],
    tone: config?.tone ?? "professional",
    serviceDescription: config?.serviceDescription ?? `${biz.name} serves customers in ${targetScope ?? city}.`,
    focusArea,
    targetScope,
    ...(crossLinkPartner ? { crossLinkPartner } : {}),
  };
  const contentTypes = CONTENT_TYPES_BY_PLAN[tier] ?? CONTENT_TYPES_BY_PLAN.starter;

  let generated;
  try {
    generated = await generateLocalContent(params, contentTypes);
  } catch (error) {
    console.error("[content-gen] generateLocalContent threw", {
      businessId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { queued: 0, skipped: "generation_error" };
  }

  if (generated.length === 0) {
    return { queued: 0, skipped: "no_content_generated" };
  }

  const rows = generated.map((item) => ({
    businessId,
    kind: kindForType(item.type),
    title: item.title,
    outline: item.body,
    targetKeyword: item.targetKeyword,
    status: "queued" as const,
    variant: "default",
  }));

  await db.insert(contentQueue).values(rows);

  return { queued: rows.length, skipped: "" };
}

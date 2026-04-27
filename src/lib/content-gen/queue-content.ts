import { eq, and, count } from "drizzle-orm";
import { getDb, businesses, businessConfigs, contentQueue } from "@/lib/db";
import { generateLocalContent } from "./generate";

const QUEUE_THRESHOLD = 3;

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

// Map generated content type to the contentQueue.kind column values used by the rest of the system
function kindForType(type: "article" | "gbp_post" | "reddit_post"): string {
  if (type === "article") return "article";
  if (type === "gbp_post") return "gbp_post";
  return "reddit_post";
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

  const params = {
    businessName: biz.name,
    industry: industry ?? biz.vertical ?? biz.primaryCategory ?? "local business",
    city,
    state,
    keywords: keywords.length > 0 ? keywords : [`${biz.vertical ?? "local business"} ${city}`],
    tone: config?.tone ?? "professional",
    serviceDescription: config?.serviceDescription ?? `${biz.name} serves customers in ${city}.`,
  };

  let generated;
  try {
    generated = await generateLocalContent(params);
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

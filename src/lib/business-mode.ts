/**
 * Operating scope. A business is LOCAL (city-based), REGIONAL (a stated region),
 * NATIONAL (a country) or ONLINE (no geography). The growth engines adapt to the
 * mode instead of demanding a city: national/online businesses are worked by
 * category/topic, search-competitors and directory/resource opportunities.
 */

import { desc, eq, and } from "drizzle-orm";
import { businessConfigs, businesses, getDb, jobs } from "@/lib/db";
import { getBusinessTruth } from "@/lib/truth";
import { deriveCategory } from "@/lib/truth/category";
import { openRouterChat } from "@/lib/integrations/openrouter";
import { isSafePublicUrl, safeFetchText } from "@/lib/net/safe-fetch";

export type OperatingMode = "local" | "regional" | "national" | "online";

export type BusinessMode = {
  mode: OperatingMode;
  city: string | null;
  region: string | null;
  country: string | null;
  category: string | null;
  /** Human label for the place used in queries ("Chicago", "Illinois", "United States", null when online). */
  placeLabel: string | null;
};

const BAD = /^(other|unknown|)$/i;

export async function getOperatingMode(businessId: string): Promise<BusinessMode> {
  const db = getDb();
  const empty: BusinessMode = { mode: "online", city: null, region: null, country: null, category: null, placeLabel: null };
  if (!db) return empty;
  const [biz] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) return empty;
  const [cfg] = await db.select({ focusArea: businessConfigs.focusArea, targetScope: businessConfigs.targetScope, serviceCountry: businessConfigs.serviceCountry, serviceState: businessConfigs.serviceState }).from(businessConfigs).where(eq(businessConfigs.businessId, businessId)).limit(1);
  const truth = await getBusinessTruth(businessId);
  const focus = (cfg?.focusArea ?? biz.focusArea ?? "local").toLowerCase();
  const city = truth.verifiedCity;
  const structured = !BAD.test((biz.vertical ?? "").trim()) ? biz.vertical : !BAD.test((biz.primaryCategory ?? "").trim()) ? biz.primaryCategory : null;
  const category = structured ?? truth.services[0] ?? (await deriveCategory(businessId, truth));
  const scopeText = (cfg?.targetScope ?? biz.targetScope ?? "").trim();
  const country = cfg?.serviceCountry ?? "United States";

  let mode: OperatingMode;
  if (focus === "global" || focus === "online") mode = "online";
  else if (focus === "national") mode = "national";
  else if (focus === "regional") mode = "regional";
  else mode = city ? "local" : "national"; // "local" with no verifiable city cannot be worked locally
  if (mode === "regional" && !scopeText) mode = "national";

  return {
    mode,
    city: mode === "local" ? city : null,
    region: mode === "regional" ? scopeText || cfg?.serviceState || null : null,
    country: mode === "national" || mode === "online" ? country : null,
    category,
    placeLabel: mode === "local" ? city : mode === "regional" ? scopeText || null : mode === "national" ? country : null,
  };
}

export type WebCompetitor = { name: string; website: string };

/**
 * Search competitors for non-local businesses: ask a search-grounded model which sites
 * compete for this category, then keep only ones whose URL actually resolves. Existing
 * OpenRouter access; one small call per run.
 */
export async function findWebCompetitors(category: string, placeLabel: string | null, ownHost: string | null, max = 5): Promise<WebCompetitor[]> {
  const where = placeLabel ? ` in ${placeLabel}` : "";
  const out = await openRouterChat({
    model: "perplexity/sonar",
    maxTokens: 400,
    temperature: 0,
    messages: [{ role: "user", content: `List up to ${max + 3} well-known companies or websites that compete for customers searching for "${category}"${where}. Answer ONLY with a JSON array like [{"name":"...","website":"https://..."}]. Include only real companies with their own website.` }],
  });
  if (!out) return [];
  const json = out.match(/\[[\s\S]*\]/)?.[0];
  if (!json) return [];
  let list: { name?: string; website?: string }[] = [];
  try {
    list = JSON.parse(json);
  } catch {
    return [];
  }
  const res: WebCompetitor[] = [];
  const seen = new Set<string>();
  for (const c of list) {
    if (!c.name || !c.website) continue;
    const u = isSafePublicUrl(c.website);
    if (!u) continue;
    const host = u.hostname.replace(/^www\./, "");
    if (seen.has(host) || (ownHost && host === ownHost)) continue;
    const r = await safeFetchText(u.origin, { timeoutMs: 7000, maxBytes: 5000 });
    if (!r.ok || r.status >= 400) continue;
    seen.add(host);
    res.push({ name: c.name.slice(0, 80), website: u.origin });
    if (res.length >= max) break;
  }
  return res;
}

export async function lastCategory(businessId: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db.select({ payload: jobs.payload }).from(jobs).where(and(eq(jobs.businessId, businessId), eq(jobs.type, "category_derived"))).orderBy(desc(jobs.createdAt)).limit(1);
  return (row?.payload as { category?: string | null } | null)?.category ?? null;
}

/**
 * Category from the company's OWN description, when no structured category exists.
 * One cached model call (re-derived only if the description changes); the result is
 * accepted only if every word appears in the company's own text, so nothing is invented.
 */
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, jobs } from "@/lib/db";
import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";
import type { BusinessTruth } from "./index";

export async function deriveCategory(businessId: string, truth: BusinessTruth): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  // Everything the company itself says about what it is (owner text, site descriptions, service and page titles).
  const text = [...new Set([truth.description ?? "", ...truth.facts.filter((f) => f.key === "description").map((f) => f.value), ...truth.services, ...truth.facts.filter((f) => f.key === "page_topic").slice(0, 6).map((f) => f.value)])].filter(Boolean).join(". ");
  if (text.length < 40) return null;
  const basis = createHash("sha256").update(text).digest("hex").slice(0, 16);
  const [prior] = await db
    .select({ payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), eq(jobs.type, "category_derived")))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  const p = prior?.payload as { basis?: string; category?: string | null } | undefined;
  if (p?.basis === basis) return p.category ?? null;
  const out = await openRouterChat({
    model: MODELS.content,
    maxTokens: 20,
    temperature: 0,
    messages: [{ role: "user", content: `Text from a company's own website:\n"${text.slice(0, 900)}"\n\nName the ONE primary kind of business this describes as a 1-3 word search phrase (e.g. "boat rental"). Use only words that appear in the text. If unclear answer NONE. Output only the phrase.` }],
  });
  const cand = out?.trim().toLowerCase().replace(/[^a-z ]/g, "").trim() ?? "";
  const lower = text.toLowerCase();
  const stem = (w: string) => w.replace(/s$/, "");
  const ok = cand && cand !== "none" && cand.split(/\s+/).length <= 3 && cand.split(/\s+/).every((w) => lower.includes(stem(w)));
  const category = ok ? cand : null;
  await db.insert(jobs).values({ businessId, type: "category_derived", status: "completed", payload: { basis, category } });
  return category;
}

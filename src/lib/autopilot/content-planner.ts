/**
 * Plans new website content from VERIFIED first-party facts only (see
 * src/lib/truth). Topics come from services/pages the company itself lists —
 * never from templates that assume a city, an industry label, or a story.
 *
 * Content is only planned when both are true:
 *  1. the Business Truth layer has enough current first-party data, and
 *  2. the customer has connected an external publishing destination
 *     (WordPress / Webflow / Shopify — a one-time authorization).
 * Otherwise nothing is generated (no hollow drafts piling up, no
 * internal noindex pages) and the reason is recorded so the workspace can
 * show a single NEEDS YOU item instead of a recurring task queue.
 */

import { and, desc, eq, inArray, gte } from "drizzle-orm";
import { contentQueue, getDb, jobs, publishingTargets } from "@/lib/db";
import { ensureFreshTruth } from "@/lib/truth";
import { containsPlaceholderArtifact } from "@/lib/content-gen/quality-guard";

export const EXTERNAL_ADAPTERS = ["wordpress", "webflow", "shopify", "managed_feed"] as const;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type EngineState = "planned" | "insufficient_truth" | "awaiting_publishing_connection" | "nothing_new";

async function recordEngineState(businessId: string, state: EngineState, detail: Record<string, unknown>) {
  const db = getDb();
  if (!db) return;
  // One record per state per day is plenty of evidence — avoid log spam.
  const since = new Date(Date.now() - 20 * 3_600_000);
  const [recent] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), eq(jobs.type, `content_engine_${state}`), gte(jobs.createdAt, since)))
    .limit(1);
  if (recent) return;
  await db.insert(jobs).values({ businessId, type: `content_engine_${state}`, status: "completed", payload: detail });
}

export async function hasExternalPublishingTarget(businessId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const rows = await db
    .select({ adapter: publishingTargets.adapter, config: publishingTargets.config })
    .from(publishingTargets)
    .where(and(eq(publishingTargets.businessId, businessId), eq(publishingTargets.active, "true"), inArray(publishingTargets.adapter, [...EXTERNAL_ADAPTERS])));
  return rows.some((r) => r.config);
}

export async function planTruthGroundedContent(input: {
  businessId: string;
  maxItems: number;
  maxLocationPages: number;
}): Promise<{ state: EngineState; queued: number; titles: string[] }> {
  const db = getDb();
  if (!db) return { state: "nothing_new", queued: 0, titles: [] };
  const { businessId } = input;

  const truth = await ensureFreshTruth(businessId);
  if (!truth.sufficient) {
    await recordEngineState(businessId, "insufficient_truth", { reason: truth.insufficientReason });
    return { state: "insufficient_truth", queued: 0, titles: [] };
  }
  if (!(await hasExternalPublishingTarget(businessId))) {
    await recordEngineState(businessId, "awaiting_publishing_connection", { note: "Content is generated only once a website publishing destination is connected." });
    return { state: "awaiting_publishing_connection", queued: 0, titles: [] };
  }

  // Don't queue more while earlier items are still waiting to publish.
  const pending = await db
    .select({ id: contentQueue.id })
    .from(contentQueue)
    .where(and(eq(contentQueue.businessId, businessId), inArray(contentQueue.status, ["queued", "ready"])))
    .limit(5);
  if (pending.length >= 3) return { state: "nothing_new", queued: 0, titles: [] };

  const existing = await db
    .select({ title: contentQueue.title })
    .from(contentQueue)
    .where(eq(contentQueue.businessId, businessId))
    .orderBy(desc(contentQueue.createdAt))
    .limit(300);
  const used = new Set(existing.map((e) => norm(e.title)));

  const name = truth.businessName;
  const city = truth.verifiedCity;
  const candidates: { kind: "article" | "location_page"; title: string; outline: string; keyword: string }[] = [];

  for (const s of truth.services) {
    candidates.push({
      kind: "article",
      title: `What to know about ${s} — ${name}`,
      outline: `Explain "${s}" for someone considering it, using only what ${name}'s own website says about it in the verified facts. Answer the common questions a customer has; do not add details that are not in the facts.`,
      keyword: city ? `${s} ${city}` : s,
    });
    if (city) {
      candidates.push({
        kind: "location_page",
        title: `${s} in ${city} — ${name}`,
        outline: `A location page for ${name}'s "${s}" in ${city}. Only state services, hours, contact details and service areas that appear in the verified facts.`,
        keyword: `${s} in ${city}`,
      });
    }
  }
  if (candidates.length === 0 && truth.description) {
    candidates.push({
      kind: "article",
      title: `About ${name}: what we do`,
      outline: `Summarize what ${name} does, using only the company's own description and the verified facts.`,
      keyword: name,
    });
  }
  const topics = truth.facts.filter((f) => f.key === "page_topic").map((f) => f.value);
  for (const t of topics.slice(0, 3)) {
    if (candidates.length >= 8) break;
    candidates.push({
      kind: "article",
      title: `${t} — ${name}`,
      outline: `Expand on the topic "${t}", which appears on ${name}'s own website, using only verified facts.`,
      keyword: t,
    });
  }

  const chosen: typeof candidates = [];
  let locationCount = 0;
  for (const c of candidates) {
    if (chosen.length >= input.maxItems) break;
    if (used.has(norm(c.title)) || containsPlaceholderArtifact(c.title)) continue;
    if (c.kind === "location_page") {
      if (locationCount >= input.maxLocationPages) continue;
      locationCount++;
    }
    chosen.push(c);
    used.add(norm(c.title));
  }

  if (chosen.length === 0) {
    await recordEngineState(businessId, "nothing_new", { services: truth.services.length });
    return { state: "nothing_new", queued: 0, titles: [] };
  }

  await db.insert(contentQueue).values(
    chosen.map((c) => ({
      businessId,
      kind: c.kind,
      title: c.title,
      outline: c.outline,
      targetKeyword: c.keyword,
      status: "queued",
      variant: c.kind === "location_page" ? "geo_variant" : "primary_market",
    })),
  );
  await recordEngineState(businessId, "planned", { queued: chosen.length, titles: chosen.map((c) => c.title) });
  return { state: "planned", queued: chosen.length, titles: chosen.map((c) => c.title) };
}

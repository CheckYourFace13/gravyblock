/**
 * Backlink prospect finder — identifies link-building opportunities for local businesses.
 *
 * Approach (no SERP API required):
 *  1. Uses Google Places text search to find local authority sites: chambers of commerce,
 *     business associations, local news outlets, niche blogs in the business's city/category.
 *  2. Uses OpenRouter to generate a personalized outreach email for each opportunity.
 *  3. Stores results in backlinkOpportunities table for operator review.
 *
 * Run monthly per paid business. Tracked via jobs table.
 */

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, businesses, backlinkOpportunities, jobs, operatorTasks } from "@/lib/db";

const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];

type ProspectSource = {
  sourceName: string;
  sourceType: string;
  relevanceNote: string;
  qualityScore: number;
  targetUrl: string | null;
};

function buildProspectQueries(biz: {
  name: string;
  primaryCategory: string | null;
  vertical: string | null;
  address: string | null;
}): string[] {
  const city = extractCity(biz.address) ?? "local area";
  const category = biz.vertical ?? biz.primaryCategory ?? "local business";

  return [
    `chamber of commerce ${city}`,
    `${category} association ${city}`,
    `local business directory ${city}`,
    `${city} news blog`,
    `${category} blog ${city}`,
  ];
}

function extractCity(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim());
  if (parts.length >= 2) return parts[parts.length - 2].replace(/^\d+\s+/, "").trim() || null;
  return null;
}

type PlacesResult = {
  name: string;
  formatted_address?: string;
  website?: string;
  types?: string[];
};

async function searchPlaces(query: string): Promise<PlacesResult[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return [];

  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", key);

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: PlacesResult[] };
    return json.results?.slice(0, 3) ?? [];
  } catch {
    return [];
  }
}

async function generateOutreachEmail(params: {
  businessName: string;
  businessCategory: string;
  city: string;
  prospectName: string;
  prospectType: string;
}): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const prompt = `Write a short, professional cold outreach email from ${params.businessName} (a ${params.businessCategory} in ${params.city}) to ${params.prospectName} (a ${params.prospectType}).

The goal: request a backlink mention, guest post opportunity, or local business directory listing.

Requirements:
- 3-5 sentences max
- Personalized to the recipient type
- Specific value proposition (local business, serves the community, etc.)
- Clear ask: link mention, "add us to your directory", or guest post offer
- Professional but not stiff
- No placeholders like [Name] — write it ready to send
- Sign as "${params.businessName} team"

Return only the email body, no subject line.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "http-referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com",
      },
      body: JSON.stringify({
        model: "google/gemini-flash-1.5",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 250,
        temperature: 0.7,
      }),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

function classifySourceType(types: string[] | undefined, name: string): { sourceType: string; qualityScore: number } {
  const nameLower = name.toLowerCase();
  const typeSet = new Set(types ?? []);

  if (nameLower.includes("chamber") || nameLower.includes("commerce")) return { sourceType: "chamber", qualityScore: 85 };
  if (nameLower.includes("association") || nameLower.includes("network")) return { sourceType: "association", qualityScore: 80 };
  if (nameLower.includes("news") || nameLower.includes("times") || nameLower.includes("gazette")) return { sourceType: "local_news", qualityScore: 78 };
  if (nameLower.includes("blog") || nameLower.includes("guide")) return { sourceType: "blog", qualityScore: 65 };
  if (typeSet.has("local_government_office")) return { sourceType: "government", qualityScore: 88 };
  if (typeSet.has("library") || typeSet.has("city_hall")) return { sourceType: "government", qualityScore: 88 };
  return { sourceType: "directory", qualityScore: 60 };
}

export async function findBacklinkProspectsForBusiness(businessId: string): Promise<{ found: number }> {
  const db = getDb();
  if (!db) return { found: 0 };

  const [biz] = await db
    .select({
      name: businesses.name,
      primaryCategory: businesses.primaryCategory,
      vertical: businesses.vertical,
      address: businesses.address,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) return { found: 0 };

  const queries = buildProspectQueries(biz);
  const city = extractCity(biz.address) ?? "local area";
  const category = biz.vertical ?? biz.primaryCategory ?? "local business";

  const seen = new Set<string>();
  let found = 0;

  for (const query of queries) {
    const results = await searchPlaces(query);

    for (const place of results) {
      const key = place.name.toLowerCase().replace(/\s+/g, "");
      if (seen.has(key)) continue;
      seen.add(key);

      const { sourceType, qualityScore } = classifySourceType(place.types, place.name);

      const outreachEmail = await generateOutreachEmail({
        businessName: biz.name,
        businessCategory: category,
        city,
        prospectName: place.name,
        prospectType: sourceType.replace("_", " "),
      });

      const opportunityId = randomUUID();
      await db.insert(backlinkOpportunities).values({
        id: opportunityId,
        businessId,
        sourceName: place.name,
        sourceType,
        targetUrl: place.website ?? null,
        relevanceNote: outreachEmail ?? `Potential ${sourceType} link from ${place.name} in ${city}`,
        qualityScore,
        status: "prospecting",
      });

      // Create an actionable operator task so the owner sees this in their workspace
      if (outreachEmail) {
        const contactEmail = place.website
          ? `info@${new URL(place.website.startsWith("http") ? place.website : `https://${place.website}`).hostname.replace(/^www\./, "")}`
          : null;

        await db.insert(operatorTasks).values({
          id: randomUUID(),
          businessId,
          title: `Send backlink outreach to ${place.name}`,
          detail: [
            contactEmail ? `Send to: ${contactEmail}` : `Find contact info at: ${place.website ?? place.name}`,
            `Subject: Local business collaboration — ${biz.name}`,
            "",
            outreachEmail,
            "",
            `Why this matters: ${place.name} is a local ${sourceType.replace("_", " ")} with strong community authority. A mention or listing here builds local SEO trust signals.`,
          ].join("\n"),
          queue: "outreach_ops",
          status: "queued",
        });
      }

      found++;
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return { found };
}

export async function runBacklinkProspectBatch(batchSize = 3): Promise<{ ran: number; totalFound: number }> {
  const db = getDb();
  if (!db) return { ran: 0, totalFound: 0 };

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const paid = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(inArray(businesses.planTier, PAID_TIERS))
    .limit(50);

  let ran = 0;
  let totalFound = 0;

  for (const biz of paid.slice(0, batchSize)) {
    const [recent] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.type, "backlink_prospect_run"),
          gte(jobs.createdAt, monthAgo),
          sql`${jobs.payload}->>'businessId' = ${biz.id}`,
        ),
      )
      .limit(1);

    if (recent) continue;

    try {
      const result = await findBacklinkProspectsForBusiness(biz.id);
      await db.insert(jobs).values({
        type: "backlink_prospect_run",
        status: "completed",
        payload: { businessId: biz.id, found: result.found },
      });
      totalFound += result.found;
      ran++;
    } catch (err) {
      console.error("[backlink-prospect] failed", {
        businessId: biz.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ran, totalFound };
}

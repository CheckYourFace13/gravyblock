/**
 * POST /api/admin/seed-self
 * Registers GravyBlock as its own Agency-tier customer in the database.
 * Run once after deploy. Protected by AUTOPILOT_OPERATOR_SECRET.
 *
 * The business ID is saved in GRAVYBLOCK_SELF_BUSINESS_ID env var — add it
 * to .env after running this endpoint for the first time.
 *
 * Once seeded, the worker treats GravyBlock like any other Agency business:
 * - Generates and publishes local SEO content about its own industry
 * - Posts to Reddit from the GravyBlock account
 * - Sends backlink outreach on its own behalf
 * - Tracks its own GSC keyword rankings
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, businesses, businessConfigs, publishingTargets } from "@/lib/db";
import { verifyAutopilotOperatorRequest } from "@/lib/autopilot/operator-auth";

export async function POST(req: Request) {
  const denied = verifyAutopilotOperatorRequest(req);
  if (denied) return denied;

  const db = getDb();
  if (!db) return Response.json({ error: "No database" }, { status: 503 });

  // Check if already seeded
  const existingId = process.env.GRAVYBLOCK_SELF_BUSINESS_ID;
  if (existingId) {
    const [existing] = await db
      .select({ id: businesses.id, name: businesses.name })
      .from(businesses)
      .where(eq(businesses.id, existingId))
      .limit(1);
    if (existing) {
      return Response.json({ ok: true, alreadySeeded: true, businessId: existing.id, message: "GravyBlock business already registered." });
    }
  }

  // Check by name in case env var wasn't set
  const [byName] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(eq(businesses.name, "GravyBlock"))
    .limit(1);
  if (byName) {
    return Response.json({ ok: true, alreadySeeded: true, businessId: byName.id, message: `Already exists. Add GRAVYBLOCK_SELF_BUSINESS_ID=${byName.id} to .env` });
  }

  const businessId = randomUUID();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";

  // Create the business record
  await db.insert(businesses).values({
    id: businessId,
    name: "GravyBlock",
    website: siteUrl,
    websiteNormalized: "gravyblock.com",
    vertical: "SaaS / Local SEO",
    businessModel: "online",
    ownershipModel: "independent",
    primaryCategory: "Software Company",
    address: "Austin, TX",
    planTier: "agency",
    subscriptionStatus: "active",
  });

  // Create a detailed business config so the content generator knows exactly what to write
  await db.insert(businessConfigs).values({
    businessId,
    source: "owner_form",
    serviceDescription: "GravyBlock is an automated local SEO platform for small businesses. We write and publish AI content, track keyword rankings, manage reviews, run Reddit outreach, build backlinks, and monitor AI search visibility — all on autopilot. Plans start free.",
    uniqueSellingPoints: "Fully automated — no manual work required after setup. Combines content publishing, Reddit posting, backlink outreach, review management, and AI visibility tracking in one platform. Fraction of the cost of a marketing agency.",
    tone: "friendly",
    brandVoice: "Direct and confident, like a knowledgeable friend who actually works in local SEO. No corporate speak. Uses plain English, specific examples, and always ties advice back to something actionable for a local business owner.",
    targetKeywords: "local SEO autopilot, local SEO tool for small business, automated local SEO, google business profile automation, local SEO software, BrightLocal alternative, Yext alternative",
    targetCities: "Austin, Houston, Dallas, Denver, Chicago, Atlanta, Phoenix, Los Angeles, New York, Miami",
    competitorNames: "BrightLocal, Yext, Semrush Local, Moz Local, Whitespark",
    additionalContext: "Target audience is small business owners (plumbers, restaurants, lawyers, contractors, dentists, salons) and marketing agencies managing local business clients. Pain point: they know they need SEO but have no time or budget for an agency.",
    focusArea: "national",
    targetScope: "United States",
    instagramHandle: "@gravyblock",
    facebookUrl: "https://facebook.com/gravyblock",
  });

  // Publishing target: internal_site (blog at /published/[id])
  await db.insert(publishingTargets).values({
    id: randomUUID(),
    businessId,
    label: "GravyBlock Blog",
    adapter: "internal",
    active: "true",
    config: { type: "internal_site" },
  });

  return Response.json({
    ok: true,
    businessId,
    message: `GravyBlock seeded as Agency customer. Add this to your .env:\nGRAVYBLOCK_SELF_BUSINESS_ID=${businessId}`,
  });
}

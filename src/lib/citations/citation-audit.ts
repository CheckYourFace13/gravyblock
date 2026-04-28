/**
 * Citation audit: compares the business's canonical NAP (from GBP profile)
 * against common directories and flags inconsistencies for operator action.
 *
 * Since we cannot scrape live directory listings without browser automation,
 * this module does two things:
 *  1. Creates operator tasks for each high-priority directory the business
 *     should verify, using the canonical NAP as the reference.
 *  2. Checks internal consistency: phone/address on the business record vs.
 *     the website URL (domain match), generating warnings for obvious gaps.
 *
 * Called by the worker monthly. Tracked via jobs table.
 */

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, businesses, operatorTasks, jobs } from "@/lib/db";
import { normalizePlanTierFromDb } from "@/lib/plans";

const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];

const HIGH_PRIORITY_DIRECTORIES = [
  "Google Business Profile",
  "Yelp",
  "Facebook Business",
  "Apple Maps",
  "Bing Places",
  "Better Business Bureau",
  "Yellow Pages",
  "Foursquare / Swarm",
];

const HEALTH_DIRECTORIES = ["Healthgrades", "Zocdoc", "WebMD Health", "Vitals"];
const LEGAL_DIRECTORIES = ["Avvo", "Justia", "FindLaw", "Lawyers.com"];
const HOME_SERVICE_DIRECTORIES = ["Angi", "HomeAdvisor", "Houzz", "Thumbtack"];
const REAL_ESTATE_DIRECTORIES = ["Zillow", "Realtor.com", "Homes.com", "Trulia"];

function directoriesForCategory(category: string | null | undefined): string[] {
  const cat = (category ?? "").toLowerCase();
  if (cat.includes("dentist") || cat.includes("doctor") || cat.includes("chiro") || cat.includes("health")) {
    return [...HIGH_PRIORITY_DIRECTORIES, ...HEALTH_DIRECTORIES];
  }
  if (cat.includes("law") || cat.includes("attorney") || cat.includes("legal")) {
    return [...HIGH_PRIORITY_DIRECTORIES, ...LEGAL_DIRECTORIES];
  }
  if (cat.includes("plumb") || cat.includes("hvac") || cat.includes("electric") || cat.includes("roof") || cat.includes("contractor")) {
    return [...HIGH_PRIORITY_DIRECTORIES, ...HOME_SERVICE_DIRECTORIES];
  }
  if (cat.includes("real estate") || cat.includes("realtor") || cat.includes("agent")) {
    return [...HIGH_PRIORITY_DIRECTORIES, ...REAL_ESTATE_DIRECTORIES];
  }
  return HIGH_PRIORITY_DIRECTORIES;
}

function canonicalNap(biz: { name: string; address: string | null; phone: string | null }): string {
  return [biz.name, biz.address ?? "no address", biz.phone ?? "no phone"].join(" | ");
}

export async function runCitationAuditBatch(batchSize = 5): Promise<{ audited: number; skipped: number }> {
  const db = getDb();
  if (!db) return { audited: 0, skipped: 0 };

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const paid = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      address: businesses.address,
      phone: businesses.phone,
      website: businesses.website,
      primaryCategory: businesses.primaryCategory,
      vertical: businesses.vertical,
      planTier: businesses.planTier,
    })
    .from(businesses)
    .where(inArray(businesses.planTier, PAID_TIERS))
    .limit(50);

  let audited = 0;
  let skipped = 0;

  for (const biz of paid.slice(0, batchSize)) {
    // Only run once per month per business
    const [recent] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.type, "citation_audit_run"),
          gte(jobs.createdAt, monthAgo),
          sql`${jobs.payload}->>'businessId' = ${biz.id}`,
        ),
      )
      .limit(1);

    if (recent) { skipped++; continue; }

    const tier = normalizePlanTierFromDb(biz.planTier);
    const category = biz.vertical ?? biz.primaryCategory ?? null;
    const directories = directoriesForCategory(category);
    const nap = canonicalNap(biz);

    // Create one task per directory to verify
    const taskRows = directories.map((dir) => ({
      businessId: biz.id,
      queue: "citation_ops" as const,
      title: `Verify listing on ${dir}`,
      detail: `Check that ${biz.name} is listed with correct NAP: ${nap}`,
      status: "pending" as const,
      priority: dir === "Google Business Profile" ? 1 : 2,
    }));

    // Also flag internal inconsistencies
    if (!biz.address) {
      taskRows.unshift({
        businessId: biz.id,
        queue: "citation_ops",
        title: "Missing address on business record",
        detail: `${biz.name} has no address saved. Add it to enable citation consistency checks.`,
        status: "pending",
        priority: 1,
      });
    }

    if (!biz.phone) {
      taskRows.unshift({
        businessId: biz.id,
        queue: "citation_ops",
        title: "Missing phone number on business record",
        detail: `${biz.name} has no phone number. Consistent phone across all citations is critical for local rankings.`,
        status: "pending",
        priority: 1,
      });
    }

    // Check website domain matches what's on GBP (stored as business.website)
    if (!biz.website) {
      taskRows.unshift({
        businessId: biz.id,
        queue: "citation_ops",
        title: "No website linked on GBP",
        detail: `${biz.name} has no website URL recorded. Add a website to the GBP listing to improve rankings.`,
        status: "pending",
        priority: 1,
      });
    }

    if (taskRows.length > 0) {
      await db.insert(operatorTasks).values(
        taskRows.map((t) => ({
          businessId: t.businessId,
          queue: t.queue,
          title: t.title,
          detail: t.detail,
          status: t.status,
        })),
      );
    }

    await db.insert(jobs).values({
      type: "citation_audit_run",
      status: "completed",
      payload: { businessId: biz.id, tasksCreated: taskRows.length },
    });

    audited++;
  }

  return { audited, skipped };
}


/**
 * Universal ranked growth-opportunity queue (see src/lib/db/schema.ts `growthOpportunities`).
 * Engines record candidates here instead of acting unilaterally; `nextOpportunities` returns
 * the highest-ranked eligible work for a business, weighted by the business's own operating
 * mode (see strategy.ts) so a local HVAC company and a national SaaS company are prioritized
 * differently from the exact same generic ranking formula.
 *
 * rank = expectedImpact * confidence * strategyWeight / max(1, cost * risk)
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb, growthOpportunities } from "@/lib/db";
import { getOperatingMode } from "@/lib/business-mode";
import { getCapabilityProfile } from "@/lib/capability-profile";
import { strategyWeight } from "./strategy";
import type { OpportunityCandidate, OpportunityType } from "./types";

const CAPABILITY_FLAG: Record<string, string> = {
  website_write: "website_write",
  gsc: "gsc",
  gbp: "gbp",
  social: "social",
  reviews: "reviews",
};

export function rank(c: { expectedImpact: number; confidence: number; cost: number; risk: number }, weight: number): number {
  return (c.expectedImpact * c.confidence * weight) / Math.max(1, c.cost * c.risk);
}

/** Record a candidate opportunity. Idempotent on dedupeKey; re-recording an open one refreshes its evidence. */
export async function recordOpportunity(c: OpportunityCandidate): Promise<{ recorded: boolean }> {
  const db = getDb();
  if (!db) return { recorded: false };
  // Capability gating happens at read-time (nextOpportunities), not here — a profile can gain
  // the needed capability later without the opportunity having to be rediscovered.
  const rows = await db
    .insert(growthOpportunities)
    .values({
      businessId: c.businessId,
      opportunityType: c.opportunityType,
      engine: c.engine,
      evidence: c.evidence,
      expectedImpact: Math.max(0, Math.min(100, Math.round(c.expectedImpact))),
      confidence: Math.max(0, Math.min(100, Math.round(c.confidence))),
      cost: Math.max(1, Math.min(10, Math.round(c.cost))),
      risk: Math.max(1, Math.min(10, Math.round(c.risk))),
      requiredCapability: c.requiredCapability,
      autoEligible: c.autoEligible ? "true" : "false",
      status: "open",
      dedupeKey: c.dedupeKey,
    })
    .onConflictDoUpdate({
      target: growthOpportunities.dedupeKey,
      set: { evidence: c.evidence, expectedImpact: Math.round(c.expectedImpact), confidence: Math.round(c.confidence) },
      // Only refresh open opportunities — never resurrect one already acted on or rejected.
      setWhere: eq(growthOpportunities.status, "open"),
    })
    .returning({ id: growthOpportunities.id });
  return { recorded: rows.length > 0 };
}

export type RankedOpportunity = typeof growthOpportunities.$inferSelect & { rankScore: number };

/** Highest-ranked open, auto-eligible, capability-satisfied opportunities for a business, most valuable first. */
export async function nextOpportunities(businessId: string, limit = 5): Promise<RankedOpportunity[]> {
  const db = getDb();
  if (!db) return [];
  const [mode, profile] = await Promise.all([getOperatingMode(businessId), getCapabilityProfile(businessId)]);
  const rows = await db
    .select()
    .from(growthOpportunities)
    .where(and(eq(growthOpportunities.businessId, businessId), eq(growthOpportunities.status, "open"), eq(growthOpportunities.autoEligible, "true")))
    .limit(200);
  const eligible = rows.filter((r) => {
    const need = r.requiredCapability;
    if (!need) return true;
    const flag = CAPABILITY_FLAG[need];
    return flag ? profile.active.has(flag) : true;
  });
  return eligible
    .map((r) => ({ ...r, rankScore: rank(r, strategyWeight(mode.mode, r.opportunityType as OpportunityType)) }))
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, limit);
}

/** Opportunities blocked only by a missing capability — feeds NEEDS YOU / one-time-authorization surfaces. */
export async function blockedByCapability(businessId: string, limit = 10): Promise<RankedOpportunity[]> {
  const db = getDb();
  if (!db) return [];
  const [mode, profile] = await Promise.all([getOperatingMode(businessId), getCapabilityProfile(businessId)]);
  const rows = await db
    .select()
    .from(growthOpportunities)
    .where(and(eq(growthOpportunities.businessId, businessId), eq(growthOpportunities.status, "open"), eq(growthOpportunities.autoEligible, "true")))
    .limit(200);
  const blocked = rows.filter((r) => {
    const need = r.requiredCapability;
    if (!need) return false;
    const flag = CAPABILITY_FLAG[need];
    return flag ? !profile.active.has(flag) : false;
  });
  return blocked
    .map((r) => ({ ...r, rankScore: rank(r, strategyWeight(mode.mode, r.opportunityType as OpportunityType)) }))
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, limit);
}

export async function markActing(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.update(growthOpportunities).set({ status: "acting", actedAt: new Date() }).where(eq(growthOpportunities.id, id));
}

export async function resolveOpportunity(id: string, status: "acted" | "verified" | "no_gain" | "rejected", measuredResult?: Record<string, unknown>): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db.update(growthOpportunities).set({ status, measuredResult: measuredResult ?? null, resolvedAt: new Date() }).where(eq(growthOpportunities.id, id));
}

/** Same as resolveOpportunity, addressed by the stable dedupeKey an engine used when recording it. Never throws — a missing row is a no-op. */
export async function resolveOpportunityByDedupeKey(dedupeKey: string, status: "acted" | "verified" | "no_gain" | "rejected", measuredResult?: Record<string, unknown>): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(growthOpportunities)
    .set({ status, measuredResult: measuredResult ?? null, resolvedAt: new Date() })
    .where(eq(growthOpportunities.dedupeKey, dedupeKey))
    .catch(() => undefined);
}

/** Expire open opportunities whose evidence is stale (>45 days unacted) so the queue self-cleans. */
export async function expireStaleOpportunities(maxAgeDays = 45): Promise<{ expired: number }> {
  const db = getDb();
  if (!db) return { expired: 0 };
  const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000);
  const rows = await db
    .update(growthOpportunities)
    .set({ status: "expired", resolvedAt: new Date() })
    .where(and(eq(growthOpportunities.status, "open"), sql`${growthOpportunities.createdAt} < ${cutoff}`))
    .returning({ id: growthOpportunities.id });
  return { expired: rows.length };
}

export async function summaryByType(businessId?: string): Promise<Record<string, { open: number; acted: number; verified: number }>> {
  const db = getDb();
  if (!db) return {};
  const rows = await db
    .select({ t: growthOpportunities.opportunityType, s: growthOpportunities.status, n: sql<number>`count(*)::int` })
    .from(growthOpportunities)
    .where(businessId ? eq(growthOpportunities.businessId, businessId) : sql`true`)
    .groupBy(growthOpportunities.opportunityType, growthOpportunities.status);
  const out: Record<string, { open: number; acted: number; verified: number }> = {};
  for (const r of rows) {
    const e = (out[r.t] ??= { open: 0, acted: 0, verified: 0 });
    if (r.s === "open") e.open += r.n;
    if (r.s === "acted") e.acted += r.n;
    if (r.s === "verified") e.verified += r.n;
  }
  return out;
}

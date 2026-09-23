/**
 * Universal ranked growth-opportunity queue (see src/lib/db/schema.ts `growthOpportunities`).
 * Engines record candidates here instead of acting unilaterally; `nextOpportunities` returns
 * the highest-ranked eligible work for a business, weighted by the business's own operating
 * mode (see strategy.ts) and by whether the opportunity is backed by real evidence of impact
 * (growth) or is mechanical checklist noise (hygiene) — see classify.ts.
 *
 * rank = expectedImpact * confidence * strategyWeight * valueClassWeight / max(1, cost * risk)
 *
 * This module answers "what is the best useful marketing action GravyBlock can take for this
 * business right now?" — it is the source of record, not a reporting table: every engine wired
 * to it defers its own "which one do I act on" decision to `nextOpportunities`.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb, growthOpportunities } from "@/lib/db";
import { getOperatingMode } from "@/lib/business-mode";
import { getCapabilityProfile } from "@/lib/capability-profile";
import { strategyWeight } from "./strategy";
import { getMaturitySignals, maturityMultiplier } from "./maturity";
import { getLearnedWeights, learnedMultiplier } from "./learning";
import type { EligibilityLabel, MeasurementPlan, MeasuredResultStatus, OpportunityCandidate, OpportunityType, ValueClass } from "./types";

const CAPABILITY_FLAG: Record<string, string> = {
  website_write: "website_write",
  gsc: "gsc",
  gbp: "gbp",
  social: "social",
  reviews: "reviews",
};

const VALUE_CLASS_WEIGHT: Record<ValueClass, number> = { hygiene: 0.4, growth: 1.3 };

export function rank(c: { expectedImpact: number; confidence: number; cost: number; risk: number; valueClass?: string }, weight: number): number {
  const vcw = VALUE_CLASS_WEIGHT[(c.valueClass as ValueClass) ?? "hygiene"] ?? 1;
  return (c.expectedImpact * c.confidence * weight * vcw) / Math.max(1, c.cost * c.risk);
}

/** Record a candidate opportunity. Idempotent on dedupeKey; re-recording an open one refreshes its evidence. */
export async function recordOpportunity(c: OpportunityCandidate): Promise<{ recorded: boolean }> {
  const db = getDb();
  if (!db) return { recorded: false };
  const mode = await getOperatingMode(c.businessId).catch(() => null);
  // Capability gating happens at read-time (nextOpportunities), not here — a profile can gain
  // the needed capability later without the opportunity having to be rediscovered.
  const rows = await db
    .insert(growthOpportunities)
    .values({
      businessId: c.businessId,
      opportunityType: c.opportunityType,
      subtype: c.subtype ?? null,
      engine: c.engine,
      businessMode: mode?.mode ?? null,
      valueClass: c.valueClass ?? "hygiene",
      evidence: c.evidence,
      expectedImpact: Math.max(0, Math.min(100, Math.round(c.expectedImpact))),
      confidence: Math.max(0, Math.min(100, Math.round(c.confidence))),
      cost: Math.max(1, Math.min(10, Math.round(c.cost))),
      risk: Math.max(1, Math.min(10, Math.round(c.risk))),
      requiredCapability: c.requiredCapability,
      autoEligible: c.autoEligible ? "true" : "false",
      ttlDays: c.ttlDays ?? 45,
      status: "open",
      dedupeKey: c.dedupeKey,
    })
    .onConflictDoUpdate({
      target: growthOpportunities.dedupeKey,
      set: { evidence: c.evidence, expectedImpact: Math.round(c.expectedImpact), confidence: Math.round(c.confidence), valueClass: c.valueClass ?? "hygiene", businessMode: mode?.mode ?? null },
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
  const [mode, profile, maturity, learned] = await Promise.all([getOperatingMode(businessId), getCapabilityProfile(businessId), getMaturitySignals(businessId), getLearnedWeights()]);
  const rows = await db
    .select()
    .from(growthOpportunities)
    .where(and(eq(growthOpportunities.businessId, businessId), eq(growthOpportunities.status, "open"), eq(growthOpportunities.autoEligible, "true")))
    .limit(300);
  const eligible = rows.filter((r) => {
    const need = r.requiredCapability;
    if (!need) return true;
    const flag = CAPABILITY_FLAG[need];
    return flag ? profile.active.has(flag) : true;
  });
  return eligible
    .map((r) => ({ ...r, rankScore: rank(r, strategyWeight(mode.mode, r.opportunityType as OpportunityType) * maturityMultiplier(maturity, r.opportunityType as OpportunityType) * learnedMultiplier(learned, r.opportunityType as OpportunityType, r.businessMode)) }))
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, limit);
}

export function classifyEligibility(r: { status: string; autoEligible: string; requiredCapability: string | null; measurementPlan: unknown; valueClass: string; expectedImpact: number; confidence: number }, profileActive: Set<string>): EligibilityLabel {
  if (r.status === "acting") return "ACTING";
  if (r.status === "acted" && r.measurementPlan) return "MEASURING";
  if (r.autoEligible !== "true") return "NOT_WORTH_ACTING";
  const need = r.requiredCapability;
  if (need) {
    const flag = CAPABILITY_FLAG[need];
    if (flag && !profileActive.has(flag)) return "BLOCKED_ONE_TIME_CONNECTION";
  }
  if (r.expectedImpact * r.confidence < 400) return "NOT_WORTH_ACTING";
  return "AUTO_ELIGIBLE";
}

/** Every open opportunity for a business, ranked, with a human-readable eligibility label — this is what the orchestrator and any "top 5" report reads from. Cooldown-blocked rows won't appear here (the engine that owns the cooldown never records them as open in the first place, or records them not-auto-eligible) — see per-engine notes. */
export async function allOpenRanked(businessId: string, limit = 20): Promise<(RankedOpportunity & { eligibility: EligibilityLabel })[]> {
  const db = getDb();
  if (!db) return [];
  const [mode, profile, maturity, learned] = await Promise.all([getOperatingMode(businessId), getCapabilityProfile(businessId), getMaturitySignals(businessId), getLearnedWeights()]);
  const rows = await db.select().from(growthOpportunities).where(and(eq(growthOpportunities.businessId, businessId), sql`${growthOpportunities.status} in ('open','acting','acted')`)).limit(300);
  return rows
    .map((r) => ({ ...r, rankScore: rank(r, strategyWeight(mode.mode, r.opportunityType as OpportunityType) * maturityMultiplier(maturity, r.opportunityType as OpportunityType) * learnedMultiplier(learned, r.opportunityType as OpportunityType, r.businessMode)), eligibility: classifyEligibility(r, profile.active) }))
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
    .limit(300);
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

/**
 * An engine calls this the moment it actually executes an opportunity: records the actionId
 * that ties this queue row to the real action/job/proof-ledger row, whether it verified live,
 * and (when a causal metric is realistically measurable) the measurement plan the worker will
 * evaluate automatically later. Status moves to "acted"; a later evaluation moves it to
 * "verified" (or "no_gain") once the plan resolves.
 */
export async function markActed(dedupeKey: string, input: { actionId: string; verificationStatus: "unverified" | "verified_live" | "verification_failed"; measurementPlan?: MeasurementPlan | null }): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db
    .update(growthOpportunities)
    .set({ status: "acted", actedAt: new Date(), actionId: input.actionId, verificationStatus: input.verificationStatus, measurementPlan: input.measurementPlan ?? null })
    .where(eq(growthOpportunities.dedupeKey, dedupeKey))
    .catch(() => undefined);
}

/** Opportunities whose measurement plan's evaluation window has arrived and hasn't been evaluated yet. */
export async function dueForMeasurementEvaluation(limit = 20): Promise<(typeof growthOpportunities.$inferSelect)[]> {
  const db = getDb();
  if (!db) return [];
  const now = new Date().toISOString();
  return db
    .select()
    .from(growthOpportunities)
    .where(and(eq(growthOpportunities.status, "acted"), sql`${growthOpportunities.measurementPlan} is not null`, sql`${growthOpportunities.measurementPlan}->>'earliestEvaluationAt' <= ${now}`))
    .limit(limit);
}

/** Same as recordMeasuredResult, addressed by dedupeKey — used by engines (authority, AEO) whose own verify/recheck loop already has the real after-value in hand. */
export async function recordMeasuredResultByDedupeKey(dedupeKey: string, resultStatus: MeasuredResultStatus, detail: Record<string, unknown>): Promise<void> {
  const db = getDb();
  if (!db) return;
  const finalStatus = resultStatus === "positive" ? "verified" : resultStatus === "too_early" ? "acted" : "no_gain";
  await db
    .update(growthOpportunities)
    .set({ status: finalStatus, measuredResult: { status: resultStatus, evaluatedAt: new Date().toISOString(), ...detail }, resolvedAt: finalStatus === "acted" ? null : new Date() })
    .where(eq(growthOpportunities.dedupeKey, dedupeKey))
    .catch(() => undefined);
}

export async function recordMeasuredResult(id: string, resultStatus: MeasuredResultStatus, detail: Record<string, unknown>): Promise<void> {
  const db = getDb();
  if (!db) return;
  const finalStatus = resultStatus === "positive" ? "verified" : resultStatus === "too_early" ? "acted" : "no_gain";
  await db
    .update(growthOpportunities)
    .set({ status: finalStatus, measuredResult: { status: resultStatus, evaluatedAt: new Date().toISOString(), ...detail }, resolvedAt: finalStatus === "acted" ? null : new Date() })
    .where(eq(growthOpportunities.id, id));
}

/** Expire open opportunities past their own TTL so the queue self-cleans; each opportunity class sets its own TTL via ttlDays. */
export async function expireStaleOpportunities(): Promise<{ expired: number }> {
  const db = getDb();
  if (!db) return { expired: 0 };
  const rows = await db
    .update(growthOpportunities)
    .set({ status: "expired", resolvedAt: new Date() })
    .where(and(eq(growthOpportunities.status, "open"), sql`${growthOpportunities.createdAt} < now() - (${growthOpportunities.ttlDays} || ' days')::interval`))
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

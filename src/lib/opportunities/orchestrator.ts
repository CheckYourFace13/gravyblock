/**
 * Universal opportunity-queue orchestrator. This is what turns "GravyBlock knows what it
 * should do" into "GravyBlock does the highest-value marketing work available" — it reads the
 * ranked queue for a business, and for each of the top-ranked DISTINCT opportunity types (a
 * diversity cap, so one high-volume category like existing-page SEO can't monopolize a run),
 * dispatches to that type's real action function. Every dispatched function already knows how
 * to pick its own best specific instance (basic-autopilot re-ranks internally via
 * nextOpportunities, authority picks its best qualified prospect, etc.) — the orchestrator's
 * job is channel-level diversity and honest "why did/didn't this run" reporting.
 *
 * A missing capability blocks only the opportunity types that need it — the loop always moves
 * to the next eligible type, never stops "marketing" for the business as a whole.
 */
import { runBasicSeoForBusiness } from "@/lib/seo/basic-autopilot";
import { runAeoActionForBusiness } from "@/lib/ai-visibility/aeo-actions";
import { runCompetitorGapForBusiness } from "@/lib/competitors/gap-engine";
import { runCitationEngineForBusiness } from "@/lib/citations/engine";
import { actOnBestAuthorityOpportunity } from "@/lib/authority/engine";
import { postGbpForBusiness } from "@/lib/gbp/post-publisher";
import { planTruthGroundedSocial } from "@/lib/social/truth-social";
import { runReviewRequestSendBatch } from "@/lib/reviews/review-request-engine";
import { planTruthGroundedContent, hasExternalPublishingTarget } from "@/lib/autopilot/content-planner";
import { executeContentPublishPath } from "@/lib/autopilot/executor";
import { getDb, businesses } from "@/lib/db";
import { inArray } from "drizzle-orm";
import { allOpenRanked } from "./queue";
import type { OpportunityType } from "./types";

const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];

type ActionResult = { attempted: boolean; outcome: string; detail?: unknown };

/** Shared by existing_page_seo/ctr/schema/technical/conversion — basic-autopilot already re-ranks its own defect classes via the queue internally, so this just runs it once. */
async function seoHandler(businessId: string): Promise<ActionResult> {
  const r = await runBasicSeoForBusiness(businessId);
  return { attempted: true, outcome: r.state === "applied" ? "acted" : r.state.includes("connector") ? "blocked" : "not_worth_acting", detail: r };
}

const HANDLERS: Partial<Record<OpportunityType, (businessId: string) => Promise<ActionResult>>> = {
  existing_page_seo: seoHandler,
  ctr: seoHandler,
  schema: seoHandler,
  technical: seoHandler,
  conversion: seoHandler,
  backlink: async (businessId) => {
    const r = await actOnBestAuthorityOpportunity(businessId);
    return { attempted: true, outcome: r.sent > 0 || r.followUps > 0 ? "acted" : r.reason === "no_eligible_prospect" ? "not_worth_acting" : "blocked", detail: r };
  },
  aeo: async (businessId) => {
    const r = await runAeoActionForBusiness(businessId);
    return { attempted: true, outcome: r.queued > 0 ? "acted" : "not_worth_acting", detail: r };
  },
  competitor_gap: async (businessId) => {
    const r = await runCompetitorGapForBusiness(businessId);
    return { attempted: true, outcome: r.queued ? "acted" : r.status === "completed" ? "not_worth_acting" : "blocked", detail: r };
  },
  citation: async (businessId) => {
    const r = await runCitationEngineForBusiness(businessId);
    return { attempted: true, outcome: "checked", detail: r }; // class D verification is prepared, not auto-completed by design
  },
  gbp: async (businessId) => {
    const r = await postGbpForBusiness(businessId);
    return { attempted: true, outcome: r.posted ? "acted" : r.reason === "gbp_not_connected" ? "blocked" : "not_worth_acting", detail: r };
  },
  social: async (businessId) => {
    const r = await planTruthGroundedSocial(businessId);
    return { attempted: true, outcome: r.queued > 0 ? "acted" : r.reason === "social_not_connected" ? "blocked" : "not_worth_acting", detail: r };
  },
  review: async (businessId) => {
    const r = await runReviewRequestSendBatch(10, businessId);
    return { attempted: true, outcome: r.sent > 0 || r.followedUp > 0 ? "acted" : "not_worth_acting", detail: r };
  },
  content_gap: async (businessId) => {
    if (!(await hasExternalPublishingTarget(businessId))) return { attempted: true, outcome: "blocked", detail: { reason: "no_publishing_target" } };
    const plan = await planTruthGroundedContent({ businessId, maxItems: 1, maxLocationPages: 1 });
    if (plan.queued === 0) return { attempted: true, outcome: "not_worth_acting", detail: plan };
    const exec = await executeContentPublishPath(businessId);
    return { attempted: true, outcome: exec.ok ? "acted" : "blocked", detail: { plan, exec } };
  },
};

export type OrchestratorStep = {
  opportunityType: OpportunityType;
  opportunityId: string;
  rankScore: number;
  eligibility: string;
  selectedWhy: string;
  result: ActionResult | { attempted: false; outcome: "skipped"; reason: string };
};

/**
 * Runs the top-ranked DISTINCT opportunity types for a business, up to maxTypes — the
 * per-run channel-diversity cap. Returns one step per type considered, whether or not it
 * actually acted, so the caller can report "why this won" / "why this didn't run."
 */
export async function runOrchestratorBatch(limit = 10): Promise<{ businesses: number; acted: number; steps: number }> {
  const db = getDb();
  if (!db) return { businesses: 0, acted: 0, steps: 0 };
  const rows = await db.select({ id: businesses.id }).from(businesses).where(inArray(businesses.planTier, PAID_TIERS)).limit(limit);
  let acted = 0;
  let steps = 0;
  for (const b of rows) {
    try {
      const s = await runOrchestrator(b.id, 5);
      steps += s.length;
      acted += s.filter((x) => x.result.outcome === "acted").length;
    } catch (err) {
      console.error("[orchestrator] business run failed", { businessId: b.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { businesses: rows.length, acted, steps };
}

export async function runOrchestrator(businessId: string, maxTypes = 5): Promise<OrchestratorStep[]> {
  const ranked = await allOpenRanked(businessId, 50);
  const steps: OrchestratorStep[] = [];
  const seenTypes = new Set<OpportunityType>();
  for (const opp of ranked) {
    if (seenTypes.size >= maxTypes) break;
    const type = opp.opportunityType as OpportunityType;
    if (seenTypes.has(type)) continue; // one action per channel per run — diversity, not monopoly
    seenTypes.add(type);
    if (opp.eligibility !== "AUTO_ELIGIBLE") {
      steps.push({ opportunityType: type, opportunityId: opp.id, rankScore: opp.rankScore, eligibility: opp.eligibility, selectedWhy: `highest-ranked open ${type} opportunity, but ${opp.eligibility.toLowerCase()}`, result: { attempted: false, outcome: "skipped", reason: opp.eligibility } });
      continue;
    }
    const handler = HANDLERS[type];
    if (!handler) {
      steps.push({ opportunityType: type, opportunityId: opp.id, rankScore: opp.rankScore, eligibility: opp.eligibility, selectedWhy: `highest-ranked open ${type} opportunity`, result: { attempted: false, outcome: "skipped", reason: "no_orchestrated_handler_yet" } });
      continue;
    }
    let result: ActionResult;
    try {
      result = await handler(businessId);
    } catch (err) {
      result = { attempted: true, outcome: "error", detail: err instanceof Error ? err.message : String(err) };
    }
    steps.push({ opportunityType: type, opportunityId: opp.id, rankScore: opp.rankScore, eligibility: opp.eligibility, selectedWhy: `highest-ranked open, auto-eligible ${type} opportunity (rank ${Math.round(opp.rankScore)})`, result });
  }
  return steps;
}

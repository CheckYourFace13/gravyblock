/**
 * Prospect pre-scan — runs a REAL visibility report for a cold-outreach
 * prospect before we email them, so the email can say "you scored 54/100,
 * here's what's holding you back, full report here" instead of asking a
 * stranger to go run a scan themselves.
 *
 * Reuses the exact pipeline the public /scan flow uses
 * (generateReportFromPlace → recordScanRun), so the linked report page is
 * identical to a self-served one: score, verdict, and top findings visible
 * immediately; full detail unlocks with their email (that unlock is the lead
 * capture — we deliberately do NOT create a lead row at pre-scan time, so
 * nobody gets enrolled in the nurture drip before they've shown interest).
 *
 * Cost note: each pre-scan is a Places details call plus a site crawl and
 * local-rank estimate (a few Places nearby calls) — roughly $0.05-0.10 per
 * prospect, only spent on prospects that pass the already-contacted filter
 * and are about to receive an email anyway.
 */

import { createPublicId, generateReportFromPlace } from "@/lib/report/generator";
import { recordScanRun } from "@/lib/report/repository";
import type { Prospect } from "./prospect-finder";
import { classifyFindingStrength } from "./finding-quality";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";

export type ProspectPreScanFix = { id: string; title: string; detail: string };

export type ProspectPreScan = {
  publicId: string;
  reportUrl: string;
  score: number;
  /**
   * Report fixes re-ranked for OUTREACH hook quality, not the report's own
   * internal impact order. The report's #1 fix is almost always
   * "Estimated map & local-query visibility is soft" — a modeled estimate,
   * not a verified fact, and (confirmed via a 45-prospect audit) it was
   * literally every prospect's #1 finding regardless of what else was true
   * about the business. Re-ranking by strong > medium > weak (see
   * finding-quality.ts) surfaces a real, verified, specific finding at [0]
   * whenever one exists — e.g. a real "hours clarity is weak" crawl result —
   * instead of always leading with the generic modeled one.
   */
  topFixes: ProspectPreScanFix[];
};

const STRENGTH_RANK = { strong: 3, medium: 2, weak: 1 } as const;

export async function runProspectPreScan(prospect: Prospect): Promise<ProspectPreScan | null> {
  try {
    const generated = await generateReportFromPlace({
      placeId: prospect.placeId,
      vertical: "other",
      query: prospect.businessName,
      locationHint: prospect.city,
    });

    const publicId = createPublicId();
    await recordScanRun({
      publicId,
      query: prospect.businessName,
      locationHint: prospect.city,
      selectedPlaceId: prospect.placeId,
      candidateConfidence: undefined,
      profile: generated.profile,
      payload: generated.payload,
      rankingChecks: generated.rankings,
      auditFindings: generated.crawlFindings,
      competitorSnapshots: generated.competitorSnapshots,
      businessModel: "single_location",
      vertical: "other",
      focusArea: "local",
    });

    // Re-rank by outreach-hook strength first, report impact as a tiebreaker
    // within the same strength — see the topFixes doc comment above.
    const impactRank = { high: 0, medium: 1, low: 2 } as const;
    const topFixes = [...generated.payload.prioritizedFixes]
      .sort((a, b) => {
        const strengthDiff = STRENGTH_RANK[classifyFindingStrength(b.id)] - STRENGTH_RANK[classifyFindingStrength(a.id)];
        if (strengthDiff !== 0) return strengthDiff;
        return (impactRank[a.impact] ?? 3) - (impactRank[b.impact] ?? 3);
      })
      .slice(0, 3)
      .map((f) => ({ id: f.id, title: f.title, detail: f.detail }));

    return {
      publicId,
      reportUrl: `${SITE_URL}/report/${publicId}`,
      score: generated.payload.summary.score,
      topFixes,
    };
  } catch (err) {
    console.warn("[prospect-prescan] failed — falling back to invite-style email", {
      businessName: prospect.businessName,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Deterministic prospect-priority score, computed AFTER contact discovery
 * and the pre-scan (so it can use the real signals those produce — finding
 * strength, named vs generic contact) but BEFORE deciding send order for a
 * batch. Purely a re-ranking of an already-eligible pool — it never excludes
 * a prospect that passed the existing STRONG/MEDIUM finding gate; it only
 * decides who gets emailed first this batch. Anyone bumped to a later batch
 * stays in the pool (hasBeenContacted is only set on actual sends) and gets
 * picked up again once contact discovery/pre-scan run for them next time.
 *
 * Deliberately built only from signals the pipeline already computes —
 * no new scraping, no new API calls:
 *  - prospect.opportunityScore (review/rating sweet spot, from prospect-finder.ts)
 *  - the pre-scan's re-ranked topFixes (finding-quality.ts strength + whether
 *    it's one of the "commercially resonant" findings that earn a subject line)
 *  - contact.isNamed / contact.confidence (discover-contact-email.ts)
 *  - a same-batch duplicate-name check (cheap, catches chain-like near-dupes
 *    the name/domain blocklist in prospect-finder.ts didn't already catch)
 */

import type { Prospect } from "./prospect-finder";
import type { ProspectPreScan } from "./prospect-prescan";
import type { DiscoveredContact } from "./discover-contact-email";
import { classifyFindingStrength, findingSubjectPhrase } from "./finding-quality";

export type PriorityBand = "high" | "medium" | "low";

export type ProspectPriority = {
  score: number;
  band: PriorityBand;
  findingStrength: "strong" | "medium";
  topFindingId: string | null;
  isNamed: boolean;
};

function normalizeBusinessName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * `seenNames` is mutated — pass the same Set across a batch's candidate pool
 * so a second listing with the same normalized name (a near-duplicate/chain
 * pattern the earlier name/domain blocklist missed) gets penalized rather
 * than competing on equal footing with the first, real occurrence.
 */
export function computeProspectPriority(
  prospect: Prospect,
  preScan: ProspectPreScan,
  contact: DiscoveredContact,
  seenNames: Set<string>,
): ProspectPriority {
  const topFinding = preScan.topFixes[0];
  const findingStrength = classifyFindingStrength(topFinding?.id) === "strong" ? "strong" : "medium";

  let score = 0;

  // Established, active, room-to-grow business — already computed upstream.
  score += prospect.opportunityScore * 0.4;

  // Finding strength and commercial resonance.
  score += findingStrength === "strong" ? 30 : 15;
  if (findingSubjectPhrase(topFinding?.id)) score += 10; // one of the viscerally-obvious hooks (hours, click-to-call, rating, GSC rank)

  // Multiple independent real (strong/medium) findings, not just one.
  const realFindingCount = preScan.topFixes.filter((f) => classifyFindingStrength(f.id) !== "weak").length;
  score += Math.min(realFindingCount, 3) * 5;

  // Named, person-specific contact over a generic published inbox.
  if (contact.isNamed) score += 15;
  if (contact.confidence === "verified_published") score += 5;

  // Clear city identity (extractCity found something real, not just the search fallback).
  if (prospect.city && prospect.city.length > 1) score += 2;

  // Same-batch duplicate/chain-like situation — heavily deprioritize, don't exclude.
  const normalizedName = normalizeBusinessName(prospect.businessName);
  if (seenNames.has(normalizedName)) {
    score -= 50;
  } else {
    seenNames.add(normalizedName);
  }

  score = Math.round(score);
  const band: PriorityBand = score >= 60 ? "high" : score >= 35 ? "medium" : "low";

  return { score, band, findingStrength, topFindingId: topFinding?.id ?? null, isNamed: Boolean(contact.isNamed) };
}

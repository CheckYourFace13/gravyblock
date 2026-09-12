import { randomUUID } from "node:crypto";
import { findWeakBusinesses, type Prospect } from "./prospect-finder";
import { sendProspectEmail } from "./outreach-emailer";
import { hasBeenContacted, recordOutreachSent } from "./outreach-tracker";
import { runProspectPreScan, type ProspectPreScan } from "./prospect-prescan";
import { isOptedOut } from "@/lib/email/optout";
import { discoverContactEmail, type DiscoveredContact } from "./discover-contact-email";
import { recordOutreachSendRow } from "./outreach-sends";
import { recordOutreachSendFailure } from "./outreach-health";
import { isEligibleForOutreach } from "./finding-quality";
import { evaluateExperiment, pickVariant } from "./experiment";
import { computeProspectPriority, type ProspectPriority } from "./prospect-priority";

const DEFAULT_MAX_EMAILS = 25; // 25 per batch × 4 weekday windows = ~100/day
// How many eligible candidates to evaluate (contact discovery + pre-scan)
// before picking which `cap` of them actually get emailed. Bounded on
// purpose — this is a re-ranking of an already-eligible pool, not a reason
// to pre-scan the entire prospect list every batch.
const EVALUATION_MULTIPLIER = 2;

type EligibleCandidate = {
  prospect: Prospect;
  contact: DiscoveredContact & { email: string };
  preScan: ProspectPreScan;
  priority: ProspectPriority;
};

export async function runOutreachBatch(params: {
  city: string;
  state: string;
  industry: string;
  industryLabel?: string;
  agencyName?: string;
  maxEmails?: number;
}): Promise<{ sent: number; skipped: number; prospects: number }> {
  const { city, state, industry, industryLabel, agencyName, maxEmails = DEFAULT_MAX_EMAILS } = params;

  const cap = maxEmails; // no artificial ceiling — controlled via admin UI

  console.info("[outreach-batch] Starting", { city, state, industry, cap });

  const prospects = await findWeakBusinesses({ city, state, industry });
  console.info("[outreach-batch] Prospects found", { count: prospects.length });

  // Autonomous A/B allocation — checks whether the experiment should
  // auto-promote a winner or get classified as stalled before picking
  // variants for this batch. See experiment.ts for the decision rule.
  const experimentState = await evaluateExperiment();

  let skipped = 0;
  const evaluationLimit = Math.min(prospects.length, cap * EVALUATION_MULTIPLIER);
  const seenNames = new Set<string>();
  const eligible: EligibleCandidate[] = [];

  // Phase 1 — discover contact, pre-scan, and gate exactly as before. The
  // only change from before is that a candidate that passes every existing
  // check is COLLECTED instead of sent immediately, so it can be ranked
  // against the rest of this batch's pool before anyone gets emailed.
  for (const prospect of prospects.slice(0, evaluationLimit)) {
    const alreadyContacted = await hasBeenContacted(prospect.placeId);
    if (alreadyContacted) {
      skipped++;
      continue;
    }

    // Cheap disqualifiers first — don't pay for a pre-scan on a prospect the
    // emailer would skip anyway (no website, or opted out).
    if (!prospect.website) {
      skipped++;
      continue;
    }
    // Only email an address actually published on the prospect's own site —
    // never a blind info@{domain} guess. Guessed addresses have an unknown
    // (likely high) bounce rate and damage GravyBlock's own sending domain.
    const contact = await discoverContactEmail(prospect.website);
    if (!contact.email) {
      skipped++;
      continue;
    }
    const candidateEmail = contact.email;
    if (await isOptedOut(candidateEmail)) {
      skipped++;
      continue;
    }

    // Run their scan BEFORE emailing so the email leads with a real score,
    // their actual top fixes, and a link to their real report. A generic
    // "invite yourself to scan" email with no specifics converts worse and
    // reads as one more piece of spam — if the pre-scan fails, skip this
    // prospect entirely rather than send the un-personalized fallback.
    // (Places/site-crawl calls that back this rarely fail outright, so this
    // costs very few sends — see prospect-prescan.ts's cost note.)
    const preScan = await runProspectPreScan(prospect);
    if (!preScan) {
      console.info("[outreach-batch] Skipped — pre-scan failed, no generic fallback sent", { businessName: prospect.businessName });
      skipped++;
      continue;
    }

    // Quality gate: only send when the top finding is specific/verified enough
    // to make a real personalization hook (see finding-quality.ts). A weak,
    // generic top finding isn't enough justification for a cold email — send
    // fewer, better-targeted emails rather than more generic ones.
    if (!isEligibleForOutreach(preScan.topFixes[0]?.id)) {
      console.info("[outreach-batch] Skipped — top finding too weak/generic for outreach", {
        businessName: prospect.businessName,
        topFindingId: preScan.topFixes[0]?.id,
      });
      skipped++;
      continue;
    }

    const priority = computeProspectPriority(prospect, preScan, contact, seenNames);
    eligible.push({ prospect, contact: { ...contact, email: candidateEmail }, preScan, priority });
  }

  // Phase 2 — highest-probability prospects first. Applies identically to
  // whichever variant a given send ends up getting (pickVariant below is an
  // independent draw against the same allocation regardless of rank), so
  // ranking never biases the A/B comparison toward one variant getting
  // better prospects than the other.
  eligible.sort((a, b) => b.priority.score - a.priority.score);
  const toSend = eligible.slice(0, cap);
  // Anyone ranked below the cap this batch is simply not sent yet — they
  // were never marked contacted, so they're picked up again (freshly
  // re-evaluated) whenever this city/industry comes up in rotation next.

  let sent = 0;

  for (const { prospect, contact, preScan, priority } of toSend) {
    // Generated before the send so it can be embedded in the report link
    // itself — opaque, no PII, correlates this exact send back to campaign/
    // industry/city/contact-type/business once the observation window ends.
    const attributionToken = randomUUID();
    // Allocation is autonomous — see experiment.ts. Starts 80% B / 20% A;
    // auto-promotes the clear winner (with a small control slice for the
    // other side) once one is, or stops touching the split once neither
    // variant clears the historical baseline (see evaluateExperiment).
    const variant = pickVariant(experimentState);

    let result: { ok: boolean; skipped?: boolean; reason?: string; resendEmailId?: string | null };
    try {
      result = await sendProspectEmail(prospect, contact.email, {
        agencyName,
        industryLabel: industryLabel ?? industry,
        preScan,
        attributionToken,
        variant,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[outreach-batch] Send failed", { businessName: prospect.businessName, error: message });
      await recordOutreachSendFailure({ campaign: "cold_outreach", businessName: prospect.businessName, error: message });
      skipped++;
      continue;
    }

    if (!result.ok) {
      console.info("[outreach-batch] Skipped", { businessName: prospect.businessName, reason: result.reason });
      skipped++;
      continue;
    }

    await recordOutreachSent(
      prospect.placeId,
      prospect.businessName,
      contact.email,
      prospect.city,
      preScan?.publicId,
      contact.source,
      contact.confidence,
      result.resendEmailId ?? undefined,
      {
        industry: industryLabel ?? industry,
        attributionToken,
        discoverySourceUrl: contact.discoverySourceUrl,
        isNamed: contact.isNamed,
        variant,
        priorityScore: priority.score,
        priorityBand: priority.band,
        findingStrength: priority.findingStrength,
        topFindingId: priority.topFindingId,
      },
    );
    await recordOutreachSendRow({
      resendEmailId: result.resendEmailId ?? null,
      placeId: prospect.placeId,
      recipient: contact.email,
      campaign: "cold_outreach",
      sequenceStep: "initial",
      contactSource: contact.source,
      contactConfidence: contact.confidence,
    });
    console.info("[outreach-batch] Sent", {
      businessName: prospect.businessName,
      email: contact.email,
      isNamed: contact.isNamed,
      discoverySourceUrl: contact.discoverySourceUrl,
      score: prospect.opportunityScore,
      priorityScore: priority.score,
      priorityBand: priority.band,
      preScanned: Boolean(preScan),
      reportScore: preScan?.score,
    });
    sent++;
  }

  console.info("[outreach-batch] Done", { sent, skipped, prospects: prospects.length, evaluated: eligible.length });
  return { sent, skipped, prospects: prospects.length };
}

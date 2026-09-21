/**
 * Authority reply loop. Inbound replies to authority pitches are classified
 * deterministically (no model call, no cost), the opportunity is updated so no
 * further follow-up is ever sent, simple information requests are answered from
 * verified Business Truth only, and anything ambiguous or risky becomes a rare
 * NEEDS YOU item instead of a guess.
 */

import { and, desc, eq } from "drizzle-orm";
import { backlinkOpportunities, businesses, getDb, jobs } from "@/lib/db";
import { recordOptOut } from "@/lib/email/optout";
import { ensureFreshTruth } from "@/lib/truth";
import { sendAuthorityEmail, chooseAuthorityAsset } from "./engine";
export { inboundReplyDomain } from "./engine";

export type ReplyClass = "positive" | "needs_information" | "declined" | "unsubscribe" | "automated" | "unclear";

const RE = {
  unsubscribe: /\b(unsubscribe|remove (me|us)|take (me|us) off|do not (contact|email)|don'?t (contact|email)|stop (emailing|contacting|sending)|opt[- ]?out)\b/i,
  automated: /\b(out of (the )?office|auto[- ]?reply|automatic reply|automated (response|message)|on vacation|delivery (status )?(failure|notification)|mailer-daemon|undeliverable|do not reply to this)\b/i,
  declined: /\b(not interested|no thank(s| you)|unable to|we (do not|don'?t) (link|list|share|feature)|not (a )?(fit|something we)|decline|cannot|can'?t (help|do|add))\b/i,
  needsInfo: /(\?|\b(more (info|information|details)|tell (me|us) more|send (me|us)|can you (send|share|provide)|what (is|does|are)|who (are|is)|how (do|does|much))\b)/i,
  positive: /\b(happy to|glad to|sounds (good|great)|will (add|link|share|mention|post)|we('ll| will) (add|link|share|mention|post)|interested|love to|great (resource|idea|site)|thanks? for (reaching|sharing)|please (do|send))\b/i,
};

export function classifyReply(text: string): ReplyClass {
  const t = text.replace(/\s+/g, " ").slice(0, 4000);
  if (RE.unsubscribe.test(t)) return "unsubscribe";
  if (RE.automated.test(t)) return "automated";
  if (RE.declined.test(t)) return "declined";
  if (RE.positive.test(t) && !/\?/.test(t)) return "positive";
  if (RE.needsInfo.test(t)) return "needs_information";
  if (RE.positive.test(t)) return "positive";
  return "unclear";
}

const RISKY = /\b(price|pricing|cost|fee|pay|paid|sponsor|advertis|contract|legal|lawyer|lawsuit|exclusive|partnership|call|phone|meeting|schedule|invoice|guarantee)\b/i;
const SIMPLE_INFO = /\b(more (info|information|details)|tell (me|us) more|what (is|does)|who (are|is)|website|link|url|send (me|us)|about (you|your))\b/i;

export function opportunityIdFromAddress(to: string[] | string | undefined): string | null {
  const list = Array.isArray(to) ? to : to ? [to] : [];
  for (const a of list) {
    const m = a.match(/reply\+([0-9a-f-]{36})@/i);
    if (m) return m[1]!;
  }
  return null;
}

export async function handleAuthorityReply(input: { opportunityId: string; from: string; subject?: string; text: string }): Promise<{ classification: ReplyClass; action: string }> {
  const db = getDb();
  if (!db) return { classification: "unclear", action: "no_db" };
  const [opp] = await db.select().from(backlinkOpportunities).where(eq(backlinkOpportunities.id, input.opportunityId)).limit(1);
  if (!opp || !opp.businessId) return { classification: "unclear", action: "unknown_opportunity" };
  const businessId = opp.businessId;
  const cls = classifyReply(input.text);
  const log = (event: string, extra: Record<string, unknown> = {}) =>
    db.insert(jobs).values({ businessId, type: "authority_event", status: "completed", payload: { opportunityId: opp.id, event, at: new Date().toISOString(), ...extra } });
  await db.insert(jobs).values({
    businessId,
    type: "authority_reply",
    status: cls,
    payload: { opportunityId: opp.id, from: input.from.slice(0, 200), subject: input.subject?.slice(0, 200) ?? null, classification: cls, excerpt: input.text.replace(/\s+/g, " ").slice(0, 400) },
  });

  if (cls === "automated") {
    await log("automated_response");
    return { classification: cls, action: "ignored_automated" };
  }
  if (cls === "unsubscribe") {
    await recordOptOut(opp.contactEmail ?? input.from);
    await db.update(backlinkOpportunities).set({ status: "unsubscribed" }).where(eq(backlinkOpportunities.id, opp.id));
    await log("reply_unsubscribe");
    return { classification: cls, action: "opted_out_and_stopped" };
  }
  if (cls === "declined") {
    await db.update(backlinkOpportunities).set({ status: "declined" }).where(eq(backlinkOpportunities.id, opp.id));
    await log("reply_declined");
    return { classification: cls, action: "stopped_declined" };
  }

  // positive / needs_information / unclear: a human-written reply always ends follow-ups.
  await db.update(backlinkOpportunities).set({ status: "replied" }).where(eq(backlinkOpportunities.id, opp.id));
  await log(`reply_${cls}`);

  if (cls === "needs_information" && SIMPLE_INFO.test(input.text) && !RISKY.test(input.text)) {
    const sentBefore = await db.select({ payload: jobs.payload }).from(jobs).where(and(eq(jobs.businessId, businessId), eq(jobs.type, "authority_reply_sent")));
    const alreadyAnswered = sentBefore.some((j) => (j.payload as { opportunityId?: string } | null)?.opportunityId === opp.id);
    if (!alreadyAnswered) {
      const truth = await ensureFreshTruth(businessId);
      const [biz] = await db.select({ website: businesses.website }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
      const asset = chooseAuthorityAsset(truth, biz?.website ?? null);
      if (truth.sufficient && truth.description && asset) {
        const text = `Hello,\n\nThanks for getting back to us. ${truth.businessName}: ${truth.description.replace(/\s+/g, " ").slice(0, 400)}\n\nThe page we mentioned: ${asset.title} (${asset.url}).\n\nIf anything else would help, just reply here.`;
        const res = await sendAuthorityEmail({ businessId, to: opp.contactEmail ?? input.from, subject: `Re: ${input.subject ?? `A resource for ${opp.sourceName}`}`.slice(0, 120), text });
        if (res.ok) {
          await db.insert(jobs).values({ businessId, type: "authority_reply_sent", status: "completed", payload: { opportunityId: opp.id, resendEmailId: res.id } });
          await log("auto_reply_sent", { resendEmailId: res.id });
          return { classification: cls, action: "answered_from_verified_facts" };
        }
      }
    }
  }
  // Anything else: one rare NEEDS YOU item (the reply itself is stored above).
  await db.insert(jobs).values({ businessId, type: "authority_needs_you", status: "open", payload: { opportunityId: opp.id, classification: cls, prospect: opp.sourceName, excerpt: input.text.replace(/\s+/g, " ").slice(0, 300) } });
  return { classification: cls, action: cls === "positive" ? "positive_reply_logged" : "needs_you_created" };
}

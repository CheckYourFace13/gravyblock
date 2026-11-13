/**
 * The owner's portfolio target (owner directive 2026-11-10): FIVE genuinely distinct videos per product, existing approved and public videos counted. Positions 1 to 3 are the
 * original library (problem to solution, product demo, specific use case). Positions 4 and 5 are OPEN SLOTS: each states a purpose, not a script, and the concept generator fills it
 * only from verified Product Truth and a real product interaction. A slot that has no strong truthful idea stays blocked and the product waits (WAITING_FOR_NEW_OPPORTUNITY);
 * no filler is ever made to reach five, and Product Truth changing reopens it. GravyBlock has its own much larger topic inventory and the iScream site showcase is held out.
 */
import type { StudioDb } from "./db";
import type { AngleEntry } from "./library";
import { getAngles } from "./library-store";
import { setSetting } from "./runtime";
import { angleKey } from "./library";

export const OWNED_TARGET = 5;
/** Products with their own inventory or kept out of the loop. */
export const TARGET_EXEMPT = new Set(["gravyblock", "iscreamstudio"]);

export const SLOT_PURPOSES: Record<number, { purpose: string; funnel: AngleEntry["funnel"]; goal: string; hook: string; benefit: string; audience: string }> = {
  4: {
    purpose: "Objection or feature payoff",
    funnel: "interested",
    goal: "answer the strongest real objection a likely customer has, or show the one feature payoff that changes their mind, using something the live product can really do",
    hook: "the doubt that stops people from trying it, answered on screen",
    benefit: "a different customer intent from the first three videos: the reason to trust it or to pick it over doing nothing",
    audience: "someone who already understands the product category but is not yet convinced",
  },
  5: {
    purpose: "Acquisition or conversion angle",
    funnel: "high_intent",
    goal: "give a high-intent visitor the single clearest reason to start now, built around a result the live product shows and a free first step",
    hook: "the fastest route from curiosity to the first useful result",
    benefit: "the strongest verified reason to act today, distinct in story from every other video of this product",
    audience: "a visitor ready to try it who needs the first step to be obvious",
  },
};

export function slotEntry(p: { slug: string; name: string; home: string }, position: number): AngleEntry {
  // positions beyond the five the owner first set are further open slots: each is a different customer intent, found only from verified Product Truth
  const s = SLOT_PURPOSES[position] ?? { purpose: `Further distinct angle ${position - 5}`, funnel: (position % 2 ? "interested" : "cold") as AngleEntry["funnel"], goal: "find one more genuinely different, truthful reason to watch or try this product, using something the live product can really do that no earlier video showed", hook: "a real reason not yet shown in any earlier video", benefit: "a different story from every earlier video of this product", audience: "a likely customer who has not seen this angle" };
  return {
    id: `${p.slug}-slot-${position}`,
    slug: p.slug,
    position,
    role: position === 4 ? "C" : "A",
    title: `${p.name}: ${s.purpose.toLowerCase()} (open slot)`,
    hook: s.hook,
    goal: s.goal,
    audience: s.audience,
    coreBenefit: s.benefit,
    features: [],
    scenes: [],
    cta: { text: "Try it free", url: p.home },
    status: "planned",
    approval: "none",
    existing: false,
    funnel: s.funnel,
    slot: true,
    purpose: s.purpose,
  };
}

/** Pure: how far a product is toward its target. A video counts once it is approved, public or in the owner's review. */
export function targetProgress(angles: Array<Pick<AngleEntry, "status" | "position" | "slot">>, target = OWNED_TARGET) {
  const done = angles.filter((a) => a.status === "public" || a.status === "approved" || a.status === "unlisted_review").length;
  const making = angles.filter((a) => a.status === "in_production" || a.status === "ready_for_review").length;
  return { target, done, making, missing: Math.max(0, target - done - making) };
}

/** Makes sure the two open slots exist for an owned product. Existing angles are never touched. Returns how many were added. */
export async function ensureOwnedSlots(db: StudioDb, actor: string, p: { slug: string; name: string; home: string }, target = OWNED_TARGET): Promise<number> {
  if (TARGET_EXEMPT.has(p.slug)) return 0;
  const existing = await getAngles(db, p.slug);
  if (!existing.length) return 0; // the original library has not been stored yet
  const positions = Array.from({ length: Math.max(5, target) - 3 }, (_, i) => i + 4);
  const add = positions.filter((pos) => !existing.some((a) => a.position === pos)).map((pos) => slotEntry(p, pos));
  if (!add.length) return 0;
  await setSetting(angleKey(p.slug), [...existing, ...add], actor, db, { audited: false });
  return add.length;
}

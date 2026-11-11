/**
 * When the owner says something in a video looks factually wrong, the claim is taken seriously: Product Truth is re-checked against the live page, the claim is removed from the
 * replacement whether or not the page still shows it (the owner's doubt is enough to keep it out), and the underlying fact and source are flagged for correction so the owner never has
 * to resolve it by hand and no later video repeats it.
 */
import { and, eq, like } from "drizzle-orm";
import { audit } from "../audit";
import { ms, type StudioDb } from "../db";
import { getSetting, setSetting } from "../runtime";
import type { Concept } from "../video/concepts/types";
import { keyWords, stripMarkers } from "./text";
import type { EditPlan, RecheckEntry, RecheckResult } from "./types";

const ACTOR = "change-request-engine";
const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
export const flagsKey = (productId: string) => `product_truth_flags_${productId}`;
export type TruthFlag = { at: string; phrase: string; reason: string; ownerNote: string; claimId?: string; path?: string; stillOnLivePage?: boolean | null; status: "flagged" };

export async function listFlags(db: StudioDb, productId: string): Promise<TruthFlag[]> {
  const v = await getSetting<TruthFlag[]>(flagsKey(productId), [], db);
  return Array.isArray(v) ? v : [];
}
export const flaggedPhrases = async (db: StudioDb, productId: string) => (await listFlags(db, productId)).map((f) => f.phrase);

export async function fetchPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": "GravyBlock-Marketing-Studio-Recheck" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const html = await res.text();
    return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  } catch {
    return null;
  }
}

/** Claims the request touches: removed or changed by the plan, or about the words the owner doubted. */
export function implicatedClaims(before: Concept, after: Concept, plan: EditPlan) {
  const doubted = (plan.factual?.phrases ?? []).map((p) => new Set(keyWords(p))).filter((s) => s.size);
  const afterText = new Map(after.claims.map((c) => [c.id, c.text]));
  return before.claimsUsed.filter((u) => {
    const gone = !afterText.has(u.id);
    const changed = afterText.has(u.id) && afterText.get(u.id) !== before.claims.find((c) => c.id === u.id)?.text;
    const words = new Set(keyWords(`${u.quote} ${u.text}`));
    const about = doubted.some((d) => [...d].filter((w) => words.has(w)).length / d.size >= 0.6);
    return gone || changed || about;
  });
}

export async function recheckProductTruth(db: StudioDb, input: { productId: string; origin: string; before: Concept; after: Concept | null; plan: EditPlan; note: string; fetchText?: (url: string) => Promise<string | null> }): Promise<RecheckResult> {
  const ownerConcern = Boolean(input.plan.factual);
  const after = input.after ?? input.before;
  const used = implicatedClaims(input.before, after, input.plan);
  const fetchText = input.fetchText ?? fetchPageText;
  const cache = new Map<string, string | null>();
  const entries: RecheckEntry[] = [];
  const stillQuoted = (quote: string) => after.claims.some((c) => c.sources.some((s) => norm(s.quote) === norm(quote)));
  for (const u of used) {
    const url = new URL(u.path || "/", input.origin).toString();
    if (!cache.has(url)) cache.set(url, await fetchText(url));
    const page = cache.get(url);
    // text that only appears after a tap cannot be seen in the page as first loaded: the capture checks it live, tap by tap
    const afterTap = /^c-pay/.test(u.id) && input.before.capturePlan.some((p) => p.clicks.some((k) => k.kind === "click" && k.payoff === u.quote));
    entries.push({ claimId: u.id, quote: u.quote, path: u.path, onLivePage: page == null || afterTap ? null : norm(page).includes(norm(u.quote)), action: stillQuoted(u.quote) ? "kept" : "removed" });
  }
  const flagged: RecheckResult["flagged"] = [];
  if (ownerConcern) {
    const reason = `The owner reported this as wrong when reviewing a video ("${input.note.slice(0, 160)}"). Check the source page and correct it, or confirm it is right.`;
    const phrases = new Set<string>([...(input.plan.factual?.phrases ?? []), ...entries.filter((e) => e.action === "removed").map((e) => e.quote)].map((p) => stripMarkers(p)).filter((p) => p.length >= 6));
    for (const phrase of phrases) flagged.push({ phrase, reason });
  }
  const note = !used.length
    ? "No claim of the video was affected."
    : `${used.length} claim${used.length === 1 ? "" : "s"} re-checked against the live page: ${entries.map((e) => `"${e.quote.slice(0, 60)}" ${e.onLivePage === null ? "is shown after a tap, so the capture verifies it live" : e.onLivePage ? "is still on the page" : "is no longer on the page"}, ${e.action === "removed" ? "removed from the video" : "kept"}`).join("; ")}.${ownerConcern ? ` The owner doubted it, so it stays out and is flagged for source correction.` : ""}`;
  return { ownerConcern, entries, flagged, note };
}

/** Stores the flags and takes the matching facts out of use (they stay in the record as superseded). */
export async function flagForCorrection(db: StudioDb, productId: string, r: RecheckResult, ownerNote: string): Promise<number> {
  if (!r.flagged.length) return 0;
  const cur = await listFlags(db, productId);
  let added = 0;
  for (const f of r.flagged) {
    if (cur.some((x) => norm(x.phrase) === norm(f.phrase))) continue;
    const e = r.entries.find((x) => norm(x.quote) === norm(f.phrase));
    cur.push({ at: new Date().toISOString(), phrase: f.phrase, reason: f.reason, ownerNote: ownerNote.slice(0, 300), claimId: e?.claimId, path: e?.path, stillOnLivePage: e?.onLivePage ?? null, status: "flagged" });
    added++;
    const facts = await db.select().from(ms.msProductFacts).where(and(eq(ms.msProductFacts.productId, productId), eq(ms.msProductFacts.status, "current"), like(ms.msProductFacts.factValue, `%${f.phrase.replace(/[%_]/g, "")}%`)));
    for (const fact of facts) {
      await db.update(ms.msProductFacts).set({ status: "superseded" }).where(eq(ms.msProductFacts.id, fact.id));
      await audit(db, { actor: ACTOR, action: "fact.flag", entity: "fact", entityId: fact.id, productId, detail: { reason: f.reason } });
    }
  }
  await setSetting(flagsKey(productId), cur, ACTOR, db, { audited: false });
  return added;
}

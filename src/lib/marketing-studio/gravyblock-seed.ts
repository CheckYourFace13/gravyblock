/** Seeds GravyBlock's own topic inventory into its angle library behind the duplicate gate (see gravyblock-topics.ts). */
import { checkDistinct, type AngleEntry } from "./library";
import { PLANNED, toEntry } from "./library-plan";
import { getAngles } from "./library-store";
import { placementsByPage, topicEntries } from "./gravyblock-topics";
import { angleKey } from "./library";
import type { StudioDb } from "./db";
import { setSetting } from "./runtime";

export const GRAVYBLOCK_PLACEMENTS_KEY = "gravyblock_site_placements";

/** Pure-ish: the entries that pass the gate, in order, each checked against the initial library and every earlier passing topic. */
export function gateTopics(base: AngleEntry[], from = 4): { accepted: AngleEntry[]; conflicts: Array<{ id: string; with: string; reasons: string[] }> } {
  const accepted: AngleEntry[] = [];
  const conflicts: Array<{ id: string; with: string; reasons: string[] }> = [];
  for (const e of topicEntries(from)) {
    const g = checkDistinct(e, [...base, ...accepted]);
    if (g.ok) accepted.push(e);
    else for (const c of g.conflicts) conflicts.push({ id: e.id, with: c.with, reasons: c.reasons });
  }
  return { accepted, conflicts };
}

const initialBase = (existing: AngleEntry[]): AngleEntry[] => (existing.length ? existing : PLANNED.filter((p) => p.slug === "gravyblock").map(toEntry));

export async function gravyblockInventory(db: StudioDb) {
  const existing = await getAngles(db, "gravyblock");
  const topics = topicEntries().length;
  const ids = new Set(existing.map((a) => a.id));
  const fresh = initialBase(existing).filter((a) => a.position <= 3 || ids.has(a.id));
  const { accepted, conflicts } = gateTopics(fresh);
  return { topics, distinct: accepted.length, conflicts, alreadySeeded: topicEntries().filter((e) => ids.has(e.id)).length };
}

export async function seedGravyblockTopics(db: StudioDb, actor: string): Promise<{ added: number; skipped: number }> {
  const existing = await getAngles(db, "gravyblock");
  const have = new Set(existing.map((a) => a.id));
  const nextPos = Math.max(3, ...existing.map((a) => a.position)) + 1;
  const { accepted } = gateTopics(initialBase(existing), nextPos);
  const add = accepted.filter((e) => !have.has(e.id));
  await setSetting(angleKey("gravyblock"), [...existing, ...add], actor, db);
  await setSetting(GRAVYBLOCK_PLACEMENTS_KEY, { note: "Recommendations for developers. Marketing Studio never edits gravyblock.com (House account no-write rule).", byPage: placementsByPage() }, actor, db);
  return { added: add.length, skipped: accepted.length - add.length };
}

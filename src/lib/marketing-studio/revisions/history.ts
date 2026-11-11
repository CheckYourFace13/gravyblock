/** Structured revision history: every change request, how it was understood, what changed and which video it produced. Several rounds are kept and each later round sees the earlier ones. */
import type { StudioDb } from "../db";
import { getSetting, setSetting } from "../runtime";
import { revisionsKey, type Revision } from "./types";

const ACTOR = "change-request-engine";

export async function listRevisions(db: StudioDb, specId: string): Promise<Revision[]> {
  const v = await getSetting<Revision[]>(revisionsKey(specId), [], db);
  return Array.isArray(v) ? v : [];
}

export async function saveRevision(db: StudioDb, specId: string, rev: Revision): Promise<Revision> {
  const all = await listRevisions(db, specId);
  const next = { ...rev, updatedAt: new Date().toISOString() };
  const i = all.findIndex((r) => r.id === rev.id);
  if (i >= 0) all[i] = next;
  else all.push(next);
  await setSetting(revisionsKey(specId), all, ACTOR, db, { audited: false });
  return next;
}

/** The revision that answers a given review (one per review: a retry reuses it). */
export async function revisionFor(db: StudioDb, specId: string, supersedes: string): Promise<Revision | null> {
  return (await listRevisions(db, specId)).find((r) => r.supersedes === supersedes) ?? null;
}

export async function markRevision(db: StudioDb, specId: string, supersedes: string, patch: Partial<Revision>): Promise<Revision | null> {
  const cur = await revisionFor(db, specId, supersedes);
  return cur ? saveRevision(db, specId, { ...cur, ...patch }) : null;
}

/** Earlier owner feedback for the same video, oldest first, so the next round never loses it. */
export async function earlierFeedback(db: StudioDb, specId: string, exceptSupersedes?: string): Promise<Array<{ note: string; summary: string[] }>> {
  return (await listRevisions(db, specId)).filter((r) => r.supersedes !== exceptSupersedes && r.status !== "failed").map((r) => ({ note: r.note, summary: r.plan.summary }));
}

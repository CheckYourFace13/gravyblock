/** Generated concepts live in settings (video_concept_<specId>); this loads one into the spec registry so the renderer, queue and review code find it like a hand-written spec. */
import type { StudioDb } from "../../db";
import { getSetting } from "../../runtime";
import { DEMO_SPECS } from "../demo/specs";
import type { Attempt } from "./generate";
import { specFromConcept } from "./build";
import type { Concept } from "./types";
import { applyScriptEdits, scriptEditsKey, type ScriptEdits } from "../../revisions/handwritten";

export const conceptKey = (specId: string) => `video_concept_${specId.replace(/[^a-z0-9]+/gi, "_")}`;
export const discoveryKey = (slug: string) => `video_discovery_${slug}`;

export type StoredConcept = {
  specId: string;
  status: "ready" | "blocked";
  concept: Concept | null;
  /** other concepts that passed the gates for this angle; the next one is used when the finished video fails the post-render gate */
  alternates: Concept[];
  /** the variant to try next when the finished video fails the post-render gate */
  nextVariant: number;
  attempts: Attempt[];
  generatedAt: string;
  /** what replaced this angle when it could not be made well, if anything */
  note?: string;
};

/** Makes a generated spec available. A hand-written spec is never replaced. */
export async function ensureSpec(db: StudioDb, specId: string): Promise<void> {
  const cur = DEMO_SPECS[specId];
  if (cur && !cur.concept) {
    // a hand-written script keeps its own timeline; the owner's accepted text edits are layered over it every time it loads
    applyScriptEdits(cur, await getSetting<ScriptEdits | null>(scriptEditsKey(specId), null, db));
    return;
  }
  const stored = await getSetting<StoredConcept | null>(conceptKey(specId), null, db);
  if (!stored?.concept || stored.status !== "ready") {
    if (cur) return;
    throw new Error(`There is no script for "${specId}" yet. Run the concept generator (scripts/ops/marketing-concepts-run.ts).`);
  }
  DEMO_SPECS[specId] = specFromConcept(stored.concept);
}

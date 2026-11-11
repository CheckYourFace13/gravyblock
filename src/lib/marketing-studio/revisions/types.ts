/**
 * Change-request engine V2 (owner directive 2026-11-11). An owner's note is interpreted into a structured EditPlan (by the capped language-model step, checked by deterministic
 * validation), the plan is applied to the video's SOURCE (script, scene and capture plan, voice settings, Product Truth), and the video is rebuilt from that source. The rendered
 * MP4 is only a review artifact. Timing is always recalculated, so removing a sentence or a scene is an ordinary edit, not a reason to refuse.
 */

/** The optional quick controls on the Request Changes page. They help classification and never restrict the free-text note. */
export const QUICK_KINDS = ["remove", "wording", "visual", "example", "pronunciation", "shorter", "exciting", "other"] as const;
export type QuickKind = (typeof QUICK_KINDS)[number];
export const QUICK_LABELS: Record<QuickKind, string> = { remove: "Remove something", wording: "Change wording", visual: "Change visual", example: "Change example or location", pronunciation: "Fix pronunciation", shorter: "Make shorter", exciting: "Make more exciting", other: "Other" };
export const WHERE_OPTIONS = ["beginning", "middle", "end"] as const;
export type NoteHints = { kinds: QuickKind[]; where?: (typeof WHERE_OPTIONS)[number]; /** a scene or time the owner named, free text */ at?: string };

/** One edit. Line ids are narration line ids (L1...), plate ids are capture plate ids (p1...), scene ids are a1, a2 ... */
export type EditOp =
  | { op: "remove_text"; line: string; phrase: string }
  | { op: "remove_line"; line: string }
  | { op: "remove_scene"; scene: string }
  /** Replace what a tap does with another real, probed step of the same page group (the engine picks one when `candidate` is omitted). The line for that tap is rewritten with `line`. */
  | { op: "remove_step"; plate: string; step: 1 | 2 }
  | { op: "replace_step"; plate: string; step: 1 | 2; candidate: string }
  | { op: "rewrite_line"; line: string; spoken: string; caption?: string }
  | { op: "consolidate"; lines: string[]; spoken: string; caption?: string }
  | { op: "replace_text"; find: string; replace: string }
  | { op: "expand_abbreviations"; words?: string[] }
  | { op: "pronunciation"; written: string; spoken: string }
  | { op: "pace"; direction: "faster" | "slower"; amount?: "slightly" | "normal" | "much" }
  | { op: "cta_text"; text: string }
  | { op: "cta_url"; url: string }
  | { op: "reorder_scenes"; order: string[] }
  | { op: "zoom"; direction: "closer" | "wider" }
  | { op: "recapture"; plate: string };

export type EditPlan = {
  /** how the owner feels about the video as it is: a note that only praises is not an edit */
  sentiment?: "positive" | "neutral" | "negative";
  /** one plain sentence per change, shown back to the owner */
  summary: string[];
  ops: EditOp[];
  /** set when the owner says something looks factually wrong */
  factual?: { concern: string; phrases: string[] };
  /** scenes or lines the owner did not touch (kept exactly) */
  preserve?: string[];
  /** only for a request that is genuinely contradictory or cannot be done safely: the exact choice and simple options */
  needsOwner?: { reason: string; options: string[] };
  /** sentences of the note that no edit was found for (they are said back to the owner, never silently dropped) */
  unresolved?: string[];
};

export type ScriptSnapshot = { title: string; seconds: number; lines: Array<{ id: string; scene: string; spoken: string; caption?: string }>; steps: string[]; cta: string };

export type RecheckEntry = { claimId: string; quote: string; path: string; onLivePage: boolean | null; action: "removed" | "kept" };
export type RecheckResult = { ownerConcern: boolean; entries: RecheckEntry[]; flagged: Array<{ phrase: string; reason: string }>; note: string };

export type Revision = {
  id: string;
  round: number;
  at: string;
  /** the publication (the review the owner was looking at) this revision answers, and the one that replaced it */
  supersedes: string;
  supersededBy?: string;
  note: string;
  hints?: NoteHints;
  interpretedBy: "language_model" | "rules" | "both";
  plan: EditPlan;
  recheck?: RecheckResult;
  scenesAffected: string[];
  before: ScriptSnapshot;
  after: ScriptSnapshot;
  aiMicros: number;
  resultVideoRowId?: string;
  resultVideoId?: string;
  status: "planned" | "applied" | "rendered" | "sent" | "needs_owner" | "failed";
  detail?: string;
  updatedAt: string;
  /** the script exactly as it was before this revision changed it, so a failed render can be rebuilt from the source instead of on top of a half-good result */
  sourceConcept?: unknown;
};

export const revisionsKey = (specId: string) => `video_revisions_${specId.replace(/[^a-z0-9]+/gi, "_")}`;

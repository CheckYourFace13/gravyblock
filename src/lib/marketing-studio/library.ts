/**
 * The video library: for every product, the angles that exist or are planned, and the gate that stops a new video from repeating one that is already
 * approved, public or in progress. An approved or public video CONSUMES its angle; "we need more videos" is never a reason to make a cosmetic variant of
 * it. A concept is compared on its hook, purpose, core benefit, features shown, scene order and call-to-action framing, and is blocked if it substantially
 * repeats any of them. Pure functions here; the stored inventory is saved by scripts/ops/marketing-library-save.ts.
 */
export type AngleRole = "A" | "B" | "C";
export const ROLE_LABEL: Record<AngleRole, string> = { A: "Problem to solution", B: "Product demo", C: "Specific use case" };
export type AngleStatus = "planned" | "in_production" | "ready_for_review" | "unlisted_review" | "approved" | "public" | "superseded" | "blocked";
export type Funnel = "cold" | "interested" | "high_intent";

export type AngleEntry = {
  id: string; // stable, used as utm_content: <slug>-<angle>
  slug: string;
  position: 1 | 2 | 3;
  role: AngleRole;
  title: string;
  hook: string;
  goal: string;
  audience: string;
  coreBenefit: string;
  features: string[];
  /** screens or scenes used, in order */
  scenes: string[];
  cta: { text: string; url: string };
  status: AngleStatus;
  approval: "owner_approved" | "pending" | "none";
  existing: boolean;
  funnel: Funnel;
  videoRowId?: string;
  youtubeId?: string;
  publicationId?: string;
  publicationUrl?: string;
  /** the demo script that makes this video ("<slug>:<angle>"), once it has been written */
  specId?: string;
  /** the YouTube title and description to use once it is made */
  yt?: { title: string; description: string };
  /** set when the concept generator (video/concepts) made or replaced this angle */
  generated?: { variant: number; replaces?: string; note?: string; personality?: string };
  /** the angle that replaced this one because the generator could not make it well from the live product */
  replacedBy?: string;
  /** latest measured numbers when the video is public, each marked by how well it is known */
  performance?: Record<string, { value: number | null; status: string }>;
};

export const angleKey = (slug: string) => `video_angles_${slug}`;

/** An angle that is already used up: anything but a superseded or blocked one. */
export const consumes = (e: Pick<AngleEntry, "status">) => e.status !== "superseded" && e.status !== "blocked";

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "at", "is", "it", "your", "you", "with", "that", "this", "how", "what", "do", "does", "can", "from", "by", "as", "are", "be", "s"]);
const stem = (w: string) => w.toLowerCase().replace(/(ing|ed|es|s)$/, "");
const tokens = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP.has(w) && w.length > 1).map(stem));
const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
};
const listOverlap = (a: string[], b: string[]) => jaccard(new Set(a.map((x) => x.toLowerCase())), new Set(b.map((x) => x.toLowerCase())));
/** how much of the shorter scene sequence appears in the same order in the longer one */
function orderedOverlap(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return a.length && b.length ? dp[a.length][b.length] / Math.min(a.length, b.length) : 0;
}

export type Similarity = { reasons: string[]; scores: Record<string, number> };

export function compareAngles(a: AngleEntry, b: AngleEntry): Similarity {
  const scores = {
    hook: jaccard(tokens(a.hook), tokens(b.hook)),
    goal: jaccard(tokens(a.goal), tokens(b.goal)),
    benefit: jaccard(tokens(a.coreBenefit), tokens(b.coreBenefit)),
    features: listOverlap(a.features, b.features),
    scenes: orderedOverlap(a.scenes, b.scenes),
    cta: jaccard(tokens(`${a.cta.text} ${a.cta.url}`), tokens(`${b.cta.text} ${b.cta.url}`)),
  };
  const reasons: string[] = [];
  if (scores.hook >= 0.5) reasons.push("repeats the hook");
  else if (scores.hook >= 0.4) reasons.push("has a similar hook");
  if (scores.goal >= 0.6) reasons.push("repeats the marketing purpose");
  if (scores.benefit >= 0.5) reasons.push("repeats the core benefit");
  if (scores.features >= 0.5) reasons.push("shows the same features");
  if (scores.scenes >= 0.7 && a.scenes.length > 2 && b.scenes.length > 2) reasons.push("recycles the scene order");
  if (a.role === b.role && a.slug === b.slug) reasons.push("fills a role that is already taken");
  return { reasons, scores };
}

/**
 * A concept is distinct only if it does not substantially repeat any angle that is already consumed for the product. It is blocked when it repeats the
 * hook or the purpose, takes an occupied role, recycles the scene order, or repeats BOTH the core benefit and the features.
 */
export function checkDistinct(proposal: AngleEntry, library: AngleEntry[]): { ok: boolean; conflicts: Array<{ with: string; title: string; reasons: string[] }> } {
  const conflicts: Array<{ with: string; title: string; reasons: string[] }> = [];
  for (const e of library) {
    if (e.id === proposal.id || e.slug !== proposal.slug || !consumes(e)) continue;
    const { reasons, scores } = compareAngles(proposal, e);
    const blocking = reasons.includes("repeats the hook") || reasons.includes("repeats the marketing purpose") || reasons.includes("fills a role that is already taken") || reasons.includes("recycles the scene order") || (scores.benefit >= 0.5 && scores.features >= 0.5) || (reasons.includes("has a similar hook") && scores.benefit >= 0.4);
    if (blocking) conflicts.push({ with: e.id, title: e.title, reasons });
  }
  return { ok: conflicts.length === 0, conflicts };
}

export const hasVerifiedProductUrl = (e: AngleEntry, productHost: string) => {
  try {
    const u = new URL(e.cta.url);
    return u.protocol === "https:" && u.host.replace(/^www\./, "") === productHost;
  } catch {
    return false;
  }
};

/** utm for a library video: the product is the campaign and the angle is the content, so results can be compared by hook and angle. */
export const utmFor = (e: Pick<AngleEntry, "slug" | "id">) => ({ campaign: e.slug, content: e.id });

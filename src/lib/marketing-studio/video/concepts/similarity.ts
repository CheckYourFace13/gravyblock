/**
 * Creative history and the similarity gate. Every video of a product is remembered as a fingerprint (hook, problem, benefit, narration, closing line, CTA, the visual sequence on the real
 * product, format). A new video is compared with the product's published, approved, pending-review and recently replaced videos and is refused, BEFORE it is rendered or uploaded, when it
 * repeats a hook, an opening, wording, a closing line, a problem/benefit phrasing or the same sequence of real interactions with slightly changed copy. Pure functions, tested.
 */
import { eq } from "drizzle-orm";
import type { StudioDb } from "../../db";
import { getAngles } from "../../library-store";
import { ms } from "../../db";
import type { DemoRecord } from "../demo/types";
import { openingKey } from "./standard";
import type { Concept } from "./types";

export type CreativeFingerprint = {
  specId: string;
  hook: string;
  problem: string;
  benefit: string;
  /** every spoken line, plain */
  lines: string[];
  closing: string;
  cta: string;
  /** the real interactions in order, e.g. "scroll:learns your business" (empty when the video has no tour) */
  visual: string[];
  format: string;
};

const STOP = new Set("the a an and or of to in on for with your you it is are be as at by this that then its our from into than so can will who what how".split(" "));
const stem = (w: string) => w.replace(/(ing|ed|es|s|ly)$/, "");
export const words = (s: string) => (s.toLowerCase().replace(/\{[^}]*\}/g, "").match(/[a-z0-9']+/g) ?? []).map((w) => w.replace(/'/g, ""));
export const content = (s: string): Set<string> => new Set(words(s).filter((w) => w.length > 2 && !STOP.has(w)).map(stem));
export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (!a.size || !b.size) return 0;
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  return i / (a.size + b.size - i);
}
const shingles = (s: string, n = 3): Set<string> => {
  const w = words(s).filter((x) => !STOP.has(x)).map(stem);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
};
const plain = (s: string) => s.replace(/\{[^}]*\}/g, "").replace(/\s+/g, " ").trim();

export const visualKey = (s: { do: string; text?: string; field?: string; path?: string }) => `${s.do}:${(s.text ?? s.field ?? s.path ?? "").toLowerCase().replace(/\s+/g, " ").trim()}`;

export function fingerprintOfConcept(c: Concept): CreativeFingerprint {
  const lines = c.narration.map((l) => plain(l.spoken));
  return {
    specId: c.specId,
    hook: c.hook,
    problem: c.problem,
    benefit: c.whyItMatters,
    lines,
    closing: lines[lines.length - 1] ?? "",
    cta: c.cta.text,
    visual: (c.tour?.scenes ?? []).flatMap((s) => s.steps.map((x) => visualKey(x))),
    format: c.tour ? "live product tour" : "walkthrough",
  };
}

export function fingerprintOfRecord(r: DemoRecord & { creative?: Partial<CreativeFingerprint> }, specId: string): CreativeFingerprint {
  const lines = r.transcript.map((t) => plain(t.text));
  return {
    specId,
    hook: r.creative?.hook ?? lines[0] ?? "",
    problem: r.creative?.problem ?? "",
    benefit: r.creative?.benefit ?? "",
    lines,
    closing: lines[lines.length - 1] ?? "",
    cta: r.cta?.text ?? "",
    visual: r.creative?.visual ?? [],
    format: r.creative?.format ?? "",
  };
}

export const SIMILARITY = { hook: 0.55, opening: 0.7, narration: 0.3, nearLine: 0.75, nearLines: 2, closing: 0.7, problem: 0.6, visual: 0.6 } as const;

/** Why a candidate is not materially distinct from earlier videos of the same product. Empty when it is. */
export function similarityProblems(c: CreativeFingerprint, history: CreativeFingerprint[]): string[] {
  const out: string[] = [];
  for (const h of history) {
    if (h.specId === c.specId) continue;
    const tag = `"${h.hook.slice(0, 40)}"`;
    if (openingKey(plain(c.hook)) === openingKey(plain(h.hook)) || jaccard(content(c.hook), content(h.hook)) >= SIMILARITY.hook) out.push(`the hook repeats the one of ${tag}`);
    if (c.lines[1] && h.lines[1] && jaccard(content(c.lines[1]), content(h.lines[1])) >= SIMILARITY.opening) out.push(`the opening sentence repeats the one of ${tag}`);
    const sim = jaccard(shingles(c.lines.join(" ")), shingles(h.lines.join(" ")));
    if (sim >= SIMILARITY.narration) out.push(`the narration is ${Math.round(sim * 100)}% the same wording as ${tag}`);
    const near = c.lines.filter((l) => content(l).size >= 3 && h.lines.some((x) => jaccard(content(l), content(x)) >= SIMILARITY.nearLine));
    if (near.length >= SIMILARITY.nearLines) out.push(`${near.length} lines are repeated from ${tag}, for example "${near[0].slice(0, 50)}"`);
    if (jaccard(content(c.closing), content(h.closing)) >= SIMILARITY.closing) out.push(`the closing line repeats the one of ${tag}`);
    if (c.problem && h.problem && jaccard(content(c.problem), content(h.problem)) >= SIMILARITY.problem && c.benefit && h.benefit && jaccard(content(c.benefit), content(h.benefit)) >= SIMILARITY.problem) out.push(`the same problem and benefit are told again as in ${tag}`);
    if (c.visual.length >= 4 && h.visual.length >= 4) {
      const a = new Set(c.visual);
      const b = new Set(h.visual);
      const v = jaccard(a, b);
      const head = c.visual.slice(0, 3).join("|") === h.visual.slice(0, 3).join("|");
      if (v >= SIMILARITY.visual || (head && v >= 0.4)) out.push(`the sequence shown on the real product is ${Math.round(v * 100)}% the same as ${tag}`);
    }
  }
  return [...new Set(out)];
}

/** The product's creative history: its other published, approved, pending and recently replaced videos (never failed ones, never the same script). */
export async function creativeHistory(db: StudioDb, productId: string, exceptSpecId: string): Promise<CreativeFingerprint[]> {
  const rows = await db.select({ id: ms.msVideos.id, sb: ms.msVideos.storyboard, status: ms.msVideos.status }).from(ms.msVideos).where(eq(ms.msVideos.productId, productId));
  // a video whose script is queued to be made again is on its way out and is not history to be distinct from
  const [prod] = await db.select({ slug: ms.msProducts.slug }).from(ms.msProducts).where(eq(ms.msProducts.id, productId));
  const leaving = new Set(prod ? (await getAngles(db, prod.slug)).filter((a) => a.status === "planned" && a.videoRowId).map((a) => a.videoRowId as string) : []);
  const out: CreativeFingerprint[] = [];
  for (const r of rows) {
    if (r.status === "failed" || r.status === "qa_failed" || leaving.has(r.id)) continue;
    const sb = r.sb as (DemoRecord & { creative?: Partial<CreativeFingerprint> }) | null;
    if (!sb || sb.kind !== "demo" || !sb.transcript?.length) continue;
    const spec = sb.specId ?? "";
    if (spec === exceptSpecId) continue;
    out.push(fingerprintOfRecord(sb, spec));
  }
  return out;
}

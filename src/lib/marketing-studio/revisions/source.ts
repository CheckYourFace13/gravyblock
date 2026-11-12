/**
 * The source of truth for a change request. When an owner asks for changes, GravyBlock saves the video exactly as it was accepted (script, scene plan, capture plan, claims,
 * the owner's earlier edits, Brand Kit, voice settings and the Product Truth it rested on). Every attempt to build the replacement starts from that saved source plus the
 * owner's note, never from whatever an earlier attempt left behind, so a failed or half-good attempt can never become the new starting point.
 */
import { eq } from "drizzle-orm";
import { ms, type StudioDb } from "../db";
import { listFacts } from "../repository";
import { getSetting, setSetting } from "../runtime";
import { INTERNAL_SCOPE } from "../scope";
import { getOverrides, saveOverrides } from "../video/demo/overrides";
import { DEMO_SPECS } from "../video/demo/specs";
import { conceptKey, discoveryKey, ensureSpec, type StoredConcept } from "../video/concepts/registry";
import type { Concept, PageDiscovery } from "../video/concepts/types";
import { ensureMarkers, setStep, settle } from "./apply";
import { revisionFor } from "./history";
import { scriptEditsKey, type ScriptEdits } from "./handwritten";

const ACTOR = "change-request-engine";
export const sourceKey = (publicationId: string) => `video_revision_source_${publicationId}`;

export type RevisionSource = {
  publicationId: string;
  specId: string;
  savedAt: string;
  /** "request": saved when the request was made. "recovered": rebuilt from the approved video's own record because the script had already been rewritten by an older attempt. */
  origin: "request" | "recovered" | "unrecoverable";
  /** the generated script (null for a hand-written one, whose text edits are in scriptEdits) */
  concept: Concept | null;
  scriptEdits: ScriptEdits | null;
  overrides: unknown;
  /** the verified Product Truth the video rested on, as text */
  productTruth: string[];
  brand: Concept["brand"] | null;
  voice: { personality: string | null; ctaHost: string | null };
};

type Board = {
  transcript: Array<{ id: string; text: string; caption?: string; sceneId: string }>;
  claims: Array<{ id: string; text: string; factIds?: string[]; sources?: Array<{ quote: string }> }>;
};

const PAY = /^After opening "([\s\S]*)" the page shows: ([\s\S]*)$/;
const SCROLL = /^After scrolling the page shows: ([\s\S]*)$/;

/**
 * Rebuilds a script as it was when its video was approved, from that video's own stored record (the transcript and claims it was rendered from) laid over the current script's
 * structure. Pure. Returns null when the record cannot be matched to the structure safely.
 */
export function reconstructConcept(current: Concept, board: Board, discoveries: PageDiscovery[] = []): Concept | null {
  if (!board.transcript.length) return null;
  const c = structuredClone(current);
  c.zoomBias = undefined;
  c.gapExtraMs = undefined;
  // lines, with the claims a generated script ties to each: the hook and each scene's first two step lines carry the context and tap claims
  const scenes = [...new Set(board.transcript.map((t) => t.sceneId))];
  const claimsFor = (t: Board["transcript"][number], index: number): string[] => {
    if (t.sceneId === "end") return ["c-cta"];
    const n = Number(/^a(\d+)$/.exec(t.sceneId)?.[1]);
    if (!n) return [];
    const inScene = board.transcript.filter((x) => x.sceneId === t.sceneId);
    const j = inScene.indexOf(t) - (n === 1 ? 1 : 0);
    if (n === 1 && inScene.indexOf(t) === 0) return [`c-ctx${n}`];
    return j === 0 ? [`c-ctx${n}`, `c-pay${n}a`] : j === 1 ? [`c-ctx${n}`, `c-pay${n}b`] : [`c-ctx${n}`];
  };
  c.narration = board.transcript.map((t, i) => ({ id: t.id, sceneId: t.sceneId, spoken: t.text, ...(t.caption && t.caption !== t.text ? { caption: t.caption } : {}), claims: claimsFor(t, i) }));
  if (scenes.some((s) => s !== "end" && !/^a\d+$/.test(s))) return null;
  // the steps that were shown, from the claims written about them
  for (let pi = 0; pi < c.capturePlan.length; pi++) {
    for (const k of [0, 1] as const) {
      const claim = board.claims.find((x) => x.id === `c-pay${pi + 1}${k === 0 ? "a" : "b"}`);
      if (!claim) return null;
      const pl = c.capturePlan[pi];
      const cur = pl.clicks[k];
      const open = PAY.exec(claim.text);
      const scroll = SCROLL.exec(claim.text);
      let def: typeof cur | null = null;
      if (open) {
        const [, name, payoff] = open;
        if (cur.kind === "click") {
          const group = discoveries.find((d) => d.path === pl.path)?.groups.find((g) => g.id === pl.groupId);
          const index = cur.name === name ? cur.control : (pl.controls.find((x) => x.name === name) ?? group?.controls.find((x) => x.name === name))?.index;
          if (index === undefined) return null;
          def = { kind: "click", control: index, name, payoff };
        } else if (cur.kind === "link" || cur.kind === "search" || cur.kind === "fill") def = { ...cur, name, payoff };
      } else if (scroll && cur.kind === "scroll") def = { ...cur, payoff: scroll[1] };
      if (!def) return null;
      setStep(c, pi, k, def);
    }
  }
  // claims the lines refer to must exist (a rewrite may have dropped some)
  for (const l of c.narration)
    for (const id of l.claims) {
      if (c.claims.some((x) => x.id === id)) continue;
      const b = board.claims.find((x) => x.id === id);
      if (!b) return null;
      const plate = c.sceneMeta[l.sceneId]?.plate ?? c.capturePlan[0]?.id ?? "";
      const quotes = (b.sources ?? []).map((s) => s.quote);
      c.claims.push({ id, text: b.text, facts: quotes.slice(0, 1), sources: quotes.map((quote) => ({ plate, quote })) });
      if (!c.claimsUsed.some((x) => x.id === id) && quotes[0]) c.claimsUsed.push({ id, text: b.text, quote: quotes[0], path: c.capturePlan.find((p) => p.id === plate)?.path ?? "" });
    }
  if (ensureMarkers(c).length) return null;
  settle(c);
  return c;
}

/** The record the approved video was rendered from. */
export async function boardOf(db: StudioDb, publicationId: string): Promise<Board | null> {
  const rows = await db.select({ storyboard: ms.msVideos.storyboard }).from(ms.msPublications).innerJoin(ms.msVideos, eq(ms.msVideos.id, ms.msPublications.videoId)).where(eq(ms.msPublications.id, publicationId)).limit(1);
  const sb = rows[0]?.storyboard as { transcript?: Board["transcript"]; claims?: Board["claims"] } | undefined;
  return sb?.transcript && sb.claims ? { transcript: sb.transcript, claims: sb.claims } : null;
}

/**
 * Saves the source for a request (once). If an older attempt already rewrote the stored script for this request, the source is rebuilt from the approved video's own record instead,
 * so nothing a failed attempt left behind is ever used.
 */
export async function captureSource(db: StudioDb, input: { specId: string; publicationId: string; productId: string }): Promise<RevisionSource> {
  const existing = await getSetting<RevisionSource | null>(sourceKey(input.publicationId), null, db);
  if (existing) return existing;
  await ensureSpec(db, input.specId).catch(() => undefined);
  const stored = await getSetting<StoredConcept | null>(conceptKey(input.specId), null, db);
  let concept = stored?.concept ? structuredClone(stored.concept) : null;
  let origin: RevisionSource["origin"] = "request";
  const rewrittenBefore = (await revisionFor(db, input.specId, input.publicationId)) !== null;
  if (concept && rewrittenBefore) {
    const board = await boardOf(db, input.publicationId);
    const discoveries = ((await getSetting<PageDiscovery[] | null>(discoveryKey(concept.slug), null, db)) ?? []).filter(Boolean);
    const rebuilt = board ? reconstructConcept(concept, board, discoveries) : null;
    if (rebuilt) {
      concept = rebuilt;
      origin = "recovered";
    } else origin = "unrecoverable";
  }
  const facts = (await listFacts(INTERNAL_SCOPE, input.productId, db)).filter((f) => f.status === "current" && f.verifiedAt).map((f) => f.factValue);
  const source: RevisionSource = {
    publicationId: input.publicationId,
    specId: input.specId,
    savedAt: new Date().toISOString(),
    origin,
    concept,
    scriptEdits: concept ? null : await getSetting<ScriptEdits | null>(scriptEditsKey(input.specId), null, db),
    overrides: await getOverrides(db, input.productId),
    productTruth: facts,
    brand: concept?.brand ?? null,
    voice: { personality: concept?.personality ?? null, ctaHost: concept?.ctaHost ?? null },
  };
  await setSetting(sourceKey(input.publicationId), source, ACTOR, db, { audited: false });
  return source;
}

/** Puts the stored script, text edits and overrides back to the saved source, and drops the in-memory copy so the next load reads it. */
export async function restoreSource(db: StudioDb, productId: string, source: RevisionSource): Promise<void> {
  if (source.concept) {
    const stored = await getSetting<StoredConcept | null>(conceptKey(source.specId), null, db);
    if (stored) await setSetting(conceptKey(source.specId), { ...stored, concept: structuredClone(source.concept), note: "restored from the saved source" }, ACTOR, db, { audited: false });
    delete DEMO_SPECS[source.specId];
  } else {
    await setSetting(scriptEditsKey(source.specId), source.scriptEdits, ACTOR, db, { audited: false });
  }
  await saveOverrides(db, ACTOR, productId, source.overrides as Parameters<typeof saveOverrides>[3]);
  await ensureSpec(db, source.specId);
}


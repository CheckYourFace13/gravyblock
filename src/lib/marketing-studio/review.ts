/**
 * Owner review: loads the real generated output for the pilot products so it can be looked at, not just counted.
 * Read-only apart from the review decision itself; nothing here publishes, schedules or connects anything.
 */
import { inArray } from "drizzle-orm";
import { requireStudioDb, ms, type StudioDb } from "./db";
import { aspectLabel } from "./publishing/platforms";
import { videoCopyContext } from "./publishing/queue";
import { listProducts } from "./repository";
import type { OwnerScope } from "./scope";
import type { DemoRecord } from "./video/demo/types";
import type { CardScene, Storyboard } from "./video/types";

export const PILOT_SLUGS = ["drinkknird", "rentalnoodle", "scribblezap"] as const;
export const REPRESENTATIVE_COUNT = 4;

type Check = { id: string; ok: boolean; severity?: string; detail?: string };

export type QaSummary = { passed: boolean; checks: number; failed: Array<{ id: string; detail: string; severity: string }> };

export function summarizeQa(qa: unknown): QaSummary {
  const checks = ((qa as { checks?: Check[] } | null)?.checks ?? []) as Check[];
  const failed = checks.filter((c) => !c.ok).map((c) => ({ id: c.id, detail: c.detail ?? "", severity: c.severity ?? "fail" }));
  const passed = Boolean((qa as { passed?: boolean } | null)?.passed) && !failed.some((f) => f.severity !== "warn");
  return { passed, checks: checks.length, failed };
}

export type FactRef = { id: string; key: string; value: string; sourceKind: string; sourceUrl: string | null; verified: boolean };

export type ReviewCreative = {
  creativeId: string;
  assetId: string | null;
  conceptId: string;
  family: string;
  campaign: string | null;
  headline: string;
  subhead: string | null;
  caption: string;
  ctaText: string | null;
  ctaUrl: string | null;
  sizeKey: string;
  width: number;
  height: number;
  aspect: string;
  status: string;
  qa: QaSummary;
  facts: FactRef[];
};

export type ReviewVideo = {
  videoId: string;
  assetId: string | null;
  title: string;
  status: string;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  qa: QaSummary;
  captions: string[];
  scenes: Array<{ kind: "card" | "image"; seconds: number; text: string; detail: string | null }>;
  endCard: { headline: string; ctaText: string | null; ctaUrl: string | null } | null;
  postCaption: string | null;
  sources: Array<{ assetId: string; name: string; kind: string; provenance: string; sourceUrl: string | null }>;
  facts: FactRef[];
  /** Present for a product demo video: the transcript, storyboard, claim sources and audio provenance the owner reviews. */
  demo: DemoRecord | null;
  qaChecks: Array<{ id: string; ok: boolean; severity: string; detail: string }>;
  classification: string | null;
};

export type ReviewProduct = {
  productId: string;
  slug: string;
  name: string;
  kind: string;
  representatives: ReviewCreative[];
  all: ReviewCreative[];
  totalCreatives: number;
  video: ReviewVideo | null;
  /** Why there is no video to watch for this product (for example it was rejected and generation is frozen). */
  videoNote: string | null;
  otherVideos: number;
};

const REVIEWABLE = new Set(["ready_for_review", "approved"]);
/** Shown instead of a player for a game that has no genuine gameplay capture. An icon-and-text video is a teaser, never a finished marketing video. */
const TEASER_ONLY_NOTE =
  "TEASER_ONLY: there is no genuine gameplay footage Studio may use (the public page has only icon and store artwork, still screenshots, and the web build is a private tester page). A production video needs a real screen recording of the game, 30 to 60 seconds, touch gameplay in portrait, with the first level and a scored finish. See docs/marketing-studio/CONTROLLED-PRODUCTION.md.";
const SIZE_PREFERENCE = ["square", "portrait", "landscape", "story"];

/**
 * One image per concept (the best size), then the strongest set of DIFFERENT angles first. Pure so it can be tested without a database.
 * Only creatives that passed every automated check and are still in review (or approved) are considered representative.
 */
export function pickRepresentatives(items: ReviewCreative[], limit = REPRESENTATIVE_COUNT): ReviewCreative[] {
  const best = new Map<string, ReviewCreative>();
  for (const c of items) {
    if (!REVIEWABLE.has(c.status) || !c.qa.passed || !c.assetId) continue;
    const cur = best.get(c.conceptId);
    const rank = (x: ReviewCreative) => (SIZE_PREFERENCE.includes(x.sizeKey) ? SIZE_PREFERENCE.indexOf(x.sizeKey) : 99);
    if (!cur || rank(c) < rank(cur) || (rank(c) === rank(cur) && cur.status !== "approved" && c.status === "approved")) best.set(c.conceptId, c);
  }
  const concepts = [...best.values()];
  const picked: ReviewCreative[] = [];
  const seenFamilies = new Set<string>();
  const seenHeadlines = new Set<string>();
  const hk = (c: ReviewCreative) => c.headline.toLowerCase().replace(/[^a-z0-9]+/g, "");
  // Different angles first, and never two representatives with the same headline.
  for (const c of concepts) {
    if (picked.length >= limit) break;
    if (seenFamilies.has(c.family) || seenHeadlines.has(hk(c))) continue;
    seenFamilies.add(c.family);
    seenHeadlines.add(hk(c));
    picked.push(c);
  }
  for (const c of concepts) {
    if (picked.length >= limit) break;
    if (!picked.includes(c) && !seenHeadlines.has(hk(c))) {
      seenHeadlines.add(hk(c));
      picked.push(c);
    }
  }
  return picked;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Facts whose wording matches text that appears on screen. Used only to show provenance for video cards. */
export function matchFacts(texts: string[], facts: FactRef[]): FactRef[] {
  const wanted = texts.map(norm).filter((t) => t.length >= 4);
  return facts.filter((f) => {
    const v = norm(f.value);
    return v.length >= 4 && wanted.some((t) => v.includes(t) || t.includes(v));
  });
}

function toFactRef(f: typeof ms.msProductFacts.$inferSelect): FactRef {
  return { id: f.id, key: f.factKey, value: f.factValue, sourceKind: f.sourceKind, sourceUrl: f.sourceUrl, verified: Boolean(f.verifiedAt) && f.status === "current" };
}

export async function loadReview(scope: OwnerScope, db: StudioDb = requireStudioDb()): Promise<ReviewProduct[]> {
  const all = await listProducts(scope, db);
  const products = PILOT_SLUGS.map((s) => all.find((p) => p.slug === s)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (!products.length) return [];
  const ids = products.map((p) => p.id);
  const [concepts, creatives, videos, facts, campaigns] = await Promise.all([
    db.select().from(ms.msConcepts).where(inArray(ms.msConcepts.productId, ids)),
    db.select().from(ms.msCreatives).where(inArray(ms.msCreatives.productId, ids)),
    db.select().from(ms.msVideos).where(inArray(ms.msVideos.productId, ids)),
    db.select().from(ms.msProductFacts).where(inArray(ms.msProductFacts.productId, ids)),
    db.select().from(ms.msCampaigns).where(inArray(ms.msCampaigns.productId, ids)),
  ]);
  const assetIds = new Set<string>();
  for (const v of videos) for (const s of ((v.storyboard as Storyboard | null)?.scenes ?? [])) if (s.type === "image") assetIds.add(s.assetId);
  const assets = assetIds.size ? await db.select().from(ms.msAssets).where(inArray(ms.msAssets.id, [...assetIds])) : [];
  const campName = new Map(campaigns.map((c) => [c.id, c.name]));

  const out: ReviewProduct[] = [];
  for (const p of products) {
    const pFacts = facts.filter((f) => f.productId === p.id).map(toFactRef);
    const factById = new Map(pFacts.map((f) => [f.id, f]));
    const pConcepts = new Map(concepts.filter((c) => c.productId === p.id && c.status !== "superseded").map((c) => [c.id, c]));
    const items: ReviewCreative[] = [];
    for (const cr of creatives.filter((c) => c.productId === p.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
      const c = pConcepts.get(cr.conceptId);
      if (!c) continue;
      items.push({
        creativeId: cr.id,
        assetId: cr.assetId,
        conceptId: c.id,
        family: c.family,
        campaign: c.campaignId ? campName.get(c.campaignId) ?? null : null,
        headline: c.headline,
        subhead: c.subhead,
        caption: c.caption,
        ctaText: c.ctaText,
        ctaUrl: c.ctaUrl,
        sizeKey: cr.sizeKey,
        width: cr.width,
        height: cr.height,
        aspect: aspectLabel(cr.width, cr.height),
        status: cr.status,
        qa: summarizeQa(cr.qa),
        facts: ((c.factIds as string[]) ?? []).map((id) => factById.get(id)).filter((f): f is FactRef => Boolean(f)),
      });
    }

    // The pilot video: the newest one that passed review checks, else the newest of any state so a failure is visible rather than hidden.
    const pVideos = videos.filter((v) => v.productId === p.id && v.status !== "superseded").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const isDemo = (v: (typeof pVideos)[number]) => (v.storyboard as { kind?: string } | null)?.kind === "demo";
    const chosen = pVideos.find((v) => isDemo(v) && v.status !== "failed") ?? pVideos.find((v) => REVIEWABLE.has(v.status) && summarizeQa(v.qa).passed && v.assetId) ?? pVideos[0];
    let video: ReviewVideo | null = null;
    let videoNote: string | null = null;
    const chosenQaChecks = (((chosen?.qa as { checks?: ReviewVideo["qaChecks"] } | null)?.checks ?? []) as ReviewVideo["qaChecks"]).map((c) => ({ id: c.id, ok: c.ok, severity: c.severity ?? "fail", detail: c.detail ?? "" }));
    const classification = (chosen?.storyboard as { classification?: string } | null)?.classification ?? null;
    if (chosen && !isDemo(chosen) && chosen.status === "rejected") {
      // A slideshow the owner judged not good enough is history, not review material.
      videoNote = `The slideshow video for this product was rejected as not production-ready${classification ? ` (${classification.replaceAll("_", " ")})` : ""}. ${classification === "TEASER_ONLY" ? TEASER_ONLY_NOTE : "A real product demo replaces it; slideshow videos are not produced for production."}`;
    } else if (chosen && isDemo(chosen)) {
      const rec = chosen.storyboard as DemoRecord;
      video = {
        videoId: chosen.id,
        assetId: chosen.assetId,
        title: chosen.title,
        status: chosen.status,
        durationSec: chosen.durationMs ? +(chosen.durationMs / 1000).toFixed(1) : null,
        width: chosen.width,
        height: chosen.height,
        qa: summarizeQa(chosen.qa),
        captions: [],
        scenes: [],
        endCard: rec?.cta ? { headline: rec.endHeadline ?? "", ctaText: rec.cta.text, ctaUrl: rec.cta.url } : null,
        postCaption: null,
        sources: [],
        facts: [],
        demo: rec?.version === 2 ? rec : null,
        qaChecks: chosenQaChecks,
        classification: rec?.classification ?? null,
      };
    } else if (chosen) {
      const sb = (chosen.storyboard as Storyboard | null) ?? { version: 1 as const, scenes: [], transition: "fade" as const };
      const cards = sb.scenes.filter((s): s is CardScene => s.type === "card");
      const end = [...cards].reverse().find((s) => s.family === "cta") ?? null;
      const onScreen = [
        ...cards.flatMap((s) => [s.headline, s.subhead ?? "", s.badge ?? ""]),
        ...sb.scenes.flatMap((s) => (s.type === "image" && s.caption ? [s.caption] : [])),
      ].filter(Boolean);
      const copy = await videoCopyContext(db, p.id, chosen.id).catch(() => undefined);
      video = {
        videoId: chosen.id,
        assetId: chosen.assetId,
        title: chosen.title,
        status: chosen.status,
        durationSec: chosen.durationMs ? +(chosen.durationMs / 1000).toFixed(1) : null,
        width: chosen.width,
        height: chosen.height,
        qa: summarizeQa(chosen.qa),
        captions: [...new Set(sb.scenes.flatMap((s) => (s.type === "image" && s.caption ? [s.caption] : [])))],
        scenes: sb.scenes.map((s) =>
          s.type === "card"
            ? { kind: "card" as const, seconds: s.seconds, text: s.headline, detail: s.subhead ?? s.cta?.text ?? null }
            : { kind: "image" as const, seconds: s.seconds, text: s.caption ?? "(no caption)", detail: assets.find((a) => a.id === s.assetId)?.originalName ?? s.assetId },
        ),
        endCard: end ? { headline: end.headline, ctaText: end.cta?.text ?? null, ctaUrl: end.cta?.url ?? null } : null,
        postCaption: copy?.caption ?? null,
        sources: [...new Set(sb.scenes.flatMap((s) => (s.type === "image" ? [s.assetId] : [])))].map((id) => {
          const a = assets.find((x) => x.id === id);
          return { assetId: id, name: a?.originalName ?? "unknown asset", kind: a?.kind ?? "unknown", provenance: a?.provenance ?? "unknown", sourceUrl: a?.sourceUrl ?? null };
        }),
        facts: matchFacts([...onScreen, end?.cta?.text ?? "", end?.cta?.url ?? ""], pFacts),
        demo: null,
        qaChecks: chosenQaChecks,
        classification,
      };
    }

    out.push({
      productId: p.id,
      slug: p.slug,
      name: p.name,
      kind: p.kind,
      representatives: pickRepresentatives(items),
      all: items,
      totalCreatives: items.length,
      video,
      videoNote,
      otherVideos: Math.max(0, pVideos.length - (chosen ? 1 : 0)),
    });
  }
  return out;
}

/**
 * CREATE -> PUBLISH -> MEASURE -> COMPARE. This computes recommendations from measured evidence only and never publishes anything.
 * Rules that keep it honest:
 *  - only CONFIRMED values are compared; estimated and unknown values are reported separately and never ranked
 *  - a group needs MIN_SAMPLE posts before it can win, and a winner must beat the runner-up by WIN_MARGIN
 *  - results describe what happened alongside each choice; they are correlation, never proof that a choice caused the result
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { ms, requireStudioDb, type StudioDb } from "../db";
import { listProducts } from "../repository";
import type { OwnerScope } from "../scope";
import { confirmedValue, mergeSets, type MetricSet } from "./metrics";

export const MIN_SAMPLE = 3;
export const WIN_MARGIN = 1.25;

export type Observation = {
  publicationId: string;
  productId: string;
  productName: string;
  platform: string;
  hook: string; // creative family, for example educational_tip
  format: string; // for example image or video
  impressions: number | null;
  views: number | null;
  engagement: number | null; // reactions + comments + shares, only when all three are confirmed
  linkClicks: number | null; // confirmed only
  visitsEstimated: number | null;
};

export type Group = { key: string; posts: number; measured: number; medianEngagementRate: number | null; totalReach: number; totalEngagement: number; visitsEstimated: number };
export type Dimension = "hook" | "format" | "platform" | "product";
export type Recommendation = { dimension: Dimension; kind: "winner" | "no_clear_winner" | "insufficient_evidence"; text: string; basis: "CONFIRMED"; groups: Group[] };
export type LearningReport = { generatedAt: string; observations: number; measuredObservations: number; recommendations: Recommendation[]; caveat: string; unknowns: string[] };

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Engagement per view or impression; null whenever either side is not confirmed. */
export const engagementRate = (o: Observation): number | null => {
  const denom = o.impressions ?? o.views;
  if (o.engagement === null || denom === null || denom <= 0) return null;
  return o.engagement / denom;
};

export function groupBy(obs: Observation[], dim: Dimension): Group[] {
  const key = (o: Observation) => (dim === "hook" ? o.hook : dim === "format" ? o.format : dim === "platform" ? o.platform : o.productName);
  const map = new Map<string, Observation[]>();
  for (const o of obs) map.set(key(o), [...(map.get(key(o)) ?? []), o]);
  return [...map.entries()]
    .map(([k, list]) => {
      const rates = list.map(engagementRate).filter((r): r is number => r !== null);
      return {
        key: k,
        posts: list.length,
        measured: rates.length,
        medianEngagementRate: median(rates),
        totalReach: list.reduce((a, o) => a + (o.impressions ?? o.views ?? 0), 0),
        totalEngagement: list.reduce((a, o) => a + (o.engagement ?? 0), 0),
        visitsEstimated: list.reduce((a, o) => a + (o.visitsEstimated ?? 0), 0),
      };
    })
    .sort((a, b) => (b.medianEngagementRate ?? -1) - (a.medianEngagementRate ?? -1));
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

export function recommend(obs: Observation[]): Recommendation[] {
  const out: Recommendation[] = [];
  const label: Record<Dimension, string> = { hook: "hook style", format: "format", platform: "platform", product: "product" };
  for (const dim of ["hook", "format", "platform", "product"] as Dimension[]) {
    const groups = groupBy(obs, dim);
    const eligible = groups.filter((g) => g.measured >= MIN_SAMPLE && g.medianEngagementRate !== null);
    if (groups.length < 2 || eligible.length < 2) {
      const need = groups.filter((g) => g.measured < MIN_SAMPLE).map((g) => `${g.key} (${g.measured}/${MIN_SAMPLE})`);
      out.push({ dimension: dim, kind: "insufficient_evidence", basis: "CONFIRMED", groups, text: `Not enough measured posts to compare ${label[dim]}s yet. Each option needs ${MIN_SAMPLE} measured posts${need.length ? `; so far: ${need.join(", ")}` : ""}.` });
      continue;
    }
    const [first, second] = eligible;
    const ratio = second.medianEngagementRate! > 0 ? first.medianEngagementRate! / second.medianEngagementRate! : Infinity;
    if (ratio >= WIN_MARGIN) {
      out.push({ dimension: dim, kind: "winner", basis: "CONFIRMED", groups, text: `${first.key} had the higher median engagement rate (${pct(first.medianEngagementRate)} against ${pct(second.medianEngagementRate)} for ${second.key}) across ${first.measured} and ${second.measured} measured posts. This is what happened alongside each choice, not proof that the choice caused it.` });
    } else {
      out.push({ dimension: dim, kind: "no_clear_winner", basis: "CONFIRMED", groups, text: `No clear ${label[dim]} winner: ${first.key} (${pct(first.medianEngagementRate)}) and ${second.key} (${pct(second.medianEngagementRate)}) are within ${Math.round((WIN_MARGIN - 1) * 100)}% of each other.` });
    }
  }
  return out;
}

export function buildReport(obs: Observation[], now = new Date()): LearningReport {
  const measured = obs.filter((o) => engagementRate(o) !== null);
  const unknowns: string[] = [];
  if (obs.some((o) => o.linkClicks === null)) unknowns.push("Confirmed link clicks are unavailable for some posts; they are not used to rank anything.");
  if (obs.every((o) => o.visitsEstimated === null)) unknowns.push("Site or app visits are UNKNOWN: no attribution source has reported any yet, so traffic quality is not ranked.");
  else unknowns.push("Site or app visits are ESTIMATED from tagged links and are shown for context only; they never decide a winner.");
  return {
    generatedAt: now.toISOString(),
    observations: obs.length,
    measuredObservations: measured.length,
    recommendations: recommend(obs),
    caveat: "Only confirmed platform numbers are compared. Results show correlation, not causation, and nothing here publishes anything on its own.",
    unknowns,
  };
}

/** Loads one observation per published post, with each post's merged metrics. Read-only. */
export async function loadObservations(scope: OwnerScope, db: StudioDb = requireStudioDb(), productId?: string): Promise<Observation[]> {
  const products = (await listProducts(scope, db)).filter((p) => !productId || p.id === productId);
  if (!products.length) return [];
  const ids = products.map((p) => p.id);
  const names = new Map(products.map((p) => [p.id, p.name]));
  const pubs = await db.select().from(ms.msPublications).where(and(inArray(ms.msPublications.productId, ids), eq(ms.msPublications.status, "published"))).orderBy(desc(ms.msPublications.publishedAt));
  if (!pubs.length) return [];
  const [snaps, concepts, assets] = await Promise.all([
    db.select().from(ms.msPublicationMetrics).where(inArray(ms.msPublicationMetrics.publicationId, pubs.map((p) => p.id))).orderBy(ms.msPublicationMetrics.collectedAt),
    db.select({ id: ms.msConcepts.id, family: ms.msConcepts.family }).from(ms.msConcepts).where(inArray(ms.msConcepts.productId, ids)),
    db.select({ id: ms.msAssets.id, mimeType: ms.msAssets.mimeType }).from(ms.msAssets).where(inArray(ms.msAssets.productId, ids)),
  ]);
  const fam = new Map(concepts.map((c) => [c.id, c.family]));
  const mime = new Map(assets.map((a) => [a.id, a.mimeType]));
  const byPub = new Map<string, MetricSet[]>();
  for (const s of snaps) byPub.set(s.publicationId, [...(byPub.get(s.publicationId) ?? []), s.metrics as MetricSet]);
  return pubs.map((p) => {
    const m = mergeSets(byPub.get(p.id) ?? []);
    const reactions = confirmedValue(m, "reactions");
    const comments = confirmedValue(m, "comments");
    const shares = confirmedValue(m, "shares");
    const visits = m.site_visits.status === "estimated" ? m.site_visits.value : null;
    return {
      publicationId: p.id,
      productId: p.productId,
      productName: names.get(p.productId) ?? "unknown",
      platform: p.platform,
      hook: (p.conceptId && fam.get(p.conceptId)) || "unknown",
      format: mime.get(p.assetId) === "video/mp4" ? "video" : "image",
      impressions: confirmedValue(m, "impressions"),
      views: confirmedValue(m, "views"),
      engagement: reactions !== null && comments !== null && shares !== null ? reactions + comments + shares : null,
      linkClicks: confirmedValue(m, "link_clicks"),
      visitsEstimated: visits,
    };
  });
}

export async function learningReport(scope: OwnerScope, db: StudioDb = requireStudioDb(), productId?: string): Promise<LearningReport> {
  return buildReport(await loadObservations(scope, db, productId));
}

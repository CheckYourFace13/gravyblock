/**
 * Deterministic concept and copy generation from VERIFIED Product Truth. No model, no network, no cost. Every string is either
 * a fact value, a segment of one (title or detail, first sentence), or a fixed neutral phrase from templates.ts. Nothing is
 * invented, so there is nothing to hallucinate; the QA step proves it again on the rendered creative.
 */
import { and, eq } from "drizzle-orm";
import { audit } from "../audit";
import { ms, requireStudioDb, type StudioDb } from "../db";
import { listAssets, listFacts, requireProduct } from "../repository";
import type { OwnerScope } from "../scope";
import type { TemplateFamily } from "./templates";

type Fact = typeof ms.msProductFacts.$inferSelect;

export type ConceptSpec = {
  family: TemplateFamily;
  headline: string;
  subhead: string | null;
  caption: string;
  shortDescription: string | null;
  ctaText: string | null;
  ctaUrl: string | null;
  variants: { headlines: string[]; captions: string[]; ctas: string[] };
  payload: Record<string, unknown>;
  factIds: string[];
};

export function splitTitleDetail(value: string): [string, string | null] {
  const m = /^([\s\S]{2,48}?):\s+([\s\S]+)$/.exec(value.trim());
  return m ? [m[1].trim(), m[2].trim()] : [value.trim(), null];
}

export function firstSentence(value: string): string {
  const m = /^([\s\S]+?[.!?])(\s|$)/.exec(value.trim());
  return (m ? m[1] : value).trim();
}

/** A short description at a sentence boundary, never cut mid-sentence and never with an ellipsis. */
export function shortDescription(value: string, max = 160): string {
  const t = value.trim();
  if (t.length <= max) return t;
  const sentences = t.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [t];
  let out = "";
  for (const s of sentences) {
    if ((out + s).trim().length > max) break;
    out += s;
  }
  return (out || sentences[0]).trim();
}

/** Facts of one kind in the order they were entered, which is the order of the page they came from (listFacts returns newest first). */
const val = (facts: Fact[], key: string) => facts.filter((f) => f.factKey === key).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

export type ShotRef = { id: string; name: string };

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
/** Five-letter stems of the words in a text, so "properties" and "property" count as the same word. */
const stems = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 5)));

const shotScore = (text: string, shot: ShotRef, ignore: Set<string>) => {
  const have = stems(shot.name.replace(/\.[a-z]+$/i, ""));
  let score = 0;
  for (const w of stems(text)) if (have.has(w) && !ignore.has(w)) score++;
  return score;
};

/** The unused approved screenshot that genuinely matches a concept by shared words, or null. A picture that does not match is never attached. */
function matchingShot(text: string, shots: ShotRef[], used: Set<string>, ignore: Set<string>): string | null {
  let best: { id: string; score: number } | null = null;
  for (const s of shots) {
    if (used.has(s.id)) continue;
    const score = shotScore(text, s, ignore);
    if (score > 0 && (!best || score > best.score)) best = { id: s.id, score };
  }
  if (best) used.add(best.id);
  return best?.id ?? null;
}

const PRIORITY: TemplateFamily[] = ["product_benefit", "announcement", "comparison", "educational_tip", "screenshot_showcase", "feature_highlight", "cta"];

/**
 * Builds the concept specs for a product from its verified facts. Pure and testable.
 * Every concept uses a DIFFERENT verified fact for its headline and a different composition (text-led, announcement, steps, comparison,
 * screenshot-led, feature, centered call to action), so a set of four is four angles, not one message in four templates.
 */
export function buildConceptSpecs(facts: Fact[], opts: { hasScreenshot: boolean; screenshots?: ShotRef[]; limit?: number }): ConceptSpec[] {
  const verified = facts.filter((f) => f.status === "current" && f.verifiedAt);
  const one = (k: string) => val(verified, k)[0];
  const name = one("product_name");
  if (!name) return [];
  const desc = one("description");
  const tagline = one("tagline");
  const cta = one("cta");
  const ctaUrl = one("cta_url") ?? one("website_url") ?? one("store_url");
  // Cheapest plan first, so a "start free" message shows the free plan.
  const price = (f: Fact) => Number(/\$(\d+(?:\.\d+)?)/.exec(f.factValue)?.[1] ?? Infinity);
  const plans = val(verified, "plan").sort((a, b) => price(a) - price(b));
  const note = one("pricing_note");
  const status = one("release_status");
  const tipTitle = one("tip_title");
  const tipSteps = val(verified, "tip_step");
  const howPlays = val(verified, "how_it_plays");
  // The product's own name appears in every file name and many features, so it says nothing about which picture fits.
  const nameStems = stems(name.factValue);
  const shots = opts.hasScreenshot ? opts.screenshots ?? [{ id: "", name: "" }] : [];

  const ctaLine = cta && ctaUrl ? ` ${cta.factValue}: ${ctaUrl.factValue}` : "";
  const base = {
    shortDescription: desc ? shortDescription(desc.factValue) : null,
    ctaText: cta?.factValue ?? null,
    ctaUrl: ctaUrl?.factValue ?? null,
  };
  const ids = (...fs: Array<Fact | undefined>) => fs.filter((f): f is Fact => Boolean(f)).map((f) => f.id);
  const ctaIds = ids(cta, ctaUrl);
  const ctas = [cta?.factValue, "Learn more"].filter((x): x is string => Boolean(x));
  const lead = tagline ?? desc;
  const leadKey = lead ? key(tagline ? tagline.factValue : firstSentence(desc!.factValue)) : "";

  // A feature that merely restates the product headline is not a different angle.
  const feats = val(verified, "feature")
    .map((f) => {
      const [title, detail] = splitTitleDetail(f.factValue);
      return { f, title, detail };
    })
    .filter((x) => !leadKey || !key(x.f.factValue).includes(leadKey));
  // The screenshot showcase is led by the feature that best matches one of the approved screenshots (a pricing page for the plans, the recipes
  // page for the recipes). If none matches, it falls back to the first feature on the home-page screenshot.
  let showcaseFeat: (typeof feats)[number] | undefined;
  let showcaseShot: string | null = null;
  if (shots.length > 0 && shots[0].id) {
    let best = { score: 0, feat: undefined as (typeof feats)[number] | undefined, shot: "" };
    for (const x of feats) for (const sh of shots) {
      const sc = shotScore(`${x.title} ${x.detail ?? ""}`, sh, nameStems);
      if (sc > best.score) best = { score: sc, feat: x, shot: sh.id };
    }
    showcaseFeat = best.feat ?? feats[0];
    showcaseShot = best.feat ? best.shot : (shots.find((x) => /home/i.test(x.name)) ?? shots[0]).id;
  } else if (shots.length > 0) showcaseFeat = feats[0];
  const rest = feats.filter((x) => x !== showcaseFeat);
  const highlightFeats = rest.slice(0, 2);
  const ctaFeat = rest[2];

  const out: ConceptSpec[] = [];
  const featureCopy = (x: { f: Fact; title: string; detail: string | null }) => `${x.title}${x.detail ? `: ${x.detail}` : ""}`;

  // product benefit: the product's own headline and description
  if (lead) {
    const headline = tagline ? tagline.factValue : firstSentence(desc!.factValue);
    const sub = tagline ? desc?.factValue ?? null : desc!.factValue.trim() !== headline ? desc!.factValue : null;
    out.push({
      family: "product_benefit",
      headline,
      subhead: sub ? shortDescription(sub, 190) : null,
      caption: `${headline}${sub ? ` ${shortDescription(sub, 190)}` : ""}${ctaLine}`,
      ...base,
      variants: {
        headlines: [headline, ...(desc && tagline ? [firstSentence(desc.factValue)] : [])],
        captions: [`${headline}${ctaLine}`, ...(desc ? [`${shortDescription(desc.factValue)}${ctaLine}`] : [])],
        ctas,
      },
      payload: {},
      factIds: ids(name, tagline, desc).concat(ctaIds),
    });
  }

  // announcement: only when a release status is a verified fact. Its supporting line is the first sentence of the description, not the tagline again.
  if (status && (tagline || desc)) {
    // The platform line is what makes the teaser specific (where it is coming); it also keeps the supporting line from repeating the product benefit.
    const platform = one("platform");
    const sub = platform ? platform.factValue : desc ? firstSentence(desc.factValue) : tagline!.factValue;
    out.push({
      family: "announcement",
      headline: `Meet ${name.factValue}`,
      subhead: sub,
      caption: `${status.factValue}: ${name.factValue}. ${sub}${ctaLine}`,
      ...base,
      variants: { headlines: [`Meet ${name.factValue}`], captions: [`${name.factValue}: ${status.factValue}.${ctaLine}`], ctas },
      payload: { badge: status.factValue },
      factIds: ids(name, status, platform ?? desc ?? tagline).concat(ctaIds),
    });
  }

  // comparison: only from two stated plans and a stated pricing note
  if (plans.length >= 2 && note) {
    const cols = plans.slice(0, 2).map((p) => {
      const [label, text] = splitTitleDetail(p.factValue);
      return { label, text: text ?? p.factValue, factId: p.id };
    });
    out.push({
      family: "comparison",
      headline: note.factValue,
      subhead: null,
      caption: `${note.factValue} ${cols.map((c) => `${c.label}: ${c.text}.`).join(" ")}${ctaLine}`,
      ...base,
      variants: { headlines: [note.factValue], captions: [`${cols.map((c) => `${c.label}: ${c.text}`).join(". ")}.${ctaLine}`], ctas },
      payload: { columns: cols },
      factIds: ids(name, note, ...plans.slice(0, 2)).concat(ctaIds),
    });
  }

  // educational: stated tip facts, or the verified "how it plays" steps. The headline is a fixed neutral phrase; the steps are the facts.
  if (tipTitle && tipSteps.length >= 2) {
    out.push({
      family: "educational_tip",
      headline: tipTitle.factValue,
      subhead: null,
      caption: `${tipTitle.factValue}: ${tipSteps.slice(0, 3).map((x) => x.factValue).join(", ")}.${ctaLine}`,
      ...base,
      variants: { headlines: [tipTitle.factValue], captions: [`${tipTitle.factValue}${ctaLine}`], ctas },
      payload: { steps: tipSteps.slice(0, 3).map((x) => ({ text: x.factValue, factId: x.id })) },
      factIds: ids(name, tipTitle, ...tipSteps.slice(0, 3)).concat(ctaIds),
    });
  } else if (howPlays.length >= 2) {
    const steps = howPlays.slice(0, 3);
    const headline = `How ${name.factValue} plays`;
    out.push({
      family: "educational_tip",
      headline,
      subhead: null,
      caption: `${headline}: ${steps.map((x) => x.factValue).join(" ")}${ctaLine}`,
      ...base,
      variants: { headlines: [headline], captions: [`${headline}${ctaLine}`], ctas },
      payload: { steps: steps.map((x) => ({ text: x.factValue, factId: x.id })) },
      factIds: ids(name, ...steps).concat(ctaIds),
    });
  }

  // screenshot showcase: only when an approved screenshot exists, led by a feature of its own
  if (shots.length > 0 && lead) {
    const x = showcaseFeat;
    const headline = x ? x.title : tagline ? tagline.factValue : firstSentence(desc!.factValue);
    out.push({
      family: "screenshot_showcase",
      headline,
      subhead: x ? x.detail : desc && tagline ? shortDescription(desc.factValue, 190) : null,
      caption: `${x ? featureCopy(x) : headline}${ctaLine}`,
      ...base,
      variants: { headlines: [headline], captions: [`${x ? featureCopy(x) : headline}${ctaLine}`], ctas },
      payload: { useScreenshot: true, ...(showcaseShot ? { shotAssetId: showcaseShot } : {}) },
      factIds: (x ? ids(name, x.f) : ids(name, tagline, desc)).concat(ctaIds),
    });
  }

  // feature highlights
  for (const x of highlightFeats) {
    out.push({
      family: "feature_highlight",
      headline: x.title,
      subhead: x.detail,
      caption: `${featureCopy(x)}${ctaLine}`,
      ...base,
      variants: { headlines: [x.title], captions: [`${x.f.factValue}${ctaLine}`, `${name.factValue}: ${x.f.factValue}`], ctas },
      payload: { body: x.detail },
      factIds: ids(name, x.f).concat(ctaIds),
    });
  }

  // call to action: a centered card led by its own feature or by the pricing note
  if (cta && ctaUrl && (ctaFeat || note || tagline)) {
    const headline = ctaFeat ? ctaFeat.title : note ? note.factValue : tagline!.factValue;
    out.push({
      family: "cta",
      headline,
      subhead: ctaFeat ? ctaFeat.detail : null,
      caption: `${ctaFeat ? featureCopy(ctaFeat) : headline}${ctaLine}`,
      ...base,
      variants: { headlines: [headline], captions: [`${headline}${ctaLine}`], ctas },
      payload: {},
      factIds: (ctaFeat ? ids(name, ctaFeat.f) : ids(name, note ?? tagline)).concat(ctaIds),
    });
  }

  // A product never repeats a headline.
  const seen = new Set<string>();
  const unique = out.filter((c) => {
    const k = key(c.headline);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Pick for variety: one concept per family in priority order first, then fill from what is left.
  const limit = opts.limit ?? 4;
  const chosen: ConceptSpec[] = [];
  for (const fam of PRIORITY) {
    const c = unique.find((x) => x.family === fam && !chosen.includes(x));
    if (c && chosen.length < limit) chosen.push(c);
  }
  for (const c of unique) if (chosen.length < limit && !chosen.includes(c)) chosen.push(c);

  // A feature highlight shows a screenshot only when one genuinely matches it and no other concept already uses it; otherwise it stays text-led.
  const used = new Set<string>(chosen.map((c) => (c.payload as { shotAssetId?: string }).shotAssetId).filter((x): x is string => Boolean(x)));
  for (const c of chosen) {
    if (c.family !== "feature_highlight") continue;
    const id = shots.length > 0 && shots[0].id ? matchingShot(`${c.headline} ${c.subhead ?? ""}`, shots, used, nameStems) : null;
    c.payload = id ? { ...c.payload, shotAssetId: id } : { ...c.payload, noShot: true };
  }
  return chosen.map((c) => ({ ...c, factIds: [...new Set(c.factIds)] }));
}

export async function generateConcepts(
  scope: OwnerScope,
  actor: string,
  productId: string,
  opts: { campaignId?: string | null; limit?: number } = {},
  db: StudioDb = requireStudioDb(),
) {
  await requireProduct(scope, productId, db);
  const facts = await listFacts(scope, productId, db);
  const assets = await listAssets(scope, productId, db);
  const screenshots = assets.filter((a) => a.kind === "screenshot" && a.approved === "true").map((a) => ({ id: a.id, name: a.originalName ?? "" }));
  const specs = buildConceptSpecs(facts, { hasScreenshot: screenshots.length > 0, screenshots, limit: opts.limit });
  if (specs.length === 0) throw new Error("Product Truth is not ready: verify at least a product name and either a tagline or a description");
  const existing = await db.select().from(ms.msConcepts).where(eq(ms.msConcepts.productId, productId));
  const have = new Set(existing.filter((c) => c.status !== "superseded").map((c) => `${c.family}|${c.headline}`));
  const created: Array<typeof ms.msConcepts.$inferSelect> = [];
  for (const s of specs) {
    if (have.has(`${s.family}|${s.headline}`)) continue;
    const [row] = await db
      .insert(ms.msConcepts)
      .values({
        productId,
        campaignId: opts.campaignId ?? null,
        family: s.family,
        headline: s.headline,
        subhead: s.subhead,
        caption: s.caption,
        shortDescription: s.shortDescription,
        ctaText: s.ctaText,
        ctaUrl: s.ctaUrl,
        variants: s.variants,
        payload: s.payload,
        factIds: s.factIds,
        createdBy: actor,
      })
      .returning();
    created.push(row);
  }
  await audit(db, { actor, action: "concepts.generate", entity: "product", entityId: productId, productId, detail: { created: created.length, families: created.map((c) => c.family) } });
  return created;
}

export async function listConcepts(scope: OwnerScope, productId: string, db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  return db.select().from(ms.msConcepts).where(eq(ms.msConcepts.productId, productId)).orderBy(ms.msConcepts.createdAt);
}

export async function listCreatives(scope: OwnerScope, productId: string, db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  return db.select().from(ms.msCreatives).where(eq(ms.msCreatives.productId, productId)).orderBy(ms.msCreatives.createdAt);
}

export async function reviewCreative(scope: OwnerScope, actor: string, productId: string, creativeId: string, decision: "approved" | "rejected" | "regenerate_later", db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  const [c] = await db.select().from(ms.msCreatives).where(and(eq(ms.msCreatives.id, creativeId), eq(ms.msCreatives.productId, productId))).limit(1);
  if (!c) throw new Error("not found");
  // A creative that did not pass QA can never be approved.
  // A decision can be changed later (reject then approve) only while the automated checks still pass. Regenerating is only recorded, never started.
  const qaClean = Boolean((c.qa as { passed?: boolean } | null)?.passed);
  if (decision === "approved" && !(c.status === "ready_for_review" || (qaClean && ["rejected", "regenerate_later", "approved"].includes(c.status)))) throw new Error("Only creatives that passed QA can be approved");
  await db.update(ms.msCreatives).set({ status: decision, reviewedBy: actor, reviewedAt: new Date() }).where(eq(ms.msCreatives.id, creativeId));
  await audit(db, { actor, action: `creative.${decision}`, entity: "creative", entityId: creativeId, productId });
}

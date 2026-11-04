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

const val = (facts: Fact[], key: string) => facts.filter((f) => f.factKey === key);

/** Builds the concept specs for a product from its verified facts. Pure and testable. */
export function buildConceptSpecs(facts: Fact[], opts: { hasScreenshot: boolean; limit?: number }): ConceptSpec[] {
  const verified = facts.filter((f) => f.status === "current" && f.verifiedAt);
  const one = (k: string) => val(verified, k)[0];
  const name = one("product_name");
  if (!name) return [];
  const desc = one("description");
  const tagline = one("tagline");
  const cta = one("cta");
  const ctaUrl = one("cta_url") ?? one("website_url") ?? one("store_url");
  const features = val(verified, "feature");
  const plans = val(verified, "plan");
  const note = one("pricing_note");
  const status = one("release_status");
  const tipTitle = one("tip_title");
  const tipSteps = val(verified, "tip_step");

  const ctaLine = cta && ctaUrl ? ` ${cta.factValue}: ${ctaUrl.factValue}` : "";
  const base = {
    shortDescription: desc ? shortDescription(desc.factValue) : null,
    ctaText: cta?.factValue ?? null,
    ctaUrl: ctaUrl?.factValue ?? null,
  };
  const ids = (...fs: Array<Fact | undefined>) => fs.filter((f): f is Fact => Boolean(f)).map((f) => f.id);
  const ctaIds = ids(cta, ctaUrl);
  const ctas = [cta?.factValue, "Learn more"].filter((x): x is string => Boolean(x));
  const out: ConceptSpec[] = [];

  // 1. product benefit
  const lead = tagline ?? desc;
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
      factIds: ids(name, tagline, desc, ...(sub ? [] : [])).concat(ctaIds),
    });
  }

  // 2. feature highlights (up to two)
  for (const f of features.slice(0, 2)) {
    const [title, detail] = splitTitleDetail(f.factValue);
    out.push({
      family: "feature_highlight",
      headline: title,
      subhead: detail,
      caption: `${title}${detail ? `: ${detail}` : ""}${ctaLine}`,
      ...base,
      variants: { headlines: [title], captions: [`${f.factValue}${ctaLine}`, `${name.factValue}: ${f.factValue}`], ctas },
      payload: { body: detail },
      factIds: ids(name, f).concat(ctaIds),
    });
  }

  // 3. screenshot showcase, only when an approved screenshot exists
  if (opts.hasScreenshot && lead) {
    const headline = tagline ? tagline.factValue : firstSentence(desc!.factValue);
    out.push({
      family: "screenshot_showcase",
      headline,
      subhead: desc && tagline ? shortDescription(desc.factValue, 190) : null,
      caption: `${headline}${ctaLine}`,
      ...base,
      variants: { headlines: [headline], captions: [`${headline}${ctaLine}`], ctas },
      payload: { useScreenshot: true },
      factIds: ids(name, tagline, desc).concat(ctaIds),
    });
  }

  // 4. announcement, only when a release status is a verified fact
  if (status && (tagline || desc)) {
    const sub = tagline ? tagline.factValue : firstSentence(desc!.factValue);
    out.push({
      family: "announcement",
      headline: `Meet ${name.factValue}`,
      subhead: sub,
      caption: `${status.factValue}: ${name.factValue}. ${sub}${ctaLine}`,
      ...base,
      variants: { headlines: [`Meet ${name.factValue}`], captions: [`${name.factValue}: ${status.factValue}.${ctaLine}`], ctas },
      payload: { badge: status.factValue },
      factIds: ids(name, status, tagline, desc).concat(ctaIds),
    });
  }

  // 5. comparison, only from two stated plans and a stated pricing note
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

  // 6. educational tip, only from stated tip facts
  if (tipTitle && tipSteps.length >= 2) {
    out.push({
      family: "educational_tip",
      headline: tipTitle.factValue,
      subhead: null,
      caption: `${tipTitle.factValue}: ${tipSteps.slice(0, 3).map((s) => s.factValue).join(", ")}.${ctaLine}`,
      ...base,
      variants: { headlines: [tipTitle.factValue], captions: [`${tipTitle.factValue}${ctaLine}`], ctas },
      payload: { steps: tipSteps.slice(0, 3).map((s) => ({ text: s.factValue, factId: s.id })) },
      factIds: ids(name, tipTitle, ...tipSteps.slice(0, 3)).concat(ctaIds),
    });
  }

  // 7. call to action
  if (cta && ctaUrl && (note || tagline)) {
    const headline = note ? note.factValue : tagline!.factValue;
    out.push({
      family: "cta",
      headline,
      subhead: null,
      caption: `${headline}${ctaLine}`,
      ...base,
      variants: { headlines: [headline], captions: [`${headline}${ctaLine}`], ctas },
      payload: {},
      factIds: ids(name, note ?? tagline).concat(ctaIds),
    });
  }

  // Keep the set varied: at most one concept per family and headline, in the order above.
  const seen = new Set<string>();
  const unique = out.filter((c) => {
    const k = `${c.family}|${c.headline}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unique.slice(0, opts.limit ?? 4).map((c) => ({ ...c, factIds: [...new Set(c.factIds)] }));
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
  const specs = buildConceptSpecs(facts, { hasScreenshot: assets.some((a) => a.kind === "screenshot" && a.approved === "true"), limit: opts.limit });
  if (specs.length === 0) throw new Error("Product Truth is not ready: verify at least a product name and either a tagline or a description");
  const existing = await db.select().from(ms.msConcepts).where(eq(ms.msConcepts.productId, productId));
  const have = new Set(existing.map((c) => `${c.family}|${c.headline}`));
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

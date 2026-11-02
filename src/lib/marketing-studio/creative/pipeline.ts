/**
 * Concept to rendered, QA-checked creatives. Runs inside the studio worker as a HEAVY job (one at a time). It reads only the
 * product's approved assets and verified facts, renders in a network-blocked Chromium, runs the automated QA, stores the PNG
 * through the same validated storage path as uploads, and records the verdict. Nothing is published.
 */
import { and, eq, ne } from "drizzle-orm";
import { audit } from "../audit";
import { ms, requireStudioDb, type StudioDb } from "../db";
import { probeUrl } from "../remote-import";
import { INTERNAL_SCOPE, type OwnerScope } from "../scope";
import { storeImageAsset } from "../uploads";
import { loadProductContext, sourceFor, toImg } from "./context";
import { runCreativeQa } from "./qa";
import { launchBrowser, renderCreative } from "./render";
import { buildCreative, TEMPLATE_VERSION, type CreativeInput, type TextSrc } from "./templates";
import { SIZE_KEYS, SIZES, type SizeKey } from "./theme";

export { sourceFor };

export type RenderSummary = { conceptId: string; results: Array<{ size: SizeKey; status: string; failed: string[] }> };

export async function renderConcept(conceptId: string, sizes: SizeKey[] = SIZE_KEYS, scope: OwnerScope = INTERNAL_SCOPE, db: StudioDb = requireStudioDb()): Promise<RenderSummary> {
  const [concept] = await db.select().from(ms.msConcepts).where(eq(ms.msConcepts.id, conceptId)).limit(1);
  if (!concept) throw new Error("concept not found");
  const ctx = await loadProductContext(scope, concept.productId, db);
  const { product, productName, theme, facts, prohibited, logoAsset, logo, ctaFactValues, allowedUrlHosts, qaFacts } = ctx;
  const shotAsset = ctx.screenshotAssets[0];
  const shot = shotAsset ? await toImg(shotAsset, 1600, 1600, `${productName} screenshot`) : null;

  const preferred = (concept.factIds as string[]) ?? [];
  const src = (text: string) => sourceFor(text, productName, facts, preferred);
  const payload = (concept.payload ?? {}) as { body?: string | null; badge?: string; columns?: Array<{ label: string; text: string; factId: string }>; steps?: Array<{ text: string; factId: string }>; useScreenshot?: boolean };
  const family = concept.family as CreativeInput["family"];

  const ctaUrl = concept.ctaUrl;
  const urlStatus = ctaUrl ? await probeUrl(ctaUrl) : null;
  const othersRaw = await db.select({ conceptId: ms.msCreatives.conceptId, dhash: ms.msCreatives.dhash, qa: ms.msCreatives.qa }).from(ms.msCreatives).where(and(eq(ms.msCreatives.productId, product.id), ne(ms.msCreatives.conceptId, concept.id)));
  const others = othersRaw.map((o) => ({ conceptId: o.conceptId, dhash: o.dhash, textSig: (o.qa as { textSig?: string } | null)?.textSig ?? null }));

  const handle = await launchBrowser();
  const results: RenderSummary["results"] = [];
  try {
    for (const size of sizes) {
      const needsShot = family === "screenshot_showcase";
      const useShot = shot && (needsShot || (family === "feature_highlight" && product.kind !== "mobile_game" && product.kind !== "web_game") || payload.useScreenshot);
      const input: CreativeInput = {
        family,
        size,
        theme,
        productName,
        headline: { text: concept.headline, src: src(concept.headline) },
        subhead: concept.subhead && family !== "feature_highlight" ? { text: concept.subhead, src: src(concept.subhead) } : null,
        body: family === "feature_highlight" && concept.subhead ? { text: concept.subhead, src: src(concept.subhead) } : null,
        badge: payload.badge ? { text: payload.badge, src: src(payload.badge) } : null,
        cta: concept.ctaText && ctaUrl ? { text: concept.ctaText, url: ctaUrl } : null,
        steps: payload.steps?.map((s) => ({ text: s.text, src: { kind: "fact", factId: s.factId } as TextSrc })),
        columns: payload.columns?.map((c) => ({ label: { text: c.label, src: { kind: "fact", factId: c.factId } as TextSrc }, text: { text: c.text, src: { kind: "fact", factId: c.factId } as TextSrc } })),
        logo,
        screenshot: useShot ? shot : null,
      };
      const built = buildCreative(input);
      const { png, measure } = await renderCreative(handle.browser, built, size);
      const dims = SIZES[size];
      const required: Array<{ id: string; approved: boolean; present: boolean }> = [];
      if (needsShot) required.push({ id: "screenshot", approved: Boolean(shotAsset), present: Boolean(shot) });
      if (logoAsset) required.push({ id: logoAsset.id, approved: logoAsset.approved === "true", present: Boolean(logo) });
      const qa = await runCreativeQa({
        png,
        width: dims.w,
        height: dims.h,
        measure,
        built,
        theme,
        productName,
        facts: qaFacts,
        prohibited,
        ctaFactValues,
        ctaUrl,
        allowedUrlHosts,
        urlStatus,
        requiredAssets: required,
        conceptId: concept.id,
        otherHashes: others.flatMap((o) => (o.dhash ? [{ conceptId: o.conceptId, dhash: o.dhash, textSig: o.textSig }] : [])),
      });
      const stored = await storeImageAsset(scope, "studio-worker", product.id, { bytes: png, originalName: `${family}-${size}.png`, kind: "render_image", provenance: "rendered" }, db);
      const status = qa.passed ? "ready_for_review" : "qa_failed";
      await db
        .insert(ms.msCreatives)
        .values({ productId: product.id, conceptId: concept.id, assetId: stored.id, sizeKey: size, width: dims.w, height: dims.h, templateFamily: family, templateVersion: TEMPLATE_VERSION, status, qa: { passed: qa.passed, checks: qa.checks, textSig: qa.textSig }, dhash: qa.dhash })
        .onConflictDoUpdate({
          target: [ms.msCreatives.conceptId, ms.msCreatives.sizeKey],
          set: { assetId: stored.id, status, qa: { passed: qa.passed, checks: qa.checks, textSig: qa.textSig }, dhash: qa.dhash, templateVersion: TEMPLATE_VERSION, error: null, reviewedBy: null, reviewedAt: null },
        });
      results.push({ size, status, failed: qa.checks.filter((c) => !c.ok && c.severity === "fail").map((c) => `${c.id}: ${c.detail}`) });
    }
  } finally {
    await handle.close();
  }
  const ready = results.some((r) => r.status === "ready_for_review");
  await db.update(ms.msConcepts).set({ status: ready ? "ready_for_review" : "draft" }).where(eq(ms.msConcepts.id, concept.id));
  await audit(db, { actor: "studio-worker", action: "creatives.render", entity: "concept", entityId: concept.id, productId: product.id, detail: { results: results.map((r) => `${r.size}:${r.status}`) } });
  return { conceptId: concept.id, results };
}

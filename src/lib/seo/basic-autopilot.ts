/**
 * Existing-page SEO — BASIC AUTOPILOT. Works from the public site and Business
 * Truth only (no Search Console): audit -> pick the most valuable applicable defect
 * class -> apply through the site's connector -> verify externally -> measure -> proof.
 *
 * Only defect classes that are clearly beneficial AND safely reversible are applied
 * (missing meta description/title, missing structured data, missing social preview
 * image). Style-level nitpicks (e.g. a well-written 70-character title) are reported
 * but never edited. Every override is reversible (a later `site_override` row wins).
 * A result counts only after the LIVE page shows it; proof is written only then.
 */

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { businesses, getDb, jobs } from "@/lib/db";
import { safeFetchText } from "@/lib/net/safe-fetch";
import { recordProof } from "@/lib/proof/ledger";
import { getSiteTarget } from "@/lib/site-publish/adapters";
import { collectPages, findDefects, snapshotPage, type Defect, type DefectType, type PageSnapshot } from "./basic-audit";
import { recordOpportunity, nextOpportunities, resolveOpportunityByDedupeKey, markActed } from "@/lib/opportunities/queue";
import { classifyValue } from "@/lib/opportunities/classify";
import { buildMeasurementPlan } from "@/lib/opportunities/measurement";
import { getCapabilityProfile } from "@/lib/capability-profile";
import { pagePerformance } from "@/lib/db";
import type { OpportunityType } from "@/lib/opportunities/types";

/** Structural/conversion-risk defects carry real downside regardless of search data. */
const STRUCTURAL: DefectType[] = ["noindex", "no_canonical", "no_h1", "no_conversion_path"];

const APPLICABLE: DefectType[] = ["no_social_image", "description_missing", "title_missing", "no_structured_data"];

/** Every defect class maps to a generic opportunity type — nothing here is specific to any one business. */
const OPPORTUNITY_TYPE: Record<DefectType, OpportunityType> = {
  title_missing: "existing_page_seo",
  title_too_long: "existing_page_seo",
  title_too_short: "existing_page_seo",
  description_missing: "existing_page_seo",
  description_too_short: "existing_page_seo",
  description_too_long: "existing_page_seo",
  no_structured_data: "schema",
  no_social_image: "ctr",
  no_h1: "existing_page_seo",
  multiple_h1: "existing_page_seo",
  no_canonical: "technical",
  noindex: "technical",
  duplicate_title: "existing_page_seo",
  thin_internal_links: "internal_link",
  no_conversion_path: "conversion",
};

/**
 * Record every defect found (not just the one class GravyBlock is about to act on) into the
 * universal queue, classified as HYGIENE or GROWTH so mechanical lint (a title a few characters
 * long) never outranks a page with real search demand. Growth evidence, when available, comes
 * from the business's own Search Console data (pagePerformance) — never invented.
 */
async function recordDefectsAsOpportunities(businessId: string, defects: Defect[]): Promise<void> {
  const db = getDb();
  const demandByPath = new Map<string, { impressions: number; position: number }>();
  if (db) {
    const rows = await db.select({ pageUrl: pagePerformance.pageUrl, impressions: pagePerformance.impressions, position: pagePerformance.position }).from(pagePerformance).where(eq(pagePerformance.businessId, businessId));
    for (const r of rows) {
      try {
        const path = new URL(r.pageUrl).pathname || "/";
        const cur = demandByPath.get(path) ?? { impressions: 0, position: 0 };
        demandByPath.set(path, { impressions: cur.impressions + r.impressions, position: cur.position || r.position });
      } catch {
        /* skip */
      }
    }
  }
  for (const d of defects) {
    const demand = demandByPath.get(d.path);
    const valueClass = classifyValue({
      isStructuralOrConversion: STRUCTURAL.includes(d.type),
      hasSearchDemandEvidence: Boolean(demand && demand.impressions >= 20),
      isWeakPositionWithDemand: Boolean(demand && demand.impressions >= 20 && demand.position >= 4 && demand.position <= 20),
    });
    await recordOpportunity({
      businessId,
      opportunityType: OPPORTUNITY_TYPE[d.type],
      subtype: d.type,
      engine: "existing_page_seo_basic",
      valueClass,
      evidence: { defectType: d.type, path: d.path, url: d.url, detail: d.detail, demand: demand ?? null },
      expectedImpact: Math.min(100, d.score),
      confidence: d.fix ? 75 : 55,
      cost: 1,
      risk: d.fix ? 1 : 3,
      requiredCapability: "website_write",
      autoEligible: Boolean(d.fix && APPLICABLE.includes(d.type)),
      ttlDays: 45,
      dedupeKey: `seo_basic_defect:${businessId}:${d.type}:${d.path}`,
    }).catch(() => undefined);
  }
}
const COOLDOWN_DAYS = 28;
const MAX_PAGES_PER_ACTION = 25;
const ACTION_JOB = "seo_basic_action";

type Db = NonNullable<ReturnType<typeof getDb>>;

const METRIC: Record<string, { name: string; test: (p: PageSnapshot) => boolean; summary: string }> = {
  no_social_image: { name: "audited pages with a social preview image", test: (p) => Boolean(p.ogImage), summary: "added a social preview image (og:image) to pages that had none, using each page's own picture" },
  description_missing: { name: "audited pages with a meta description", test: (p) => Boolean(p.description), summary: "added meta descriptions to pages that had none, written from each page's own text" },
  title_missing: { name: "audited pages with a title tag", test: (p) => Boolean(p.title), summary: "added title tags to pages that had none" },
  no_structured_data: { name: "audited pages with structured data", test: (p) => p.jsonLdTypes.length > 0, summary: "added structured data (JSON-LD) to pages that had none" },
};

async function validImage(url: string): Promise<boolean> {
  const r = await safeFetchText(url, { timeoutMs: 8000, maxBytes: 4000, accept: "image/*" });
  if (!r.ok || r.status !== 200) return false;
  return /^image\/(jpeg|png|webp)/i.test(r.headers.get("content-type") ?? "");
}

export type BasicSeoResult = { state: string; action?: string; pages?: number; note?: string };

/** Phase 1: audit and apply. Never edits a page inside its cooldown or with nothing honest to write. */
/** `scanOnly: true` audits and records opportunities but never applies a fix — the independent daily sweep uses this; the orchestrator's seoHandler (scanOnly:false, the default) is the only path that acts. */
export async function runBasicSeoForBusiness(businessId: string, opts: { scanOnly?: boolean } = {}): Promise<BasicSeoResult> {
  const db = getDb();
  if (!db) return { state: "no_db" };
  const [biz] = await db.select({ name: businesses.name, website: businesses.website }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz?.website) return { state: "no_website" };

  const target = await getSiteTarget(businessId);
  const pages = await collectPages(biz.website, MAX_PAGES_PER_ACTION);
  if (pages.length === 0) return { state: "site_unreachable" };
  const defects = findDefects(pages, biz.name);
  await recordDefectsAsOpportunities(businessId, defects);

  await db.insert(jobs).values({
    businessId,
    type: "seo_basic_scan",
    status: "completed",
    payload: { pages: pages.length, defects: defects.reduce<Record<string, number>>((m, d) => ((m[d.type] = (m[d.type] ?? 0) + 1), m), {}), connector: target?.adapter ?? null },
  });

  if (opts.scanOnly) return { state: "scanned" };
  if (!target || !target.capabilities.pageMetadata) return { state: "audit_only_no_site_connector", note: "Findings recorded; a site connector is needed to apply them." };

  // Cooldown is scoped to (page, defect class) — the same defect on the same page can't
  // thrash, but a DIFFERENT page, or a different defect class on the SAME page, is still free
  // to act. A business-wide cooldown would mean "GravyBlock stops useful marketing on this
  // business for 28 days," which is not the intent.
  const since = new Date(Date.now() - COOLDOWN_DAYS * 86_400_000);
  const recent = await db.select({ payload: jobs.payload }).from(jobs).where(and(eq(jobs.businessId, businessId), eq(jobs.type, "site_override"), gte(jobs.createdAt, since)));
  const touched = new Set(recent.map((r) => { const p = r.payload as { path?: string; defectType?: string } | null; return p?.path && p?.defectType ? `${p.path}|${p.defectType}` : null; }).filter(Boolean));

  // Rank applicable defect classes by total benefit; act on the best one.
  const byType = new Map<DefectType, Defect[]>();
  for (const d of defects) {
    if (!APPLICABLE.includes(d.type) || !d.fix || touched.has(`${d.path}|${d.type}`)) continue;
    if (d.type === "no_social_image" && !target.capabilities.socialImage) continue;
    if (d.type === "no_structured_data" && !target.capabilities.structuredData) continue;
    byType.set(d.type, [...(byType.get(d.type) ?? []), d]);
  }
  // Which defect class to act on is decided by the universal opportunity queue, not a local
  // heuristic — the same ranking (impact x confidence x strategy weight / cost x risk) that
  // orders every other engine's opportunities for this business.
  const queueOrder = await nextOpportunities(businessId, 50);
  const availableTypes = new Set(byType.keys());
  const ranked = queueOrder
    .filter((o) => o.engine === "existing_page_seo_basic" && availableTypes.has((o.evidence as { defectType?: DefectType } | null)?.defectType as DefectType))
    .map((o) => (o.evidence as { defectType: DefectType }).defectType)
    .filter((t, i, arr) => arr.indexOf(t) === i);
  const chosenType = ranked[0] ?? [...byType.entries()].sort((a, b) => b[1].reduce((s, d) => s + d.score, 0) - a[1].reduce((s, d) => s + d.score, 0))[0]?.[0];
  if (!chosenType) return { state: "nothing_worth_changing" };

  const type = chosenType;
  const list = byType.get(type)!;
  const applied: { path: string; url: string; ogImage?: string; description?: string; title?: string; jsonLd?: unknown }[] = [];
  const cache = new Map<string, boolean>();
  for (const d of list.slice(0, MAX_PAGES_PER_ACTION)) {
    const fix = d.fix!;
    if (type === "no_social_image") {
      const p = pages.find((x) => x.path === d.path);
      let chosen: string | null = null;
      for (const img of (p?.images ?? []).slice(0, 4)) {
        if (!cache.has(img)) cache.set(img, await validImage(img));
        if (cache.get(img)) {
          chosen = img;
          break;
        }
      }
      if (!chosen) continue;
      applied.push({ path: d.path, url: d.url, ogImage: chosen });
    } else if (type === "description_missing" && fix.description) applied.push({ path: d.path, url: d.url, description: fix.description });
    else if (type === "title_missing" && fix.title) applied.push({ path: d.path, url: d.url, title: fix.title });
    else if (type === "no_structured_data" && fix.jsonLd) applied.push({ path: d.path, url: d.url, jsonLd: fix.jsonLd });
  }
  if (applied.length === 0) return { state: "no_safe_fix_available", action: type };

  const actionId = crypto.randomUUID();
  const metric = METRIC[type]!;
  const before = pages.filter((p) => metric.test(p)).length;
  for (const a of applied) {
    await db.insert(jobs).values({
      businessId,
      type: "site_override",
      status: "active",
      payload: { path: a.path, ogImage: a.ogImage ?? null, description: a.description ?? null, title: a.title ?? null, jsonLd: a.jsonLd ?? null, actionId, defectType: type },
    });
  }
  await db.insert(jobs).values({
    businessId,
    type: ACTION_JOB,
    status: "applied",
    payload: {
      actionId,
      defectType: type,
      adapter: target.adapter,
      appliedAt: new Date().toISOString(),
      paths: applied.map((a) => a.path),
      urls: applied.map((a) => a.url),
      auditedPages: pages.length,
      auditedPagePaths: pages.map((p) => p.path),
      before: { metric: metric.name, value: before, of: pages.length, sample: applied.slice(0, 3).map((a) => ({ path: a.path, ogImage: null })) },
      changes: applied.slice(0, 40),
    },
  });
  // Mark every acted defect's opportunity row acted (dedupe key ties it back to the queue entry),
  // and attach a measurement plan when GSC is connected — the worker evaluates it automatically
  // once the window arrives, no client monitoring required. Without GSC there is no realistically
  // measurable causal metric for this defect class, so it stays honest Level-1 execution proof.
  const gscOn = (await getCapabilityProfile(businessId)).active.has("gsc");
  await Promise.all(
    applied.map(async (a) => {
      let plan = null;
      if (gscOn) {
        const [perf] = await db.select({ clicks: pagePerformance.clicks, impressions: pagePerformance.impressions, periodStart: pagePerformance.periodStart }).from(pagePerformance).where(and(eq(pagePerformance.businessId, businessId), eq(pagePerformance.pageUrl, a.url))).orderBy(desc(pagePerformance.periodStart)).limit(1);
        plan = buildMeasurementPlan(OPPORTUNITY_TYPE[type], perf?.clicks ?? 0, perf?.periodStart ?? "unknown");
      }
      await markActed(`seo_basic_defect:${businessId}:${type}:${a.path}`, { actionId, verificationStatus: "unverified", measurementPlan: plan });
    }),
  );
  return { state: "applied", action: type, pages: applied.length };
}

/** Phase 2: confirm on the LIVE pages, measure, then (and only then) write proof. Unverifiable overrides are rolled back after 48h. */
export async function verifyBasicSeoActions(businessId?: string): Promise<{ checked: number; verified: number; reverted: number }> {
  const db = getDb();
  if (!db) return { checked: 0, verified: 0, reverted: 0 };
  const rows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.type, ACTION_JOB), eq(jobs.status, "applied"), businessId ? eq(jobs.businessId, businessId) : sql`true`))
    .orderBy(desc(jobs.createdAt))
    .limit(20);
  let verified = 0;
  let reverted = 0;
  for (const row of rows) {
    const p = row.payload as {
      actionId: string;
      defectType: DefectType;
      appliedAt: string;
      urls: string[];
      paths: string[];
      auditedPagePaths: string[];
      auditedPages: number;
      before: { metric: string; value: number; of: number };
      changes: { path: string; url: string; ogImage?: string; description?: string; title?: string }[];
    };
    const ageMs = Date.now() - new Date(p.appliedAt).getTime();
    const metric = METRIC[p.defectType]!;
    let ok = 0;
    const failedPaths: string[] = [];
    const evidence: { url: string; ogImage?: string | null; description?: string | null }[] = [];
    for (const c of p.changes) {
      const r = await safeFetchText(c.url, { timeoutMs: 9000 });
      if (!r.ok || r.status !== 200) {
        failedPaths.push(c.path);
        continue;
      }
      const snap = snapshotPage(r.finalUrl, r.body, r.status);
      let pass = false;
      if (p.defectType === "no_social_image") pass = snap.ogImage === c.ogImage && (await validImage(c.ogImage!));
      else if (p.defectType === "description_missing") pass = snap.description === c.description;
      else if (p.defectType === "title_missing") pass = Boolean(snap.title);
      else pass = snap.jsonLdTypes.length > 0;
      if (!pass) failedPaths.push(c.path);
      if (pass) {
        ok++;
        if (evidence.length < 5) evidence.push({ url: c.url, ogImage: snap.ogImage, description: snap.description });
      }
    }
    const rate = p.changes.length ? ok / p.changes.length : 0;
    // After a grace period, pages the site's connector does not apply to (e.g. a route not wired to it) are
    // rolled back individually; the action then stands on the pages where the change is really live.
    if (rate < 0.9 && ok >= 1 && ageMs > 6 * 3_600_000) {
      for (const path of failedPaths) {
        await db.insert(jobs).values({ businessId: row.businessId, type: "site_override", status: "reverted", payload: { path, actionId: p.actionId, defectType: p.defectType, reason: "not_applied_by_site" } });
      }
      p.changes = p.changes.filter((c) => !failedPaths.includes(c.path));
      p.paths = p.paths.filter((x) => !failedPaths.includes(x));
    }
    if (rate >= 0.9 || (ok >= 1 && ageMs > 6 * 3_600_000)) {
      // Re-measure the same audited set so before/after are comparable.
      let after = 0;
      for (const path of p.auditedPagePaths) {
        const origin = new URL(p.changes[0]?.url ?? p.urls[0]!).origin;
        const r = await safeFetchText(origin + path, { timeoutMs: 9000 });
        if (r.ok && r.status === 200 && metric.test(snapshotPage(r.finalUrl, r.body, r.status))) after++;
      }
      await db.update(jobs).set({ status: "verified", payload: { ...p, verifiedAt: new Date().toISOString(), livePagesConfirmed: ok, after: { metric: metric.name, value: after, of: p.auditedPages }, evidence } }).where(eq(jobs.id, row.id));
      await recordProof({
        businessId: row.businessId!,
        actionType: `seo_basic_${p.defectType}`,
        engine: "existing_page_seo_basic",
        proofCategory: "technical",
        destination: p.urls[0] ?? null,
        summary: `GravyBlock ${metric.summary}, then confirmed the change on ${ok} live page${ok === 1 ? "" : "s"} of the business's own website.`,
        beforeEvidence: { metric: metric.name, value: p.before.value, of: p.before.of, defect: p.defectType },
        afterEvidence: { metric: metric.name, value: after, of: p.auditedPages, livePagesConfirmed: ok, sample: evidence },
        metricName: metric.name,
        metricBefore: p.before.value,
        metricAfter: after,
        methodVersion: "basic-audit-v1",
        findingType: p.defectType === "no_social_image" ? "crawl-og" : `crawl-${p.defectType.replace(/_/g, "-")}`,
        dedupeKey: `seo_basic:${p.actionId}`,
      });
      // "verified" here means the site change confirmed live — a real growth measurement (if any)
      // is a separate, later step written only by evaluateMeasurementPlans via recordMeasurement.
      await Promise.all(p.paths.map((path) => resolveOpportunityByDedupeKey(`seo_basic_defect:${row.businessId}:${p.defectType}:${path}`, "verified")));
      verified++;
    } else if (ageMs > 48 * 3_600_000) {
      for (const path of p.paths) {
        await db.insert(jobs).values({ businessId: row.businessId, type: "site_override", status: "reverted", payload: { path, actionId: p.actionId, defectType: p.defectType, reason: "not_confirmed_on_live_page" } });
      }
      await db.update(jobs).set({ status: "reverted" }).where(eq(jobs.id, row.id));
      await Promise.all(p.paths.map((path) => resolveOpportunityByDedupeKey(`seo_basic_defect:${row.businessId}:${p.defectType}:${path}`, "no_gain")));
      reverted++;
    }
  }
  return { checked: rows.length, verified, reverted };
}

export async function runBasicSeoBatch(limit = 6): Promise<{ businesses: number; applied: number; verified: number }> {
  const db = getDb();
  if (!db) return { businesses: 0, applied: 0, verified: 0 };
  const targets = await db.select({ id: businesses.id }).from(businesses).where(inArray(businesses.planTier, ["starter", "growth", "pro", "agency", "base", "managed", "entry"])).limit(50);
  let applied = 0;
  let n = 0;
  for (const t of targets) {
    if (n >= limit) break;
    const [recent] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.businessId, t.id), eq(jobs.type, "seo_basic_scan"), gte(jobs.createdAt, new Date(Date.now() - 7 * 86_400_000)))).limit(1);
    if (recent) continue;
    n++;
    try {
      // Discovery/audit only — the orchestrator's seoHandler is the only path that applies a fix.
      const r = await runBasicSeoForBusiness(t.id, { scanOnly: true });
      if (r.state === "applied") applied++;
    } catch (err) {
      console.error("[seo-basic] failed", { businessId: t.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const v = await verifyBasicSeoActions();
  return { businesses: n, applied, verified: v.verified };
}

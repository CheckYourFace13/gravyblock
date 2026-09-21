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

const APPLICABLE: DefectType[] = ["no_social_image", "description_missing", "title_missing", "no_structured_data"];
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
export async function runBasicSeoForBusiness(businessId: string): Promise<BasicSeoResult> {
  const db = getDb();
  if (!db) return { state: "no_db" };
  const [biz] = await db.select({ name: businesses.name, website: businesses.website }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz?.website) return { state: "no_website" };

  const target = await getSiteTarget(businessId);
  const pages = await collectPages(biz.website, MAX_PAGES_PER_ACTION);
  if (pages.length === 0) return { state: "site_unreachable" };
  const defects = findDefects(pages, biz.name);

  await db.insert(jobs).values({
    businessId,
    type: "seo_basic_scan",
    status: "completed",
    payload: { pages: pages.length, defects: defects.reduce<Record<string, number>>((m, d) => ((m[d.type] = (m[d.type] ?? 0) + 1), m), {}), connector: target?.adapter ?? null },
  });

  if (!target || !target.capabilities.pageMetadata) return { state: "audit_only_no_site_connector", note: "Findings recorded; a site connector is needed to apply them." };

  const since = new Date(Date.now() - COOLDOWN_DAYS * 86_400_000);
  const recent = await db.select({ payload: jobs.payload }).from(jobs).where(and(eq(jobs.businessId, businessId), eq(jobs.type, "site_override"), gte(jobs.createdAt, since)));
  const touched = new Set(recent.map((r) => (r.payload as { path?: string } | null)?.path));

  // Rank applicable defect classes by total benefit; act on the best one.
  const byType = new Map<DefectType, Defect[]>();
  for (const d of defects) {
    if (!APPLICABLE.includes(d.type) || !d.fix || touched.has(d.path)) continue;
    if (d.type === "no_social_image" && !target.capabilities.socialImage) continue;
    if (d.type === "no_structured_data" && !target.capabilities.structuredData) continue;
    byType.set(d.type, [...(byType.get(d.type) ?? []), d]);
  }
  const ranked = [...byType.entries()].sort((a, b) => b[1].reduce((s, d) => s + d.score, 0) - a[1].reduce((s, d) => s + d.score, 0));
  if (ranked.length === 0) return { state: "nothing_worth_changing" };

  const [type, list] = ranked[0]!;
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
    const evidence: { url: string; ogImage?: string | null; description?: string | null }[] = [];
    for (const c of p.changes) {
      const r = await safeFetchText(c.url, { timeoutMs: 9000 });
      if (!r.ok || r.status !== 200) continue;
      const snap = snapshotPage(r.finalUrl, r.body, r.status);
      let pass = false;
      if (p.defectType === "no_social_image") pass = snap.ogImage === c.ogImage && (await validImage(c.ogImage!));
      else if (p.defectType === "description_missing") pass = snap.description === c.description;
      else if (p.defectType === "title_missing") pass = Boolean(snap.title);
      else pass = snap.jsonLdTypes.length > 0;
      if (pass) {
        ok++;
        if (evidence.length < 5) evidence.push({ url: c.url, ogImage: snap.ogImage, description: snap.description });
      }
    }
    const rate = p.changes.length ? ok / p.changes.length : 0;
    if (rate >= 0.9) {
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
      verified++;
    } else if (ageMs > 48 * 3_600_000) {
      for (const path of p.paths) {
        await db.insert(jobs).values({ businessId: row.businessId, type: "site_override", status: "reverted", payload: { path, actionId: p.actionId, reason: "not_confirmed_on_live_page" } });
      }
      await db.update(jobs).set({ status: "reverted" }).where(eq(jobs.id, row.id));
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
      const r = await runBasicSeoForBusiness(t.id);
      if (r.state === "applied") applied++;
    } catch (err) {
      console.error("[seo-basic] failed", { businessId: t.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const v = await verifyBasicSeoActions();
  return { businesses: n, applied, verified: v.verified };
}

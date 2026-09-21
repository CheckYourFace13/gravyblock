/**
 * Low-risk auto-repair for WordPress pages GravyBlock itself published
 * (publishedContent channel "wordpress" for the same business). Nothing else is
 * ever touched; anything outside the list below stays alert-only in
 * site-watchdog.ts.
 *
 * Repairable defects (each verified after the fix, otherwise reverted/logged):
 *   http_gone       public URL 404/410 while WP still holds a draft/pending copy -> publish
 *   noindex         noindex meta that lives inside the post content -> remove that tag
 *                   (a noindex from a theme/plugin/site setting is logged, not changed)
 *   missing_schema  no JSON-LD on the live page -> prepend LocalBusiness/Article schema
 *   broken_link     internal link inside the content that 404s -> unwrap the <a>, keep text
 *
 * Proof is recorded only after the defect is verified gone.
 */

import { and, desc, eq, gte } from "drizzle-orm";
import { businesses, getDb, jobs, publishedContent, publishingTargets } from "@/lib/db";
import { safeFetchText } from "@/lib/net/safe-fetch";
import { buildSchemaScriptBlock, injectSchemaIntoHtml } from "@/lib/publishing/inject-schema";
import { recordProof } from "@/lib/proof/ledger";
import { getWordPressTarget } from "@/lib/seo/existing-pages";
import { findContentByUrl, getContentById, updateContent } from "@/lib/wordpress/admin";
import type { WordPressConfig } from "@/lib/integrations/wordpress";

const BUSINESS_BUDGET_MS = 60_000;
const MAX_PAGES_PER_BUSINESS = 12;
const RETRY_COOLDOWN_DAYS = 3;

export type Defect = "http_gone" | "noindex" | "missing_schema" | "broken_link";
export type AutoRepairCounts = { businesses: number; pagesChecked: number; defectsFound: number; repaired: number; alertOnly: number; failed: number };

type Db = NonNullable<ReturnType<typeof getDb>>;

function noindexIn(html: string, headers: Headers): boolean {
  return /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html) || /noindex/i.test(headers.get("x-robots-tag") ?? "");
}

function busted(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}gbverify=${Date.now()}`;
}

async function recentlyAttempted(db: Db, businessId: string, pageUrl: string, defect: Defect): Promise<boolean> {
  const rows = await db
    .select({ payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), eq(jobs.type, "auto_repair"), gte(jobs.createdAt, new Date(Date.now() - RETRY_COOLDOWN_DAYS * 86_400_000))));
  return rows.some((r) => {
    const p = r.payload as { pageUrl?: string; defect?: string; verified?: boolean } | null;
    return p?.pageUrl === pageUrl && p?.defect === defect && p?.verified !== true;
  });
}

async function logJob(db: Db, businessId: string, status: string, payload: Record<string, unknown>) {
  await db.insert(jobs).values({ businessId, type: "auto_repair", status, payload }).catch(() => undefined);
}

const SUMMARY: Record<Defect, string> = {
  http_gone: "restored a GravyBlock-published page that was returning an error",
  noindex: "removed a stray noindex tag from a GravyBlock-published page",
  missing_schema: "added missing structured data to a GravyBlock-published page",
  broken_link: "removed a broken internal link from a GravyBlock-published page",
};

async function finishRepair(db: Db, businessId: string, pageUrl: string, defect: Defect, before: unknown, after: unknown, extra: Record<string, unknown> = {}) {
  await logJob(db, businessId, "completed", { pageUrl, defect, verified: true, ...extra });
  await recordProof({
    businessId,
    actionType: "technical_fix",
    engine: "auto_repair",
    proofCategory: "technical",
    findingType: defect,
    destination: pageUrl,
    summary: SUMMARY[defect],
    beforeEvidence: before,
    afterEvidence: after,
    dedupeKey: `technical_fix:${pageUrl}:${defect}:${new Date().toISOString().slice(0, 10)}`,
  });
}

/** Inspect one page and repair at most one defect. Returns what happened. */
async function repairPage(db: Db, businessId: string, config: WordPressConfig, pageUrl: string): Promise<"clean" | "repaired" | "alert_only" | "failed" | "skipped"> {
  const res = await safeFetchText(pageUrl, { timeoutMs: 12_000, maxBytes: 1_500_000 });

  // (2) 404/410 while WP still has the post.
  if (res.ok ? res.status === 404 || res.status === 410 : res.status === 404 || res.status === 410) {
    const status = res.ok ? res.status : (res.status ?? 404);
    if (await recentlyAttempted(db, businessId, pageUrl, "http_gone")) return "skipped";
    const found = await findContentByUrl(config, pageUrl, { anyStatus: true });
    if (!found.ok || !["draft", "pending"].includes(found.value.status)) {
      await logJob(db, businessId, "alert_only", { pageUrl, defect: "http_gone", verified: false, reason: found.ok ? `wp_status_${found.value.status}` : `wp_lookup_${found.error}`, httpStatus: status });
      return "alert_only";
    }
    const upd = await updateContent(config, found.value.type, found.value.id, { status: "publish" });
    const check = upd.ok ? await safeFetchText(busted(pageUrl), { timeoutMs: 12_000 }) : null;
    if (check?.ok && check.status === 200) {
      await finishRepair(db, businessId, pageUrl, "http_gone", { httpStatus: status, wpStatus: found.value.status }, { httpStatus: 200, wpStatus: "publish" });
      return "repaired";
    }
    if (upd.ok) await updateContent(config, found.value.type, found.value.id, { status: "draft" });
    await logJob(db, businessId, "failed", { pageUrl, defect: "http_gone", verified: false, reason: upd.ok ? "still_not_200_reverted" : upd.error });
    return "failed";
  }

  if (!res.ok || res.status !== 200) return "skipped"; // transient/unreachable: the watchdog alerts; we do not guess

  const wpFound = async () => findContentByUrl(config, pageUrl);

  // (1) noindex
  if (noindexIn(res.body, res.headers)) {
    if (await recentlyAttempted(db, businessId, pageUrl, "noindex")) return "skipped";
    const found = await wpFound();
    const tagRe = /<meta[^>]+name=["']robots["'][^>]*noindex[^>]*>\s*/gi;
    if (found.ok && tagRe.test(found.value.contentHtml)) {
      const cleaned = found.value.contentHtml.replace(/<meta[^>]+name=["']robots["'][^>]*noindex[^>]*>\s*/gi, "");
      const upd = await updateContent(config, found.value.type, found.value.id, { content: cleaned });
      const check = upd.ok ? await safeFetchText(busted(pageUrl), { timeoutMs: 12_000, maxBytes: 1_500_000 }) : null;
      if (check?.ok && check.status === 200 && !noindexIn(check.body, check.headers)) {
        await finishRepair(db, businessId, pageUrl, "noindex", { noindex: true }, { noindex: false });
        return "repaired";
      }
      if (upd.ok) await updateContent(config, found.value.type, found.value.id, { content: found.value.contentHtml });
      await logJob(db, businessId, "failed", { pageUrl, defect: "noindex", verified: false, reason: "still_noindex_reverted" });
      return "failed";
    }
    await logJob(db, businessId, "alert_only", { pageUrl, defect: "noindex", verified: false, reason: "noindex_not_in_post_content_theme_plugin_or_site_setting" });
    return "alert_only";
  }

  // (3) missing JSON-LD
  if (!/application\/ld\+json/i.test(res.body)) {
    if (await recentlyAttempted(db, businessId, pageUrl, "missing_schema")) return "skipped";
    const found = await wpFound();
    if (!found.ok || /ld\+json/i.test(found.value.contentHtml)) {
      await logJob(db, businessId, "alert_only", { pageUrl, defect: "missing_schema", verified: false, reason: found.ok ? "schema_in_content_but_not_rendered" : `wp_lookup_${found.error}` });
      return "alert_only";
    }
    const [biz] = await db
      .select({ name: businesses.name, address: businesses.address, phone: businesses.phone, website: businesses.website, vertical: businesses.vertical, primaryCategory: businesses.primaryCategory, rating: businesses.rating, reviewCount: businesses.reviewCount })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);
    if (!biz) return "skipped";
    const block = buildSchemaScriptBlock({ business: biz, articleTitle: found.value.title, articleUrl: pageUrl });
    const upd = await updateContent(config, found.value.type, found.value.id, { content: injectSchemaIntoHtml(found.value.contentHtml, block) });
    const check = upd.ok ? await safeFetchText(busted(pageUrl), { timeoutMs: 12_000, maxBytes: 1_500_000 }) : null;
    if (check?.ok && check.status === 200 && /application\/ld\+json/i.test(check.body)) {
      await finishRepair(db, businessId, pageUrl, "missing_schema", { jsonLd: false }, { jsonLd: true });
      return "repaired";
    }
    if (upd.ok) await updateContent(config, found.value.type, found.value.id, { content: found.value.contentHtml });
    await logJob(db, businessId, "failed", { pageUrl, defect: "missing_schema", verified: false, reason: "schema_not_rendered_reverted" });
    return "failed";
  }

  // (4) broken internal link inside the content
  const found = await wpFound();
  if (!found.ok) return "clean";
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./i, "").toLowerCase(); } catch { return ""; } };
  const hrefs = [...new Set([...found.value.contentHtml.matchAll(/<a\b[^>]*\shref=["'](https?:\/\/[^"'#]+)["']/gi)].map((m) => m[1]!))]
    .filter((h) => host(h) === host(pageUrl) && h.replace(/\/+$/, "") !== pageUrl.replace(/\/+$/, ""))
    .slice(0, 12);
  const broken: string[] = [];
  for (const h of hrefs) {
    const r = await safeFetchText(h, { timeoutMs: 8000, maxBytes: 20_000 });
    if (r.ok && (r.status === 404 || r.status === 410)) broken.push(h);
  }
  if (!broken.length) return "clean";
  if (await recentlyAttempted(db, businessId, pageUrl, "broken_link")) return "skipped";

  let cleaned = found.value.contentHtml;
  for (const h of broken) {
    const re = new RegExp(`<a\\b[^>]*\\shref=["']${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>([\\s\\S]*?)</a>`, "gi");
    cleaned = cleaned.replace(re, "$1");
  }
  if (cleaned === found.value.contentHtml) return "skipped";
  const upd = await updateContent(config, found.value.type, found.value.id, { content: cleaned });
  const reread = upd.ok ? await getContentById(config, found.value.type, found.value.id) : null;
  const live = reread?.ok ? await safeFetchText(busted(pageUrl), { timeoutMs: 12_000 }) : null;
  const gone = reread?.ok && broken.every((h) => !reread.value.contentHtml.includes(`href="${h}"`) && !reread.value.contentHtml.includes(`href='${h}'`));
  if (gone && live?.ok && live.status === 200) {
    await finishRepair(db, businessId, pageUrl, "broken_link", { brokenLinks: broken }, { brokenLinks: [] }, { removed: broken });
    return "repaired";
  }
  if (upd.ok) await updateContent(config, found.value.type, found.value.id, { content: found.value.contentHtml });
  await logJob(db, businessId, "failed", { pageUrl, defect: "broken_link", verified: false, reason: "not_verified_reverted", broken });
  return "failed";
}

export async function runAutoRepairBatch(limit = 5): Promise<AutoRepairCounts> {
  const counts: AutoRepairCounts = { businesses: 0, pagesChecked: 0, defectsFound: 0, repaired: 0, alertOnly: 0, failed: 0 };
  try {
    const db = getDb();
    if (!db) return counts;
    const targets = await db
      .select({ businessId: publishingTargets.businessId })
      .from(publishingTargets)
      .where(and(eq(publishingTargets.adapter, "wordpress"), eq(publishingTargets.active, "true")))
      .limit(500);
    const ids = [...new Set(targets.map((t) => t.businessId).filter((x): x is string => !!x))];

    const ordered: Array<{ id: string; last: number }> = [];
    for (const id of ids) {
      const [last] = await db.select({ createdAt: jobs.createdAt }).from(jobs).where(and(eq(jobs.businessId, id), eq(jobs.type, "auto_repair_scan"))).orderBy(desc(jobs.createdAt)).limit(1);
      ordered.push({ id, last: last?.createdAt.getTime() ?? 0 });
    }
    ordered.sort((a, b) => a.last - b.last);

    for (const { id } of ordered.slice(0, limit)) {
      const deadline = Date.now() + BUSINESS_BUDGET_MS;
      try {
        const config = await getWordPressTarget(id);
        if (!config) continue;
        const pages = await db
          .select({ publicUrl: publishedContent.publicUrl })
          .from(publishedContent)
          .where(and(eq(publishedContent.businessId, id), eq(publishedContent.channel, "wordpress"), eq(publishedContent.status, "published")))
          .orderBy(desc(publishedContent.createdAt))
          .limit(MAX_PAGES_PER_BUSINESS);
        counts.businesses++;
        await db.insert(jobs).values({ businessId: id, type: "auto_repair_scan", status: "completed", payload: { pages: pages.length } }).catch(() => undefined);
        for (const p of pages) {
          if (!p.publicUrl || Date.now() > deadline - 20_000) break;
          counts.pagesChecked++;
          try {
            const r = await repairPage(db, id, config, p.publicUrl);
            if (r === "repaired") { counts.defectsFound++; counts.repaired++; }
            else if (r === "alert_only") { counts.defectsFound++; counts.alertOnly++; }
            else if (r === "failed") { counts.defectsFound++; counts.failed++; }
          } catch (err) {
            console.error("[auto-repair] page failed", { businessId: id, page: p.publicUrl, error: err instanceof Error ? err.message : String(err) });
          }
        }
      } catch (err) {
        console.error("[auto-repair] business failed", { businessId: id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  } catch (err) {
    console.error("[auto-repair] batch failed", err instanceof Error ? err.message : String(err));
  }
  return counts;
}

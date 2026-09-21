/**
 * Website conversion/technical watchdog.
 *
 * Every week, for each paid business, re-checks the customer's own site: key
 * pages return 200, no accidental noindex, a phone link and a way to contact
 * them still exist, analytics/Search Console tags are still present. Each run
 * is persisted (jobs.type = "site_watchdog") and compared with the previous
 * run so only REGRESSIONS raise an alert — a steady state stays silent.
 *
 * Honest scope: this detects and alerts. GravyBlock has no write access to
 * arbitrary customer sites, so it does not auto-repair; repair happens only
 * where a publishing integration exists (not implemented here).
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { businesses, getDb, jobs, leads } from "@/lib/db";
import { safeFetchText } from "@/lib/net/safe-fetch";
import { ensureFreshTruth } from "@/lib/truth";
import { sendSiteWatchdogAlertEmail } from "@/lib/integrations/resend";

type PageResult = { url: string; status: number | null; noindex: boolean; hasTitle: boolean };
type Snapshot = {
  pages: PageResult[];
  homepage: { hasTel: boolean; hasMailtoOrForm: boolean; hasAnalytics: boolean; hasSearchConsoleTag: boolean } | null;
};

function noindexIn(html: string, headers: Headers): boolean {
  return /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html) || /noindex/i.test(headers.get("x-robots-tag") ?? "");
}

export async function checkSite(website: string, keyUrls: string[]): Promise<Snapshot> {
  const pages: PageResult[] = [];
  let homepage: Snapshot["homepage"] = null;
  const urls = [website, ...keyUrls.filter((u) => u !== website)].slice(0, 6);
  for (const [i, url] of urls.entries()) {
    const r = await safeFetchText(url, { timeoutMs: 10000 });
    if (!r.ok) {
      pages.push({ url, status: r.status ?? null, noindex: false, hasTitle: false });
      continue;
    }
    pages.push({ url: r.finalUrl, status: r.status, noindex: noindexIn(r.body, r.headers), hasTitle: /<title[^>]*>\s*\S/i.test(r.body) });
    if (i === 0) {
      homepage = {
        hasTel: /href=["']tel:/i.test(r.body),
        hasMailtoOrForm: /href=["']mailto:/i.test(r.body) || /<form[\s>]/i.test(r.body),
        hasAnalytics: /googletagmanager\.com|gtag\(|google-analytics\.com|plausible\.io|fathom|matomo/i.test(r.body),
        hasSearchConsoleTag: /google-site-verification/i.test(r.body),
      };
    }
  }
  return { pages, homepage };
}

export function regressions(prev: Snapshot | null, cur: Snapshot): string[] {
  const out: string[] = [];
  for (const p of cur.pages) {
    const before = prev?.pages.find((x) => x.url === p.url);
    const ok = p.status !== null && p.status < 400;
    if (!ok && (!prev || before?.status === undefined || (before.status !== null && before.status < 400))) {
      out.push(`${p.url} is not loading (${p.status ?? "no response"})`);
    }
    if (p.noindex && !before?.noindex) out.push(`${p.url} now tells Google not to index it (noindex)`);
  }
  if (prev?.homepage && cur.homepage) {
    if (prev.homepage.hasTel && !cur.homepage.hasTel) out.push("The click-to-call phone link disappeared from your homepage");
    if (prev.homepage.hasMailtoOrForm && !cur.homepage.hasMailtoOrForm) out.push("Your homepage no longer has a contact form or email link");
    if (prev.homepage.hasAnalytics && !cur.homepage.hasAnalytics) out.push("Analytics tracking was removed from your homepage");
  }
  return out;
}

export async function runSiteWatchdogForBusiness(businessId: string): Promise<{ checked: boolean; regressions: string[] }> {
  const db = getDb();
  if (!db) return { checked: false, regressions: [] };
  const [biz] = await db
    .select({ name: businesses.name, website: businesses.website, accountType: businesses.accountType })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  if (!biz?.website) return { checked: false, regressions: [] };

  const [prevRow] = await db
    .select({ payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), eq(jobs.type, "site_watchdog")))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  const prev = (prevRow?.payload as { snapshot?: Snapshot } | null)?.snapshot ?? null;

  const truth = await ensureFreshTruth(businessId);
  const keyUrls = [...new Set(truth.facts.filter((f) => (f.key === "service" || f.key === "page_topic") && f.sourceUrl).map((f) => f.sourceUrl as string))].slice(0, 4);
  const snapshot = await checkSite(biz.website, keyUrls);
  const found = regressions(prev, snapshot);

  let alerted = false;
  if (found.length && biz.accountType !== "house") {
    const [lead] = await db.select({ email: leads.email }).from(leads).where(eq(leads.businessId, businessId)).orderBy(desc(leads.lastSeenAt)).limit(1);
    if (lead?.email) {
      const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
      await sendSiteWatchdogAlertEmail({ to: lead.email, businessName: biz.name, issues: found, workspaceUrl: `${base}/workspace/${businessId}` }).catch(() => undefined);
      alerted = true;
    }
  }
  await db.insert(jobs).values({ businessId, type: "site_watchdog", status: found.length ? "regression" : "healthy", payload: { snapshot, regressions: found, alerted } });
  return { checked: true, regressions: found };
}

/** Weekly; oldest first. */
export async function runSiteWatchdogBatch(batchSize = 5): Promise<{ checked: number; regressions: number }> {
  const db = getDb();
  if (!db) return { checked: 0, regressions: 0 };
  const paid = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(inArray(businesses.planTier, ["starter", "growth", "pro", "agency", "base", "managed", "entry"]))
    .limit(300);
  const weekAgo = Date.now() - 6.5 * 86_400_000;
  const due: { id: string; last: number }[] = [];
  for (const b of paid) {
    const runs = await db.select({ createdAt: jobs.createdAt }).from(jobs).where(and(eq(jobs.businessId, b.id), eq(jobs.type, "site_watchdog")));
    const last = runs.reduce((m, r) => Math.max(m, r.createdAt.getTime()), 0);
    if (last < weekAgo) due.push({ id: b.id, last });
  }
  due.sort((a, b) => a.last - b.last);
  let checked = 0;
  let reg = 0;
  for (const d of due.slice(0, batchSize)) {
    try {
      const r = await runSiteWatchdogForBusiness(d.id);
      if (r.checked) checked++;
      reg += r.regressions.length;
    } catch (err) {
      console.error("[site-watchdog] failed", { businessId: d.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { checked, regressions: reg };
}

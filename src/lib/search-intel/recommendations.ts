/**
 * Persistent recommendations: database side. The rules live in recommendation-model.ts (pure and tested); this file reads and writes the two tables.
 * Everything toward the live sites is a read-only fetch. No site is written to, and no status is changed because a ranking moved.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getFreshAccessToken, getGoogleConnection } from "@/lib/integrations/google-oauth";
import { gscQuery } from "@/lib/seo/existing-pages";
import { isSafePublicUrl, safeFetchText } from "@/lib/net/safe-fetch";
import {
  afterOpen, canTransition, classifyOutcome, emailBucket, evaluateVerification, fingerprintOf, implementationEvidence, normalizeUrl, onSeen, outcomeWindows, OWNER_STATUSES, sameWork, shortRef, snapshotFromHtml, targetQueriesOf,
  type Coverage, type EmailBucket, type LiveEvidence, type Outcome, type PageSnap, type Status, type VerifyResult,
} from "./recommendation-model";
import { coversIntent, fetchDetail, inventoryMatches } from "./research";
import { readSitemapUrls } from "./gather";
import { pickTop } from "./prompt";
import type { Improvement } from "./types";

type Rows<T> = T[];
const rowsOf = <T>(r: unknown) => r as unknown as Rows<T>;

export type RecRecord = {
  id: string;
  businessId: string;
  fingerprint: string;
  ref: string;
  kind: Improvement["kind"];
  issue: string;
  title: string;
  improvement: Improvement;
  priority: number;
  status: Status;
  occurrence: number;
  baseline: PageSnap[] | null;
  verification: VerifyResult | null;
  outcome: Outcome | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastReportWeek: string | null;
  openedAt: Date | null;
  inProgressAt: Date | null;
  completedAt: Date | null;
  verifiedAt: Date | null;
  dismissedAt: Date | null;
  reopenedAt: Date | null;
  copiedAt: Date | null;
  copyCount: number;
  firstEmailedAt: Date | null;
  verifiedNotifiedAt: Date | null;
};

type Raw = Record<string, unknown>;
const d = (v: unknown): Date | null => (v ? new Date(v as string) : null);
const toRec = (r: Raw): RecRecord => ({
  id: r.id as string,
  businessId: r.business_id as string,
  fingerprint: r.fingerprint as string,
  ref: shortRef(r.fingerprint as string),
  kind: r.kind as Improvement["kind"],
  issue: r.issue as string,
  title: r.title as string,
  improvement: r.improvement as Improvement,
  priority: Number(r.priority),
  status: r.status as Status,
  occurrence: Number(r.occurrence),
  baseline: (r.baseline as PageSnap[] | null) ?? null,
  verification: (r.verification as VerifyResult | null) ?? null,
  outcome: (r.outcome as Outcome | null) ?? null,
  firstSeenAt: new Date(r.first_seen_at as string),
  lastSeenAt: new Date(r.last_seen_at as string),
  lastReportWeek: (r.last_report_week as string | null) ?? null,
  openedAt: d(r.opened_at), inProgressAt: d(r.in_progress_at), completedAt: d(r.completed_at), verifiedAt: d(r.verified_at), dismissedAt: d(r.dismissed_at), reopenedAt: d(r.reopened_at), copiedAt: d(r.copied_at),
  copyCount: Number(r.copy_count),
  firstEmailedAt: d(r.first_emailed_at),
  verifiedNotifiedAt: d(r.verified_notified_at),
});

export async function logRecommendationEvent(recommendationId: string, businessId: string, type: string, o: { from?: string | null; to?: string | null; note?: string; meta?: unknown } = {}) {
  return logEvent(recommendationId, businessId, type, o);
}

async function logEvent(recommendationId: string, businessId: string, type: string, o: { from?: string | null; to?: string | null; note?: string; meta?: unknown } = {}) {
  const db = getDb()!;
  await db.execute(sql`insert into search_recommendation_events (recommendation_id, business_id, type, from_status, to_status, note, meta)
    values (${recommendationId}, ${businessId}, ${type}, ${o.from ?? null}, ${o.to ?? null}, ${o.note ?? null}, ${o.meta === undefined ? null : JSON.stringify(o.meta)}::jsonb)`);
}

/** Read-only snapshots of the affected pages (up to three), used as the "before" for verification. */
export async function captureSnapshots(urls: string[], now: Date): Promise<PageSnap[]> {
  const out: PageSnap[] = [];
  for (const u of [...new Set(urls)].slice(0, 3)) {
    if (!isSafePublicUrl(u)) continue;
    const r = await safeFetchText(u, { timeoutMs: 9000, maxBytes: 500_000 });
    out.push(r.ok ? snapshotFromHtml(u, r.status, r.body, r.headers.get("x-robots-tag"), now.toISOString()) : snapshotFromHtml(u, null, "", null, now.toISOString()));
  }
  return out;
}

/* ───────────── is the work already live? (read only; recognises fixes made by a site's own developer) ───────────── */

export type SiteInventory = { urls: string[] };

export async function siteInventory(businessId: string): Promise<SiteInventory> {
  const db = getDb();
  if (!db) return { urls: [] };
  const [b] = rowsOf<{ website: string | null }>(await db.execute(sql`select website from businesses where id = ${businessId} limit 1`));
  try {
    if (!b?.website) return { urls: [] };
    const origin = new URL(/^https?:\/\//i.test(b.website) ? b.website : `https://${b.website}`).origin;
    const host = new URL(origin).hostname.replace(/^www\./, "").toLowerCase();
    return { urls: ((await readSitemapUrls(origin, host)) ?? []).map((e) => e.loc) };
  } catch {
    return { urls: [] };
  }
}

/**
 * Checks one recommendation against the live site: its own pages compared with the snapshots taken when it was first reported and, for searches the site
 * was missing, whether any page on the site (found through its sitemap) now plainly serves them. Null when this kind cannot be judged from the live pages.
 */
export async function liveImplementation(imp: Pick<Improvement, "kind" | "urls" | "title" | "evidence" | "targetQueries">, baseline: PageSnap[] | null, inv: SiteInventory, now: Date): Promise<LiveEvidence | null> {
  const current = await captureSnapshots(imp.urls, now);
  const coverage: Coverage[] = [];
  if (imp.kind === "new_demand" || imp.kind === "seasonal") {
    const queries = targetQueriesOf(imp);
    if (!queries.length) return null;
    const pages = [...new Set([...imp.urls, ...queries.flatMap((q) => inventoryMatches(inv.urls, q, 2))])].slice(0, 5);
    for (const u of pages) {
      const f = await fetchDetail(u, now.toISOString()).catch(() => null);
      if (!f) continue;
      const c = coversIntent(f, queries);
      coverage.push({ url: f.url, covered: c.covered, by: c.by, indexable: f.indexable });
      if (c.covered && f.indexable) break;
    }
  }
  return implementationEvidence(imp, baseline ?? [], current, coverage);
}

/**
 * Before every report (weekly and daily): any unfinished recommendation that is objectively live on the site is marked verified, with the evidence, whoever
 * implemented it. This is what stops completed work being recommended again. It says the change is live, never that search results improved; the outcome
 * is measured separately over the following 28 days.
 */
export async function detectImplemented(businessId: string, now = new Date(), opts: { dryRun?: boolean } = {}): Promise<{ checked: number; implemented: Array<{ ref: string; title: string; how: string }> }> {
  const db = getDb();
  const out = { checked: 0, implemented: [] as Array<{ ref: string; title: string; how: string }> };
  if (!db) return out;
  const recs = rowsOf<Raw>(await db.execute(sql`select * from search_recommendations where business_id = ${businessId} and status in ('new', 'opened', 'in_progress', 'completed')`)).map(toRec);
  if (!recs.length) return out;
  const inv = await siteInventory(businessId);
  for (const r of recs) {
    const ev = await liveImplementation(r.improvement, r.baseline, inv, now).catch(() => null);
    if (!ev) continue;
    out.checked++;
    if (!ev.implemented) continue;
    out.implemented.push({ ref: r.ref, title: r.title, how: ev.how });
    if (opts.dryRun) continue;
    const v: VerifyResult = { deployed: true, level: ev.level, checks: ev.checks, at: now.toISOString(), note: `Detected live on ${now.toISOString().slice(0, 10)}: ${ev.how}. Implemented outside GravyBlock (for example by the site's own developer) or by a reviewed change; GravyBlock did not deploy it. This confirms the change is live, not that search results improved.` };
    await db.execute(sql`update search_recommendations set status = 'verified', completed_at = coalesce(completed_at, now()), verified_at = now(), verification = ${JSON.stringify(v)}::jsonb, outcome = null where id = ${r.id}::uuid and status in ('new', 'opened', 'in_progress', 'completed')`);
    await logEvent(r.id, businessId, "detected_live", { from: r.status, to: "verified", note: v.note, meta: { checks: ev.checks } });
  }
  return out;
}

/**
 * Weekly regeneration and the daily check both end here. A candidate whose identity already exists UPDATES that record (status and history untouched). A candidate
 * describing the SAME work as an existing record under a slightly different identity (a shifted topic label) updates that record instead of creating a twin, and
 * is suppressed entirely when that work is in progress, completed, verified or dismissed. A verified record is reopened only when the live check shows a regression.
 */
export async function syncRecommendations(businessId: string, candidates: Improvement[], week: string, now = new Date()): Promise<{ created: number; updated: number; reopened: number; kept: number; suppressed: number }> {
  const db = getDb();
  const out = { created: 0, updated: 0, reopened: 0, kept: 0, suppressed: 0 };
  if (!db) return out;
  const all = rowsOf<Raw>(await db.execute(sql`select * from search_recommendations where business_id = ${businessId}`));
  let inv: SiteInventory | null = null;
  for (const imp of candidates) {
    const fp = fingerprintOf(businessId, imp.kind, imp.issue, imp.identityUrls);
    let ex = all.find((r) => r.fingerprint === fp);
    if (!ex) {
      const twin = all.find((r) => r.improvement && sameWork(imp, r.improvement as Improvement));
      // an owner dismissal blocks only the same kind of item; legacy items the system itself retired never block a new, better-described one
      if (twin && (["in_progress", "completed", "verified"].includes(twin.status as string) || (twin.status === "dismissed" && twin.kind === imp.kind))) {
        out.suppressed++;
        const [seen] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from search_recommendation_events where recommendation_id = ${twin.id as string}::uuid and type = 'similar_suppressed' and at > now() - interval '6 days'`));
        if (!Number(seen?.n ?? 0)) await logEvent(twin.id as string, businessId, "similar_suppressed", { note: `the analysis found this same work again ("${imp.title.slice(0, 120)}"); not re-recommended because it is ${twin.status}`, meta: { week } });
        continue;
      }
      if (twin && twin.status !== "dismissed") ex = twin; // same unfinished work under a shifted label: refresh it, keep its identity and history
    }
    const keepRefs = imp.competitorUrls.length === 0 && ex ? ((ex.improvement as Improvement | null)?.competitorUrls ?? []) : imp.competitorUrls;
    const json = JSON.stringify({ ...imp, competitorUrls: keepRefs, ref: shortRef((ex?.fingerprint as string) ?? fp) });
    let stillLive: boolean | null = null;
    if (ex && ex.status === "verified") {
      inv = inv ?? (await siteInventory(businessId));
      const ev = await liveImplementation(ex.improvement as Improvement, (ex.baseline as PageSnap[] | null) ?? null, inv, now).catch(() => null);
      stillLive = ev ? ev.implemented : null;
    }
    const decision = onSeen(ex ? { status: ex.status as Status, verifiedAt: d(ex.verified_at), occurrence: Number(ex.occurrence) } : null, now, stillLive);
    if (decision.action === "create") {
      const baseline = await captureSnapshots(imp.urls, now);
      const [row] = rowsOf<{ id: string }>(await db.execute(sql`insert into search_recommendations (business_id, fingerprint, kind, issue, title, improvement, priority, last_report_week, baseline)
        values (${businessId}, ${fp}, ${imp.kind}, ${imp.issue}, ${imp.title}, ${json}::jsonb, ${imp.priority}, ${week}, ${JSON.stringify(baseline)}::jsonb)
        on conflict (business_id, fingerprint) do nothing returning id`));
      if (row) {
        await logEvent(row.id, businessId, "seen", { to: "new", note: "first reported", meta: { week } });
        out.created++;
        all.push({ id: row.id, fingerprint: fp, status: "new", improvement: { ...imp } });
      }
      continue;
    }
    const id = ex!.id as string;
    if (decision.action === "reopen") {
      const baseline = await captureSnapshots(imp.urls, now);
      await db.execute(sql`update search_recommendations set status = 'new', occurrence = ${decision.occurrence}, reopened_at = now(), copied_at = null, copy_count = 0, first_emailed_at = null, opened_at = null, in_progress_at = null, completed_at = null, verified_at = null, verified_notified_at = null,
        verification = null, outcome = null, baseline = ${JSON.stringify(baseline)}::jsonb, improvement = ${json}::jsonb, title = ${imp.title}, priority = ${imp.priority}, last_seen_at = now(), last_report_week = ${week} where id = ${id}`);
      await logEvent(id, businessId, "reopened", { from: "verified", to: "new", note: `reopened: the live site no longer shows the verified implementation (a regression), occurrence ${decision.occurrence}`, meta: { week } });
      out.reopened++;
      continue;
    }
    // update or keep: refresh the evidence and last-seen only; status, timestamps and history are never touched here. Verified work keeps the improvement it was
    // verified against (its targets and evidence), so later checks compare like with like.
    if (decision.action === "keep" && ex!.status === "verified") await db.execute(sql`update search_recommendations set last_seen_at = now(), last_report_week = ${week} where id = ${id}`);
    else await db.execute(sql`update search_recommendations set improvement = ${json}::jsonb, title = ${imp.title}, priority = ${imp.priority}, last_seen_at = now(), last_report_week = ${week} where id = ${id}`);
    if (decision.action === "update" && ex!.last_report_week !== week) await logEvent(id, businessId, "seen", { note: "seen again in a later weekly report", meta: { week } });
    if (decision.action === "update") out.updated++;
    else out.kept++;
  }
  return out;
}

export async function loadQueue(businessId: string): Promise<RecRecord[]> {
  const db = getDb();
  if (!db) return [];
  return rowsOf<Raw>(await db.execute(sql`select * from search_recommendations where business_id = ${businessId} order by priority desc, first_seen_at`)).map(toRec);
}

export type RecEvent = { at: string; type: string; from: string | null; to: string | null; note: string | null };
export async function loadEvents(recIds: string[]): Promise<Map<string, RecEvent[]>> {
  const db = getDb();
  const m = new Map<string, RecEvent[]>();
  if (!db || !recIds.length) return m;
  const rows = rowsOf<Raw>(await db.execute(sql`select recommendation_id, at, type, from_status, to_status, note from search_recommendation_events where recommendation_id in (${sql.join(recIds.map((i) => sql`${i}::uuid`), sql`, `)}) order by at`));
  for (const r of rows) {
    const k = r.recommendation_id as string;
    (m.get(k) ?? m.set(k, []).get(k)!).push({ at: new Date(r.at as string).toISOString(), type: r.type as string, from: (r.from_status as string) ?? null, to: (r.to_status as string) ?? null, note: (r.note as string) ?? null });
  }
  return m;
}

/** Unresolved work for the copy-ready prompt: everything in progress, then the best new or opened items, never completed, verified or dismissed ones. */
export function unresolvedImprovements(records: RecRecord[], now: Date, max = 5): Improvement[] {
  const fresh = (r: RecRecord) => now.getTime() - r.lastSeenAt.getTime() <= 21 * 86_400_000;
  const withRef = (r: RecRecord): Improvement => ({ ...r.improvement, ref: r.ref, priority: r.priority });
  const inProgress = records.filter((r) => r.status === "in_progress").map(withRef);
  const others = pickTop(records.filter((r) => (r.status === "new" || r.status === "opened") && fresh(r)).map(withRef), Math.max(0, max - inProgress.length));
  return [...inProgress, ...others].slice(0, Math.max(max, inProgress.length));
}

/** Opening a report in authenticated admin: a view. NEW recommendations become OPENED; nothing is started. */
export async function markReportOpened(businessId: string, weekEnding: string): Promise<{ reportFirstOpen: boolean; opened: number }> {
  const db = getDb();
  if (!db) return { reportFirstOpen: false, opened: 0 };
  const upd = rowsOf<{ id: string }>(await db.execute(sql`update search_intel_reports set opened_at = now() where business_id = ${businessId} and week_ending = ${weekEnding} and opened_at is null returning id`));
  const moved = rowsOf<{ id: string }>(await db.execute(sql`update search_recommendations set status = 'opened', opened_at = now() where business_id = ${businessId} and status = 'new' and last_seen_at > now() - interval '21 days' returning id`));
  for (const m of moved) await logEvent(m.id, businessId, "opened", { from: "new", to: "opened", note: "report opened in admin (a view, not work started)" });
  return { reportFirstOpen: upd.length > 0, opened: moved.length };
}

/** The owner copied the prompt: flag the included recommendations as handed off. Their workflow status is deliberately left alone. */
export async function markCopied(businessId: string, ids: string[]): Promise<number> {
  const db = getDb();
  if (!db || !ids.length) return 0;
  const rows = rowsOf<{ id: string }>(await db.execute(sql`update search_recommendations set copied_at = now(), copy_count = copy_count + 1 where business_id = ${businessId} and id in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}) returning id`));
  for (const r of rows) await logEvent(r.id, businessId, "copied", { note: "prompt copied for Claude/Cursor (handed off; status unchanged)" });
  return rows.length;
}

export async function setRecommendationStatus(id: string, to: Status, note?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const [r] = rowsOf<Raw>(await db.execute(sql`select * from search_recommendations where id = ${id}::uuid limit 1`));
  if (!r) return { ok: false, reason: "not_found" };
  const from = r.status as Status;
  const allowedTarget = OWNER_STATUSES.includes(to) || (to === "new" && from === "dismissed") || (to === "opened" && from === "in_progress");
  if (!allowedTarget || !canTransition(from, to)) return { ok: false, reason: `cannot move from ${from} to ${to}` };
  const stamp = to === "in_progress" ? sql`in_progress_at = now(), completed_at = null` : to === "completed" ? sql`completed_at = now(), verification = null, outcome = null` : to === "dismissed" ? sql`dismissed_at = now()` : to === "new" ? sql`dismissed_at = null` : sql`in_progress_at = null`;
  await db.execute(sql`update search_recommendations set status = ${to}, ${stamp} where id = ${id}::uuid`);
  await logEvent(id, r.business_id as string, "status", { from, to, note: note ?? "changed by the owner in admin" });
  return { ok: true };
}

/** Completed items: re-check the live pages read-only. A pass makes the item Verified (deployed fix confirmed); a fail leaves it Completed, awaiting verification. */
export async function verifyCompleted(businessId: string, now = new Date()): Promise<{ checked: number; verified: number }> {
  const db = getDb();
  if (!db) return { checked: 0, verified: 0 };
  const recs = rowsOf<Raw>(await db.execute(sql`select * from search_recommendations where business_id = ${businessId} and status = 'completed'`)).map(toRec);
  let verified = 0;
  let inv: SiteInventory | null = null;
  for (const r of recs) {
    const current = await captureSnapshots(r.improvement.urls, now);
    let v = evaluateVerification(r.kind, r.issue, r.baseline ?? [], current, now);
    if (v.deployed !== true && (r.kind === "new_demand" || r.kind === "seasonal")) {
      // searches the site was missing are served by whichever page now covers them, which may be a new page not listed when the work was recommended
      inv = inv ?? (await siteInventory(businessId));
      const ev = await liveImplementation(r.improvement, r.baseline, inv, now).catch(() => null);
      if (ev?.implemented) v = { deployed: true, level: ev.level, checks: ev.checks, at: now.toISOString(), note: `${ev.how}. This confirms the change is live, not that search results improved.` };
    }
    await db.execute(sql`update search_recommendations set verification = ${JSON.stringify(v)}::jsonb where id = ${r.id}::uuid`);
    if (v.deployed === true) {
      await db.execute(sql`update search_recommendations set status = 'verified', verified_at = now() where id = ${r.id}::uuid and status = 'completed'`);
      await logEvent(r.id, businessId, "verified", { from: "completed", to: "verified", note: v.note, meta: { level: v.level, checks: v.checks.length } });
      verified++;
    } else {
      const [last] = rowsOf<{ at: string }>(await db.execute(sql`select at from search_recommendation_events where recommendation_id = ${r.id}::uuid and type = 'verification_failed' order by at desc limit 1`));
      if (!last || now.getTime() - new Date(last.at).getTime() > 7 * 86_400_000) await logEvent(r.id, businessId, "verification_failed", { note: v.note, meta: { deployed: v.deployed } });
    }
  }
  return { checked: recs.length, verified };
}

/** After completion, the page's own Google clicks over 28 days before and after. A measured change only: never causal and never changes the workflow status. */
export async function measureOutcomes(businessId: string, now = new Date()): Promise<{ measured: number }> {
  const db = getDb();
  if (!db) return { measured: 0 };
  const recs = rowsOf<Raw>(await db.execute(sql`select * from search_recommendations where business_id = ${businessId} and status in ('completed', 'verified') and completed_at is not null`)).map(toRec)
    .filter((r) => !r.outcome || r.outcome.verdict === "too_early");
  if (!recs.length) return { measured: 0 };
  const conn = await getGoogleConnection(businessId).catch(() => null);
  const token = conn?.searchConsoleProperty ? await getFreshAccessToken(businessId).catch(() => null) : null;
  let measured = 0;
  for (const r of recs) {
    const w = outcomeWindows(r.completedAt!, now);
    const urls = [...new Set(r.improvement.urls.filter((u) => isSafePublicUrl(u)))].slice(0, 3);
    let before: { clicks: number; impressions: number } | null = null;
    let after: { clicks: number; impressions: number } | null = null;
    if (w.ready && token && conn?.searchConsoleProperty && urls.length) {
      const sum = async (win: { start: string; end: string }) => {
        let clicks = 0;
        let impressions = 0;
        for (const u of urls) {
          const rows = await gscQuery(token, conn.searchConsoleProperty!, win, [], { pageEquals: u });
          if (rows === null) return null;
          for (const x of rows) { clicks += Math.round(x.clicks ?? 0); impressions += Math.round(x.impressions ?? 0); }
        }
        return { clicks, impressions };
      };
      before = await sum(w.before);
      after = await sum(w.after);
    }
    const o = classifyOutcome(before, after, w.ready && urls.length > 0, now);
    await db.execute(sql`update search_recommendations set outcome = ${JSON.stringify(o)}::jsonb where id = ${r.id}::uuid`);
    if (o.verdict !== "too_early") {
      await logEvent(r.id, businessId, "outcome", { note: `${o.verdict}: ${before?.clicks ?? "n/a"} to ${after?.clicks ?? "n/a"} clicks over equal 28-day windows (a measured change, not proof of cause)`, meta: o });
      measured++;
    }
  }
  return { measured };
}

export type EmailItem = { id: string; businessId: string; site: string; ref: string; title: string; bucket: EmailBucket; occurrence: number; potentialClicks28: number; priority: number; outcome: Outcome | null; verification: VerifyResult | null; completedAt: Date | null; verifiedAt: Date | null };

/** Everything the Friday email may mention, sorted into the buckets that stop one unfinished item being promoted as new every week. */
export async function collectEmailItems(now = new Date()): Promise<EmailItem[]> {
  const db = getDb();
  if (!db) return [];
  const rows = rowsOf<Raw>(await db.execute(sql`select r.*, b.name site from search_recommendations r join businesses b on b.id = r.business_id where b.account_type = 'house' and r.status <> 'dismissed'`));
  const out: EmailItem[] = [];
  for (const row of rows) {
    const r = toRec(row);
    const bucket = emailBucket({ status: r.status, occurrence: r.occurrence, firstEmailedAt: r.firstEmailedAt, verifiedNotifiedAt: r.verifiedNotifiedAt, lastSeenAt: r.lastSeenAt }, now);
    if (!bucket) continue;
    out.push({ id: r.id, businessId: r.businessId, site: row.site as string, ref: r.ref, title: r.title, bucket, occurrence: r.occurrence, potentialClicks28: r.improvement.potentialClicks28, priority: r.priority, outcome: r.outcome, verification: r.verification, completedAt: r.completedAt, verifiedAt: r.verifiedAt });
  }
  return out.sort((a, b) => b.priority - a.priority);
}

/** Called only after Resend accepted the Friday email, so an item is "already reported" only if the owner really was sent it. */
export async function markEmailed(items: Array<Pick<EmailItem, "id" | "businessId" | "bucket">>): Promise<void> {
  const db = getDb();
  if (!db) return;
  for (const i of items) {
    if (i.bucket === "VERIFIED") await db.execute(sql`update search_recommendations set verified_notified_at = now() where id = ${i.id}::uuid and verified_notified_at is null`);
    else await db.execute(sql`update search_recommendations set first_emailed_at = now() where id = ${i.id}::uuid and first_emailed_at is null`);
    await logEvent(i.id, i.businessId, "emailed", { note: `listed in the Friday email as ${i.bucket}` });
  }
}

export { normalizeUrl };

/** Kinds the v2 analysis no longer produces on their own (a page drop is part of technical recovery; hygiene warnings are not growth opportunities). */
const LEGACY_KINDS = ["declining", "confirmed_problem", "competitor_gap", "page_two", "near_page_one"];

/**
 * Retires older single-symptom recommendations that the improved, root-cause-grouped audit replaces, so GrokBot and the owner are not handed the same
 * problem twice. Only items nobody has started (new or opened) are retired, with a history note; anything in progress, completed or verified is untouched.
 */
export async function supersedeLegacy(businessId: string, current: Improvement[]): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const keep = new Set(current.map((c) => fingerprintOf(businessId, c.kind, c.issue, c.identityUrls)));
  const rows = rowsOf<{ id: string; fingerprint: string; status: string }>(await db.execute(sql`
    select id, fingerprint, status from search_recommendations where business_id = ${businessId} and status in ('new', 'opened') and kind in (${sql.join(LEGACY_KINDS.map((k) => sql`${k}`), sql`, `)})`));
  let n = 0;
  for (const r of rows) {
    if (keep.has(r.fingerprint)) continue;
    await db.execute(sql`update search_recommendations set status = 'dismissed', dismissed_at = now() where id = ${r.id}::uuid and status in ('new', 'opened')`);
    await logEvent(r.id, businessId, "status", { from: r.status, to: "dismissed", note: "superseded by the improved audit: grouped under its root cause or not a growth opportunity" });
    n++;
  }
  return n;
}

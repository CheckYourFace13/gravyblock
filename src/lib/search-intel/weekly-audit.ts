/**
 * The complete weekly Search & Competitor audit for the GrokBot automation: one portfolio summary email plus one email per house site (a full audit with all
 * copy-ready instructions does not fit one email, and Gmail clips large messages), every Friday at 06:00 America/Chicago, through the existing Resend account.
 *
 * - Data is refreshed from 05:00 Chicago time and, for any site still stale, again right before sending, so the audit is current at 06:00.
 * - Idempotent per week: each email has a delivery row keyed audit:<week>:<site>, and the same key is Resend's Idempotency-Key, so a retry or a second worker
 *   pass never sends twice. A failed email is retried on the next pass until 12:00 Chicago time.
 * - The audit is a status report plus instructions. It never creates new action requests: recommendations already sent on their own are labelled as already sent,
 *   and nothing here changes a recommendation's status. GravyBlock keeps verifying completed work read-only.
 * - House accounts only. No site is written to.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { listHouseAccounts } from "@/lib/house";
import { weekEndingFor } from "./gather";
import { generateMissingSearchIntel, loadReports, summarizePortfolio, type StoredReport } from "./index";
import { loadQueue, unresolvedImprovements, type RecRecord } from "./recommendations";
import { buildPrompt } from "./prompt";
import { containsSensitive, grokbotConfig, scrubPersonal, sendViaResend, type SendFn } from "./grokbot";
import type { Move } from "./analysis";

type Rows<T> = T[];
const rowsOf = <T>(r: unknown) => r as unknown as Rows<T>;

/* ───────────── America/Chicago time (daylight saving handled by the platform's time-zone database) ───────────── */

const TZ = "America/Chicago";
export function chicagoParts(d: Date): { ymd: string; weekday: string; hour: number; minute: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday!, hour: Number(p.hour), minute: Number(p.minute) };
}

/** The UTC instant of a Chicago wall-clock time (two passes settle the offset, including on daylight-saving days). */
export function chicagoInstant(ymd: string, hour: number, minute = 0): Date {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  let t = Date.UTC(y, m - 1, d, hour, minute);
  for (let i = 0; i < 2; i++) {
    const p = chicagoParts(new Date(t));
    const shown = Date.UTC(Number(p.ymd.slice(0, 4)), Number(p.ymd.slice(5, 7)) - 1, Number(p.ymd.slice(8, 10)), p.hour, p.minute);
    t += Date.UTC(y, m - 1, d, hour, minute) - shown;
  }
  return new Date(t);
}

export type AuditPhase = "idle" | "refresh" | "send";
/** Friday 05:00 to 05:59 Chicago: refresh. Friday 06:00 to 11:59: send (or finish/retry sending). Anything else: nothing. */
export function auditPhase(now: Date): AuditPhase {
  const p = chicagoParts(now);
  if (p.weekday !== "Fri") return "idle";
  if (p.hour === 5) return "refresh";
  if (p.hour >= 6 && p.hour < 12) return "send";
  return "idle";
}

/** The next scheduled send, as a UTC instant, for reporting. */
export function nextAuditSend(now: Date): Date {
  for (let i = 0; i < 8; i++) {
    const day = new Date(now.getTime() + i * 86_400_000);
    const p = chicagoParts(day);
    if (p.weekday !== "Fri") continue;
    const at = chicagoInstant(p.ymd, 6, 0);
    if (at.getTime() > now.getTime()) return at;
  }
  return chicagoInstant(chicagoParts(new Date(now.getTime() + 7 * 86_400_000)).ymd, 6, 0);
}

/* ───────────── statuses as GrokBot should read them ───────────── */

export type AuditBucket = "NEW" | "REOPENED" | "STILL OPEN" | "OPENED" | "HANDED OFF" | "IN PROGRESS" | "COMPLETED" | "VERIFIED";
export const AUDIT_ORDER: AuditBucket[] = ["NEW", "REOPENED", "STILL OPEN", "OPENED", "HANDED OFF", "IN PROGRESS", "COMPLETED", "VERIFIED"];

/**
 * One label per recommendation. NEW only when this occurrence began after the previous audit email for the site, so nothing already reported is presented as new.
 * Handed off = the prompt was copied or the item was already emailed to GrokBot on its own.
 */
export function auditBucket(r: Pick<RecRecord, "status" | "occurrence" | "firstSeenAt" | "reopenedAt" | "copiedAt">, sentToGrokbot: boolean, previousAuditAt: Date | null): AuditBucket | null {
  if (r.status === "dismissed") return null;
  if (r.status === "verified") return "VERIFIED";
  if (r.status === "completed") return "COMPLETED";
  if (r.status === "in_progress") return "IN PROGRESS";
  const began = r.occurrence > 1 ? r.reopenedAt : r.firstSeenAt;
  const isNewSincePrevious = !previousAuditAt || (began !== null && began > previousAuditAt);
  if (r.copiedAt || sentToGrokbot) return "HANDED OFF";
  if (r.status === "opened") return "OPENED";
  if (isNewSincePrevious) return r.occurrence > 1 ? "REOPENED" : "NEW";
  return "STILL OPEN";
}

const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const moves = (title: string, list: Move[] | undefined, n = 5) => [`${title}:`, ...(list?.length ? list.slice(0, n).map((m) => `  - ${m.key}: clicks ${m.clicksPrev} to ${m.clicksCur}, impressions ${m.imprPrev} to ${m.imprCur}`) : ["  - none with enough volume"])];

export type SiteAuditInput = { report: StoredReport; queue: RecRecord[]; sent: Map<string, string>; previousAuditAt: Date | null; index: number; total: number; week: string; now: Date };

/**
 * One site's section of the weekly audit (v2): what the site is for, a short performance summary with every window named, the 3 to 5 growth opportunities,
 * relevant competitors only, recommendation history, measured results of earlier work, and ONE copy-ready instruction. Concise on purpose.
 */
export function buildSiteAuditEmail(i: SiteAuditInput): { subject: string; text: string; buckets: Record<string, number> } {
  const d = i.report.data;
  const deep = d.deep;
  const L: string[] = [];
  const buckets: Record<string, number> = {};
  const pathOf = (u: string) => {
    try { return new URL(u).pathname || "/"; } catch { return u; }
  };
  const tot = (label: string, c: { start: string; end: string; clicks: number; impressions: number; ctr: number | null; position: number | null }, prev?: { clicks: number; impressions: number }) =>
    `- ${label} (${c.start} to ${c.end}): ${c.clicks} clicks${prev ? ` (${sign(c.clicks - prev.clicks)})` : ""}, ${c.impressions} impressions${prev ? ` (${sign(c.impressions - prev.impressions)})` : ""}, CTR ${c.ctr === null ? "n/a" : `${(c.ctr * 100).toFixed(1)}%`}, average position ${c.position ?? "n/a"}`;

  L.push(`GRAVYBLOCK WEEKLY GROWTH AUDIT: ${i.report.name} (${d.site.website ?? ""}), week ending ${i.week}`);
  if (deep?.profile) L.push(`What the site is for: ${deep.profile.what}. Audience: ${deep.profile.audience}. Conversions that matter: ${deep.profile.conversions.join("; ")}.`);
  if (deep?.truthDescription) L.push(`The site describes itself as: "${deep.truthDescription.slice(0, 220)}"`);
  L.push("Nothing here changes a task's status, and GravyBlock never edits this site.");

  L.push("", "1. SEARCH PERFORMANCE (Google search only, not total visitors; each line names its own window)");
  if (d.w7) L.push(`${tot("7 days", d.w7.cur, d.w7.prev)} vs the 7 days before${d.w7.sample !== "ok" ? ` [${d.w7.sample} sample: not a trend]` : ""}`);
  if (d.w28) L.push(`${tot("28 days", d.w28.cur, d.w28.prev)} vs the 28 days before${d.w28.sample !== "ok" ? ` [${d.w28.sample} sample: not a trend]` : ""}`);
  if (deep) {
    L.push(deep.trend90 ? `${tot("90 days", deep.trend90.cur, deep.trend90.prev)} vs the 90 days before` : "- 90 days: not enough stored history for a 90-day comparison yet.");
    const b = deep.brand;
    if (b.brandedImpressions + b.nonBrandedImpressions > 0) L.push(`- Searches for the brand vs everything else (28 days): brand ${b.brandedClicks} clicks / ${b.brandedImpressions} impressions; non-brand ${b.nonBrandedClicks} clicks / ${b.nonBrandedImpressions} impressions.`);
    if (deep.devices.length) L.push(`- Devices (28 days): ${deep.devices.map((x) => `${x.key.toLowerCase()} ${x.clicks} clicks / ${x.impressions} impressions, CTR ${(x.ctr * 100).toFixed(1)}%, position ${x.position}`).join("; ")}.`);
    if (deep.countries.length) L.push(`- Top countries (28 days): ${deep.countries.slice(0, 4).map((x) => `${x.key.toUpperCase()} ${x.impressions} impressions`).join(", ")}.`);
    const st = [deep.searchTypes.image, deep.searchTypes.video].filter((x) => x && x.impressions > 0);
    L.push(st.length ? `- Image and video search (28 days): ${st.map((x) => `${x!.key} ${x!.clicks} clicks / ${x!.impressions} impressions`).join("; ")}.` : "- Image and video search (28 days): no impressions.");
    if (deep.sections.length) L.push(`- By site section (28 days vs the 28 before): ${deep.sections.slice(0, 4).map((x) => `${x.section} ${x.pages} pages, ${x.clicks} clicks (was ${x.clicksPrev}), ${x.impressions} impressions (was ${x.impressionsPrev})`).join("; ")}.`);
    if (deep.emerging.length) L.push(`- New searches appearing this window: ${deep.emerging.slice(0, 5).map((q) => `"${q.key}" (${q.impressions})`).join(", ")}.`);
    if (deep.clusters.length) L.push(`- Biggest search topics (28 days): ${deep.clusters.slice(0, 4).map((c) => `"${c.label}" ${c.impressions} impressions at position ${c.position} (${c.intent})`).join("; ")}.`);
  }
  const limits = [...d.status.notes, ...d.dataQualityNotes];
  L.push(`- Limits: Search Console only shows searches the site already appears for; small numbers are noise.${limits.length ? ` ${limits.join(" ")}` : ""}`);

  // 2. the opportunities: the unresolved queue, best first
  const unresolved = unresolvedImprovements(i.queue, i.now);
  L.push("", `2. TOP OPPORTUNITIES (${unresolved.length}; full detail in the instruction below)`);
  if (!unresolved.length) L.push("- None with enough evidence this week. The instruction below asks for validation instead of inventing work.");
  unresolved.forEach((u, n) => {
    L.push(`${n + 1}. [${u.ref}] ${(u.category ?? u.kind.replace(/_/g, " ")).toUpperCase()}: ${u.title}`);
    if (u.evidence[0]) L.push(`   Evidence: ${u.evidence[0]}`);
    if (u.urls.length) L.push(`   Pages: ${u.urls.slice(0, 4).map(pathOf).join(", ")}`);
    if (u.competitorUrls.length) L.push(`   Competing pages: ${u.competitorUrls.slice(0, 2).join("; ")}`);
    const sentAt = i.sent.get(i.queue.find((q) => q.ref === u.ref)?.id ?? "");
    if (sentAt) L.push(`   Already sent to GrokBot on ${sentAt.slice(0, 10)}: this is the same request, not a new one.`);
  });

  // 3. competitors: only the relevant ones
  L.push("", `3. COMPETITORS (public pages observed ${d.competitors.observedAt.slice(0, 10)}; covering a topic is not a ranking; competitor traffic and backlinks are not available)`);
  L.push(d.competitors.known.length ? `- Relevant: ${(deep?.competitorFilter.kept.length ? deep.competitorFilter.kept : d.competitors.known.map((k) => k.website)).join("; ")}` : "- No relevant competitor confirmed this week.");
  if (deep?.competitorFilter.rejected.length) L.push(`- Rejected as not genuinely competing: ${deep.competitorFilter.rejected.map((r) => r.site).join(", ")}.`);
  if (deep?.demand.uncaptured.length) L.push(`- Searches people type that the site is not found for (${deep.demand.source}, ${deep.demand.checkedAt.slice(0, 10)}; existence, not volume): ${deep.demand.uncaptured.map((u) => `"${u.label}"`).join(", ")}.`);
  if (d.competitors.newPages.length) L.push(`- New competitor pages since the previous observation: ${d.competitors.newPages.slice(0, 4).map((p) => p.url).join(", ")}.`);

  // 4. history and 5. measured results
  L.push("", "4. RECOMMENDATION HISTORY (persistent IDs; NEW means first reported since the previous audit)");
  const grouped = new Map<AuditBucket, string[]>();
  for (const r of i.queue) {
    const b = auditBucket(r, i.sent.has(r.id), i.previousAuditAt);
    if (!b) continue;
    buckets[b] = (buckets[b] ?? 0) + 1;
    (grouped.get(b) ?? grouped.set(b, []).get(b)!).push(r.ref);
  }
  for (const b of AUDIT_ORDER) if (grouped.get(b)?.length) L.push(`- ${b}: ${grouped.get(b)!.join(", ")}`);
  if (!grouped.size) L.push("- none on record");
  const measured = i.queue.filter((r) => r.verification || (r.outcome && r.outcome.verdict !== "too_early"));
  L.push("", "5. RESULTS OF EARLIER WORK (read-only checks of the live site; search results measured separately and never assumed to be caused by the change)");
  if (!measured.length) L.push("- No completed work has been checked yet.");
  for (const r of measured.slice(0, 6)) L.push(`- ${r.ref} ${r.title}: ${r.verification ? (r.verification.deployed ? "fix confirmed live" : "fix not yet visible on the live site") : ""}${r.outcome && r.outcome.verdict !== "too_early" ? `; measured: ${r.outcome.verdict.replace(/_/g, " ")} (${r.outcome.before?.clicks ?? "n/a"} to ${r.outcome.after?.clicks ?? "n/a"} clicks over equal 28-day windows)` : ""}`);

  L.push("", "6. =================== COPY-READY DEVELOPMENT INSTRUCTION (route to this site's own developer; copy everything between the lines) ===================");
  L.push(buildPrompt(d, unresolved));
  L.push("=================== END OF INSTRUCTION ===================");
  const text = scrubPersonal(L.join("\n"));
  return { subject: `[GravyBlock Weekly Audit] ${i.week} — ${i.report.name} (${i.index} of ${i.total})`, text, buckets };
}

/** https://host of a site's website, or null. */
export function siteBase(website: string | null): string | null {
  try {
    return website ? `https://${new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./i, "")}` : null;
  } catch {
    return null;
  }
}

/** Rewrites the site's own absolute URLs (with or without www, http or https) as paths; other sites' URLs are untouched. */
export function relativize(text: string, base: string): string {
  const host = base.replace(/^https?:\/\//, "").replace(/[.]/g, "\\.");
  return text.replace(new RegExp(`https?://(?:www\\.)?${host}(?![\\w.-])(/[^\\s"')<>]*)?`, "gi"), (_m, path?: string) => path || "/");
}

type Delivery = { id: string; status: string; attempts: number };

/** Claim a delivery for sending. A failed one is retried at most every 10 minutes; one stuck mid-send for 15 minutes is retried with the same idempotency key. */
async function claim(key: string, businessId: string | null, subject: string): Promise<Delivery | null> {
  const db = getDb()!;
  await db.execute(sql`insert into grokbot_deliveries (recommendation_id, business_id, occurrence, idempotency_key, kind, status, subject) values (null, ${businessId}, 1, ${key}, 'weekly_audit', 'pending', ${subject}) on conflict (idempotency_key) do nothing`);
  const [d] = rowsOf<Delivery>(await db.execute(sql`update grokbot_deliveries set status = 'sending', attempts = attempts + 1, updated_at = now(), subject = ${subject}
    where idempotency_key = ${key} and attempts < 6 and (status = 'pending' or (status = 'failed' and updated_at < now() - interval '10 minutes') or (status = 'sending' and updated_at < now() - interval '15 minutes')) returning id, status, attempts`));
  return d ?? null;
}

async function finish(id: string, r: { ok: boolean; id?: string; error?: string }) {
  const db = getDb()!;
  if (r.ok) await db.execute(sql`update grokbot_deliveries set status = 'sent', sent_at = now(), resend_email_id = ${r.id ?? null}, last_error = null, updated_at = now() where id = ${id}::uuid`);
  else await db.execute(sql`update grokbot_deliveries set status = 'failed', last_error = ${r.error ?? "send failed"}, updated_at = now() where id = ${id}::uuid`);
}

/**
 * Deliverability: the audit goes out as a few plain-text parts (each kept under Gmail's ~100 KB clipping size, whole sites never split), at least
 * PART_GAP_MS apart, instead of one email per site in a burst. Part 1 starts with the portfolio summary. No HTML, no tracking, no attachments.
 */
export const PART_LIMIT_CHARS = 60_000;
export const PART_GAP_MS = 5 * 60_000;

export function packParts(blocks: string[], limit = PART_LIMIT_CHARS): number[][] {
  const parts: number[][] = [];
  let cur: number[] = [];
  let size = 0;
  blocks.forEach((b, i) => {
    if (cur.length && size + b.length > limit) {
      parts.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(i);
    size += b.length;
  });
  if (cur.length) parts.push(cur);
  return parts;
}

export type AuditResult = { week: string; sites: number; parts: number; sent: number; alreadySent: number; failed: number; waiting: boolean; complete: boolean; refreshed: string[]; results: Array<{ part: number; sites: string[]; status: string; resendEmailId?: string; error?: string; chars?: number }> };

/** True when this week's audit has been fully delivered (including the earlier one-email-per-site format, recognised by its summary email). */
async function weekComplete(week: string): Promise<boolean> {
  const db = getDb()!;
  const [x] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from grokbot_deliveries where kind = 'weekly_audit' and status = 'sent' and idempotency_key in (${`audit:${week}:complete`}, ${`audit:${week}:summary`})`));
  return Number(x?.n ?? 0) > 0;
}

/** Builds this week's audit (summary, one section per site, parts) from the stored reports without sending or writing anything. */
export async function composeWeeklyAudit(now: Date, week: string) {
  const db = getDb()!;
  const houses = await listHouseAccounts();
  const reports = await loadReports(week);
  
  const ordered = houses.map((h) => reports.find((r) => r.businessId === h.id)).filter((r): r is StoredReport => !!r);
  const [prevAudit] = rowsOf<{ at: string | null }>(await db.execute(sql`select max(sent_at) at from grokbot_deliveries where kind = 'weekly_audit' and status = 'sent' and idempotency_key not like ${`audit:${week}:%`}`));
  const previousAuditAt = prevAudit?.at ? new Date(prevAudit.at) : null;
  const blocks: string[] = [];
  const summaryLines: string[] = [];
  let idx = 0;
  for (const report of ordered) {
    idx++;
    const sentRows = rowsOf<{ recommendation_id: string; sent_at: string }>(await db.execute(sql`select recommendation_id, sent_at from grokbot_deliveries where business_id = ${report.businessId} and kind in ('new', 'reopened') and status = 'sent'`));
    const queue = await loadQueue(report.businessId);
    const sent = new Map<string, string>();
    for (const s of sentRows) {
      const rec = queue.find((q) => q.id === s.recommendation_id);
      const began = rec ? (rec.occurrence > 1 ? rec.reopenedAt : rec.firstSeenAt) : null;
      if (rec && (!began || new Date(s.sent_at) >= began)) sent.set(s.recommendation_id, new Date(s.sent_at).toISOString());
    }
    const email = buildSiteAuditEmail({ report, queue, sent, previousAuditAt, index: idx, total: ordered.length, week, now });
    // Fewer links per message: the site's own URLs are written as paths under one stated base (the 27 Nov audits carried 37 to 87 full URLs each).
    const base = siteBase(report.data.site.website);
    blocks.push(`\n\n######## SITE ${idx} OF ${ordered.length}: ${report.name} ########\n${base ? `All paths in this section are on ${base}\n` : ""}\n${base ? relativize(email.text, base) : email.text}`);
    summaryLines.push(`- ${report.name}: ${Object.entries(email.buckets).map(([b, n]) => `${b} ${n}`).join(", ") || "no recommendations"}; 28-day clicks ${report.data.w28?.cur.clicks ?? "n/a"}${report.data.w28 ? ` (${sign(report.data.w28.clicksChange)})` : ""}`);
  }
  const parts = packParts(blocks);
  
  // Every site's section must land in exactly one part with its instruction, so nothing disappears when the audit is split. Refuse to send otherwise.
  const placed = parts.flat().sort((a, b) => a - b);
  if (placed.length !== blocks.length || placed.some((v, i) => v !== i) || blocks.some((b) => !b.includes("COPY-READY DEVELOPMENT INSTRUCTION"))) {
    return { houses, reports, ordered, blocks, parts, summary: "", complete: false as const };
  }
  const s = summarizePortfolio(reports, houses.map((h) => h.name), week);
  const summary = [
    `GRAVYBLOCK WEEKLY SEARCH & COMPETITOR AUDIT, week ending ${week}`,
    `This audit covers ${ordered.length} sites in ${parts.length} part(s), sent a few minutes apart. Each site section is complete: its audit, its recommendations by status and one copy-ready development instruction for that site's own developer.`,
    "Nothing in these emails changes a task's status, and GravyBlock never edits these sites.",
    "",
    `Portfolio (Google search clicks only, not total visitors): 28 days ${s.totals.clicks28} clicks (${sign(s.totals.clicks28 - s.totals.clicks28Prev)}), ${s.totals.impressions28} impressions (${sign(s.totals.impressions28 - s.totals.impressions28Prev)}); 7 days ${s.totals.clicks7} clicks (${sign(s.totals.clicks7 - s.totals.clicks7Prev)}).`,
    `Gains: ${s.gains.map((g) => `${g.site} ${sign(g.change)}`).join(", ") || "none large enough to read"}. Losses: ${s.losses.map((g) => `${g.site} ${sign(g.change)}`).join(", ") || "none large enough to read"}.`,
    s.missing.length ? `Not available this week: ${s.missing.join(", ")}.` : `All ${houses.length} sites covered.`,
    "",
    "Recommendations by status per site (NEW means first reported since the previous audit; HANDED OFF means already emailed on its own or copied):",
    ...summaryLines,
    "",
    "Top priorities this week:",
    ...s.priorities.map((p, n) => `${n + 1}. ${p.site}: ${p.title}`),
    "",
    "Parts:",
    ...parts.map((p, n) => `- Part ${n + 1}: ${p.map((i) => ordered[i]!.name).join(", ")}`),
  ].join("\n");
  return { houses, reports, ordered, blocks, parts, summary, complete: true as const };
}

/**
 * Sends this week's audit. Safe to call repeatedly (the worker calls it every 30 seconds in the send window): sent parts are skipped, the next part waits until
 * PART_GAP_MS after the previous one, failed parts are retried. `freshSince` forces any report older than that instant to be regenerated before sending.
 */
export async function sendWeeklyAudit(now = new Date(), opts: { send?: SendFn; freshSince?: Date; gapMs?: number } = {}): Promise<AuditResult> {
  const db = getDb();
  const week = weekEndingFor(now);
  const out: AuditResult = { week, sites: 0, parts: 0, sent: 0, alreadySent: 0, failed: 0, waiting: false, complete: false, refreshed: [], results: [] };
  if (!db) return out;
  if (await weekComplete(week)) return { ...out, complete: true };
  const cfg = grokbotConfig();
  const send = opts.send ?? sendViaResend;
  const gap = opts.gapMs ?? PART_GAP_MS;
  const freshSince = opts.freshSince ?? chicagoInstant(chicagoParts(now).ymd, 5, 0);
  const anySent = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from grokbot_deliveries where kind = 'weekly_audit' and status = 'sent' and idempotency_key like ${`audit:${week}:part:%`}`));
  // refresh only before the first part goes out, so every part of one week's audit describes the same data
  if (Number(anySent[0]?.n ?? 0) === 0) {
    for (let pass = 0; pass < 4; pass++) {
      const g = await generateMissingSearchIntel(now, 12, { freshSince });
      out.refreshed.push(...g.generated);
      if (!g.remaining) break;
    }
  }
  const { houses, reports, ordered, blocks, parts, summary, complete } = await composeWeeklyAudit(now, week);
  out.sites = reports.length;
  out.parts = parts.length;
  if (!complete) {
    out.results.push({ part: 0, sites: [], status: "refused: a site section was missing or incomplete" });
    return out;
  }
  void houses;

  for (let n = 0; n < parts.length; n++) {
    const key = `audit:${week}:part:${n + 1}`;
    const names = parts[n]!.map((i) => ordered[i]!.name);
    const [row] = rowsOf<{ status: string; sent_at: string | null }>(await db.execute(sql`select status, sent_at from grokbot_deliveries where idempotency_key = ${key}`));
    if (row?.status === "sent") { out.alreadySent++; continue; }
    if (n > 0) {
      const [prev] = rowsOf<{ sent_at: string | null; status: string }>(await db.execute(sql`select status, sent_at from grokbot_deliveries where idempotency_key = ${`audit:${week}:part:${n}`}`));
      if (prev?.status !== "sent" || !prev.sent_at || now.getTime() - new Date(prev.sent_at).getTime() < gap) { out.waiting = true; break; }
    }
    const header = `GRAVYBLOCK WEEKLY AUDIT ${week}, PART ${n + 1} OF ${parts.length}: ${names.join(", ")}`;
    const text = scrubPersonal(`${header}\n\n${n === 0 ? `${summary}\n` : ""}${parts[n]!.map((i) => blocks[i]).join("")}\n`);
    const subject = `[GravyBlock Weekly Audit] ${week} — Part ${n + 1} of ${parts.length} (${names.length} site${names.length === 1 ? "" : "s"})`;
    if (containsSensitive(text)) {
      await db.execute(sql`insert into grokbot_deliveries (occurrence, idempotency_key, kind, status, subject, last_error) values (1, ${key}, 'weekly_audit', 'suppressed', ${subject}, 'looked like it contained a credential') on conflict (idempotency_key) do update set status = 'suppressed'`);
      out.results.push({ part: n + 1, sites: names, status: "suppressed" });
      break;
    }
    const c = await claim(key, null, subject);
    if (!c) { out.results.push({ part: n + 1, sites: names, status: "waiting (in flight or retry not due)" }); out.waiting = true; break; }
    const r = await send({ to: cfg.to, from: cfg.from, subject, text, html: "", idempotencyKey: key });
    await finish(c.id, r);
    out.results.push({ part: n + 1, sites: names, status: r.ok ? "sent" : "failed", resendEmailId: r.id, error: r.error, chars: text.length });
    if (!r.ok) { out.failed++; break; }
    out.sent++;
    if (n + 1 < parts.length) { out.waiting = true; break; } // the next part goes out on a later pass, at least the gap later
  }
  const [{ n: done }] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from grokbot_deliveries where kind = 'weekly_audit' and status = 'sent' and idempotency_key like ${`audit:${week}:part:%`}`));
  if (Number(done) >= parts.length) {
    await db.execute(sql`insert into grokbot_deliveries (occurrence, idempotency_key, kind, status, subject, sent_at) values (1, ${`audit:${week}:complete`}, 'weekly_audit', 'sent', ${`all ${parts.length} parts delivered`}, now()) on conflict (idempotency_key) do nothing`);
    out.complete = true;
  }
  return out;
}

/** Scheduler step, called every 30 seconds by the worker: refresh during Friday 05:00 Chicago, send from 06:00 (paced parts, retries until noon). */
export async function weeklyAuditTick(now = new Date()): Promise<{ phase: AuditPhase; result?: unknown }> {
  const phase = auditPhase(now);
  if (phase === "idle") return { phase };
  if (phase === "refresh") {
    const g = await generateMissingSearchIntel(now, 3, { freshSince: chicagoInstant(chicagoParts(now).ymd, 5, 0) });
    return { phase, result: g };
  }
  if (!getDb() || (await weekComplete(weekEndingFor(now)))) return { phase };
  return { phase, result: await sendWeeklyAudit(now) };
}

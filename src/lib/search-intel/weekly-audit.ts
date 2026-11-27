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

/** The full audit for one site, ending with the copy-ready instruction for its unresolved work. */
export function buildSiteAuditEmail(i: SiteAuditInput): { subject: string; text: string; buckets: Record<string, number> } {
  const d = i.report.data;
  const L: string[] = [];
  const buckets: Record<string, number> = {};
  L.push(`GRAVYBLOCK WEEKLY SEARCH & COMPETITOR AUDIT: ${i.report.name} (${d.site.website ?? ""})`);
  L.push(`Week ending ${i.week}. Site ${i.index} of ${i.total}. Generated ${d.generatedAt.slice(0, 16).replace("T", " ")} UTC from Google Search Console (read only) and public competitor pages.`);
  L.push("This audit reports status and gives instructions. It does not change any task, and an email is never treated as work done. GravyBlock never edits this site; only its own developer does. Completed work is verified read-only on the live site.");
  L.push("", "DATA QUALITY");
  const dq = [...d.status.notes, ...d.dataQualityNotes];
  L.push(...(dq.length ? dq.map((x) => `- ${x}`) : ["- Search Console data is complete for the windows used."]), "- Figures are Google search clicks and impressions only, not total website visitors.");
  L.push("", "PERFORMANCE");
  for (const [label, c] of [["Latest 7 days", d.w7], ["Latest 28 days", d.w28]] as const) {
    if (!c) { L.push(`- ${label}: unavailable`); continue; }
    L.push(`- ${label} (${c.cur.start} to ${c.cur.end}): ${c.cur.clicks} clicks (${sign(c.clicksChange)} vs the window before), ${c.cur.impressions} impressions (${sign(c.impressionsChange)}), CTR ${c.cur.ctr === null ? "n/a" : `${(c.cur.ctr * 100).toFixed(1)}%`}, average position ${c.cur.position ?? "n/a"}${c.sample !== "ok" ? ` [${c.sample} sample: not a trend]` : ""}`);
  }
  if (d.seasonal) L.push(`- Seasonality: ${d.seasonal.note}`);
  L.push(...d.changes.map((c) => `- Since last report: ${c}`));
  L.push("", ...moves("Rising queries (28 days)", d.queries28?.rising), ...moves("Declining queries (28 days)", d.queries28?.declining), ...moves("Pages gaining (28 days)", d.pages28?.rising), ...moves("Pages losing (28 days)", d.pages28?.declining));
  L.push("", "HIGH IMPRESSIONS, LOW CTR", ...(d.lowCtr.length ? d.lowCtr.slice(0, 6).map((x) => `- ${x.page} for "${x.query}": position ${x.position}, ${x.impressions} impressions, CTR ${(x.ctr * 100).toFixed(1)}% (about ${(x.expected * 100).toFixed(1)}% is normal)`) : ["- none"]));
  for (const [k, label] of [["b4_10", "4 to 10"], ["b11_20", "11 to 20"], ["b21_40", "21 to 40"]] as const) {
    const rows = d.bands?.[k] ?? [];
    L.push("", `QUERIES IN POSITIONS ${label}`, ...(rows.length ? rows.slice(0, 6).map((b) => `- "${b.query}": position ${b.position}, ${b.impressions} impressions, ${b.clicks} clicks, page ${b.page}`) : ["- none with enough impressions"]));
  }
  L.push("", "INDEXING");
  if (d.indexing.dropped) L.push(`- ${d.indexing.dropped.lost} of ${d.indexing.dropped.before} pages that earned impressions earlier earn none now (impressions ${d.indexing.dropped.impressionsBefore} to ${d.indexing.dropped.impressionsNow}).`);
  L.push(...d.indexing.rechecks.map((c) => `- Google URL Inspection ${c.at.slice(0, 10)}: ${Object.entries(c.verdicts).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ")}`));
  if (!d.indexing.dropped && !d.indexing.rechecks.length) L.push("- no indexing problem detected");
  L.push("", `COMPETITORS (public pages observed ${d.competitors.observedAt.slice(0, 10)}; covering a topic is not a ranking; competitor traffic and backlinks are not available)`);
  L.push(`- Known competitors: ${d.competitors.known.map((k) => k.website).join(", ") || "none on record"}`);
  for (const q of d.competitors.queries) {
    L.push(`- "${q.query}" (${q.impressions} impressions, position ${q.position}). Our page: ${q.ourPage?.url ?? "not compared"}`);
    for (const c of q.competitorPages) L.push(`    competitor: ${c.url} ("${c.title}", ${c.words} words${c.hasTool ? ", interactive tool" : ""}${c.hasFaqSchema ? ", FAQ markup" : ""}${c.tables ? `, ${c.tables} table(s)` : ""})`);
    for (const g of q.gaps) L.push(`    visible difference: ${g.evidence}`);
  }
  if (d.competitors.newPages.length) L.push(...d.competitors.newPages.map((p) => `- New competitor page since the previous observation: ${p.url} (first seen ${p.firstSeen.slice(0, 10)})`));
  L.push(...d.competitors.notes.map((n) => `- ${n}`));
  L.push("", "RECOMMENDATIONS BY STATUS (persistent IDs; an item emailed earlier is a status line here, not a new request)");
  const grouped = new Map<AuditBucket, string[]>();
  for (const r of i.queue) {
    const b = auditBucket(r, i.sent.has(r.id), i.previousAuditAt);
    if (!b) continue;
    buckets[b] = (buckets[b] ?? 0) + 1;
    const sentAt = i.sent.get(r.id);
    const extra = [r.occurrence > 1 ? `occurrence ${r.occurrence}` : "", sentAt ? `already sent to GrokBot ${sentAt.slice(0, 10)}` : "", r.copiedAt ? `prompt copied ${r.copiedAt.toISOString().slice(0, 10)}` : "", r.verification && r.status !== "verified" ? `live check: ${r.verification.note}` : "", r.outcome && r.outcome.verdict !== "too_early" ? `measured: ${r.outcome.verdict.replace(/_/g, " ")} (not proof of cause)` : ""].filter(Boolean).join("; ");
    (grouped.get(b) ?? grouped.set(b, []).get(b)!).push(`  - ${r.ref} ${r.title}${extra ? ` (${extra})` : ""}`);
  }
  for (const b of AUDIT_ORDER) if (grouped.get(b)?.length) L.push(`${b} (${grouped.get(b)!.length}):`, ...grouped.get(b)!);
  if (!grouped.size) L.push("- no recommendations on record for this site");
  const unresolved = unresolvedImprovements(i.queue, i.now);
  L.push("", "=================== COPY-READY DEVELOPMENT INSTRUCTION for unresolved work (Claude / Cursor / GrokBot): copy everything between the lines ===================");
  L.push(buildPrompt(d, unresolved));
  L.push("=================== END OF INSTRUCTION ===================");
  L.push("", "REPORT BACK: for each recommendation ID you act on, the commit SHA and changed URLs. GravyBlock re-checks the live pages read-only and measures search results separately.");
  const text = scrubPersonal(L.join("\n"));
  return { subject: `[GravyBlock Weekly Audit] ${i.week} — ${i.report.name} (${i.index} of ${i.total})`, text, buckets };
}

const html = (text: string) => `<pre style="font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;color:#18181b">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`;

type Delivery = { id: string; status: string; attempts: number };

async function claim(key: string, businessId: string | null, subject: string): Promise<Delivery | null> {
  const db = getDb()!;
  await db.execute(sql`insert into grokbot_deliveries (recommendation_id, business_id, occurrence, idempotency_key, kind, status, subject) values (null, ${businessId}, 1, ${key}, 'weekly_audit', 'pending', ${subject}) on conflict (idempotency_key) do nothing`);
  const [d] = rowsOf<Delivery>(await db.execute(sql`update grokbot_deliveries set status = 'sending', attempts = attempts + 1, updated_at = now(), subject = ${subject}
    where idempotency_key = ${key} and attempts < 6 and (status in ('pending', 'failed') or (status = 'sending' and updated_at < now() - interval '15 minutes')) returning id, status, attempts`));
  return d ?? null;
}

async function finish(id: string, r: { ok: boolean; id?: string; error?: string }) {
  const db = getDb()!;
  if (r.ok) await db.execute(sql`update grokbot_deliveries set status = 'sent', sent_at = now(), resend_email_id = ${r.id ?? null}, last_error = null, updated_at = now() where id = ${id}::uuid`);
  else await db.execute(sql`update grokbot_deliveries set status = 'failed', last_error = ${r.error ?? "send failed"}, updated_at = now() where id = ${id}::uuid`);
}

export type AuditResult = { week: string; sites: number; sent: number; alreadySent: number; failed: number; suppressed: number; summarySent: boolean; refreshed: string[]; results: Array<{ site: string; status: string; resendEmailId?: string; error?: string }> };

/**
 * Sends this week's audit: per-site emails first, then the portfolio summary. Safe to call repeatedly: sent emails are skipped, failed ones retried.
 * `freshSince` forces any report older than that instant to be regenerated before sending.
 */
export async function sendWeeklyAudit(now = new Date(), opts: { send?: SendFn; freshSince?: Date; spacingMs?: number } = {}): Promise<AuditResult> {
  const db = getDb();
  const week = weekEndingFor(now);
  const out: AuditResult = { week, sites: 0, sent: 0, alreadySent: 0, failed: 0, suppressed: 0, summarySent: false, refreshed: [], results: [] };
  if (!db) return out;
  const cfg = grokbotConfig();
  const send = opts.send ?? sendViaResend;
  const spacing = opts.spacingMs ?? 700; // comfortably under Resend's per-second limit
  const freshSince = opts.freshSince ?? chicagoInstant(chicagoParts(now).ymd, 5, 0);
  for (let pass = 0; pass < 4; pass++) {
    const g = await generateMissingSearchIntel(now, 12, { freshSince });
    out.refreshed.push(...g.generated);
    if (!g.remaining) break;
  }
  const houses = await listHouseAccounts();
  const reports = await loadReports(week);
  out.sites = reports.length;
  const ordered = houses.map((h) => reports.find((r) => r.businessId === h.id)).filter((r): r is StoredReport => !!r);
  const summaryLines: string[] = [];
  let idx = 0;
  for (const report of ordered) {
    idx++;
    const key = `audit:${week}:${report.businessId}`;
    const [prev] = rowsOf<{ sent_at: string }>(await db.execute(sql`select sent_at from grokbot_deliveries where kind = 'weekly_audit' and business_id = ${report.businessId} and status = 'sent' and idempotency_key <> ${key} order by sent_at desc limit 1`));
    const sentRows = rowsOf<{ recommendation_id: string; sent_at: string }>(await db.execute(sql`select recommendation_id, sent_at from grokbot_deliveries where business_id = ${report.businessId} and kind in ('new', 'reopened') and status = 'sent'`));
    const queue = await loadQueue(report.businessId);
    // only this occurrence's own send counts as handed off
    const sent = new Map<string, string>();
    for (const s of sentRows) {
      const rec = queue.find((q) => q.id === s.recommendation_id);
      const began = rec ? (rec.occurrence > 1 ? rec.reopenedAt : rec.firstSeenAt) : null;
      if (rec && (!began || new Date(s.sent_at) >= began)) sent.set(s.recommendation_id, new Date(s.sent_at).toISOString());
    }
    const email = buildSiteAuditEmail({ report, queue, sent, previousAuditAt: prev ? new Date(prev.sent_at) : null, index: idx, total: ordered.length, week, now });
    summaryLines.push(`- ${report.name}: ${Object.entries(email.buckets).map(([b, n]) => `${b} ${n}`).join(", ") || "no recommendations"}; 28-day clicks ${report.data.w28?.cur.clicks ?? "n/a"}${report.data.w28 ? ` (${sign(report.data.w28.clicksChange)})` : ""}`);
    const [done] = rowsOf<{ status: string }>(await db.execute(sql`select status from grokbot_deliveries where idempotency_key = ${key}`));
    if (done?.status === "sent") { out.alreadySent++; out.results.push({ site: report.name, status: "already sent" }); continue; }
    if (containsSensitive(email.text)) {
      await db.execute(sql`insert into grokbot_deliveries (business_id, occurrence, idempotency_key, kind, status, subject, last_error) values (${report.businessId}, 1, ${key}, 'weekly_audit', 'suppressed', ${email.subject}, 'looked like it contained a credential') on conflict (idempotency_key) do update set status = 'suppressed'`);
      out.suppressed++;
      out.results.push({ site: report.name, status: "suppressed" });
      continue;
    }
    const c = await claim(key, report.businessId, email.subject);
    if (!c) { out.results.push({ site: report.name, status: "not claimable (in flight or out of attempts)" }); continue; }
    const r = await send({ to: cfg.to, from: cfg.from, subject: email.subject, text: email.text, html: html(email.text), idempotencyKey: key });
    await finish(c.id, r);
    if (r.ok) out.sent++;
    else out.failed++;
    out.results.push({ site: report.name, status: r.ok ? "sent" : "failed", resendEmailId: r.id, error: r.error });
    await new Promise((res) => setTimeout(res, spacing));
  }
  // portfolio summary last, so it can say what was delivered
  const s = summarizePortfolio(reports, houses.map((h) => h.name), week);
  const summaryKey = `audit:${week}:summary`;
  const [sDone] = rowsOf<{ status: string }>(await db.execute(sql`select status from grokbot_deliveries where idempotency_key = ${summaryKey}`));
  if (sDone?.status !== "sent") {
    const text = scrubPersonal([
      `GRAVYBLOCK WEEKLY SEARCH & COMPETITOR AUDIT: PORTFOLIO SUMMARY, week ending ${week}`,
      `${ordered.length} site audits are sent as separate emails with the subject "[GravyBlock Weekly Audit] ${week} — <site> (n of ${ordered.length})". Each contains the full audit and a copy-ready development instruction for that site's own developer.`,
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
    ].join("\n"));
    const c = await claim(summaryKey, null, `[GravyBlock Weekly Audit] ${week} — Portfolio summary (${ordered.length} sites)`);
    if (c) {
      const r = await send({ to: cfg.to, from: cfg.from, subject: `[GravyBlock Weekly Audit] ${week} — Portfolio summary (${ordered.length} sites)`, text, html: html(text), idempotencyKey: summaryKey });
      await finish(c.id, r);
      out.summarySent = r.ok;
      out.results.push({ site: "PORTFOLIO SUMMARY", status: r.ok ? "sent" : "failed", resendEmailId: r.id, error: r.error });
      if (r.ok) out.sent++;
      else out.failed++;
    }
  } else out.summarySent = true;
  return out;
}

/** Scheduler step, called every 30 seconds by the worker: refresh during Friday 05:00 Chicago, send from 06:00 (retrying until noon). */
export async function weeklyAuditTick(now = new Date()): Promise<{ phase: AuditPhase; result?: unknown }> {
  const phase = auditPhase(now);
  if (phase === "idle") return { phase };
  if (phase === "refresh") {
    const g = await generateMissingSearchIntel(now, 3, { freshSince: chicagoInstant(chicagoParts(now).ymd, 5, 0) });
    return { phase, result: g };
  }
  const db = getDb();
  if (!db) return { phase };
  const week = weekEndingFor(now);
  const houses = await listHouseAccounts();
  const [{ n }] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from grokbot_deliveries where kind = 'weekly_audit' and status in ('sent', 'suppressed') and idempotency_key like ${`audit:${week}:%`}`));
  if (Number(n) >= houses.length + 1) return { phase }; // everything for this week already delivered
  return { phase, result: await sendWeeklyAudit(now) };
}

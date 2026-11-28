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

import { profileFor } from "./profiles";

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

export type SiteAuditInput = { report: StoredReport; queue: RecRecord[]; sent: Map<string, string>; previousAuditAt: Date | null; index: number; total: number; week: string; now: Date };

/**
 * One site's section of the weekly audit (v3), in the owner's order:
 * A search performance, B biggest opportunities, C missing search demand, D competitor intelligence, E recommended actions, F the complete development
 * instruction, G previous work and results, H confidence and measurement. Concise on purpose: no repeated checklists.
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
  const SURFACE: Record<string, string> = { web: "Web", image: "Image search", video: "Video search", news: "News tab", discover: "Discover", googleNews: "Google News", webMultimodal: "Lens / Circle to Search" };

  L.push(`GRAVYBLOCK WEEKLY GROWTH AUDIT: ${i.report.name} (${d.site.website ?? ""}), week ending ${i.week}`);
  if (deep?.profile) L.push(`What the site is for: ${deep.profile.what}. Audience: ${deep.profile.audience}. Conversions that matter: ${deep.profile.conversions.join("; ")}.`);
  const prof = profileFor(i.report.name);
  if (prof?.priorities?.length) L.push(`Growth priorities, in order: ${prof.priorities.join("; ")}.`);
  L.push("Nothing here changes a task's status, and GravyBlock never edits this site.");

  // A
  L.push("", "A. SEARCH PERFORMANCE (Google search only, not total visitors; each line names its window)");
  if (d.w7) L.push(`${tot("7 days", d.w7.cur, d.w7.prev)} vs the 7 days before${d.w7.sample !== "ok" ? ` [${d.w7.sample} sample: not a trend]` : ""}`);
  if (d.w28) L.push(`${tot("28 days", d.w28.cur, d.w28.prev)} vs the 28 days before${d.w28.sample !== "ok" ? ` [${d.w28.sample} sample: not a trend]` : ""}`);
  if (!d.w7 && !d.w28) L.push("- No Search Console data for this site this week.");
  if (deep) {
    L.push(deep.trend90 ? `${tot("90 days", deep.trend90.cur, deep.trend90.prev)} vs the 90 days before` : "- 90 days: not enough stored history for a 90-day comparison yet.");
    const gb = deep.googleBrand;
    if (gb?.source === "Google branded classification") L.push(`- Branded vs non-branded (Google's own classification, 28 days): branded ${gb.branded?.clicks ?? 0} clicks / ${gb.branded?.impressions ?? 0} impressions; non-branded ${gb.nonBranded?.clicks ?? 0} clicks / ${gb.nonBranded?.impressions ?? 0} impressions.`);
    else if (deep.brand.brandedImpressions + deep.brand.nonBrandedImpressions > 0) L.push(`- Branded vs non-branded (estimate from the site name; Google does not classify this property): brand ${deep.brand.brandedClicks} clicks / ${deep.brand.brandedImpressions} impressions; non-brand ${deep.brand.nonBrandedClicks} clicks / ${deep.brand.nonBrandedImpressions} impressions.`);
    if (deep.devices.length) L.push(`- Devices (28 days): ${deep.devices.map((x) => `${x.key.toLowerCase()} ${x.clicks} clicks / ${x.impressions} impressions, CTR ${(x.ctr * 100).toFixed(1)}%, position ${x.position}`).join("; ")}.`);
    if (deep.countries.length) L.push(`- Top countries (28 days): ${deep.countries.slice(0, 4).map((x) => `${x.key.toUpperCase()} ${x.impressions} impressions`).join(", ")}.`);
    if (deep.surfaces?.length) L.push(`- Search surfaces (28 days vs the 28 before): ${deep.surfaces.map((x) => `${SURFACE[x.key] ?? x.key} ${x.clicks} clicks (${sign(x.clicks - x.clicksPrev)}) / ${x.impressions} impressions (${sign(x.impressions - x.impressionsPrev)})`).join("; ")}.`);
    else {
      const st = [deep.searchTypes.image, deep.searchTypes.video].filter((x) => x && x.impressions > 0);
      L.push(st.length ? `- Image and video search (28 days): ${st.map((x) => `${x!.key} ${x!.clicks} clicks / ${x!.impressions} impressions`).join("; ")}.` : "- Image and video search (28 days): no impressions.");
    }
    if (deep.appearances?.length) L.push(`- Search appearances / rich results (28 days): ${deep.appearances.slice(0, 5).map((x) => `${x.key.replace(/_/g, " ").toLowerCase()} ${x.impressions} impressions, ${x.clicks} clicks`).join("; ")}.`);
    if (d.bands) L.push(`- Rankings by band (28 days, queries with 10+ impressions): positions 4 to 10: ${d.bands.b4_10.length}${d.bands.b4_10[0] ? ` (biggest "${d.bands.b4_10[0].query}", ${d.bands.b4_10[0].impressions})` : ""}; 11 to 20: ${d.bands.b11_20.length}${d.bands.b11_20[0] ? ` (biggest "${d.bands.b11_20[0].query}", ${d.bands.b11_20[0].impressions})` : ""}; 21 to 40: ${d.bands.b21_40.length}.`);
    const bigTopics = deep.clusters.filter((c) => c.impressions >= 20);
    if (bigTopics.length) L.push(`- Biggest search topics (28 days): ${bigTopics.slice(0, 4).map((c) => `"${c.label}" ${c.impressions} impressions at position ${c.position} (${c.intent})`).join("; ")}.`);
    if (deep.queries90 && (deep.queries90.gaining.length || deep.queries90.losing.length)) L.push(`- 90-day movement (${deep.queries90.window.start} to ${deep.queries90.window.end} vs the 90 before): gaining ${deep.queries90.gaining.slice(0, 3).map((q) => `"${q.key}" ${q.imprPrev} to ${q.imprCur}`).join(", ") || "none"}; losing ${deep.queries90.losing.slice(0, 3).map((q) => `"${q.key}" ${q.imprPrev} to ${q.imprCur}`).join(", ") || "none"} (impressions).`);
    if (deep.emerging.length) L.push(`- New searches this window: ${deep.emerging.slice(0, 4).map((q) => `"${q.key}" (${q.impressions})`).join(", ")}.`);
    if (deep.templateLosses?.length) L.push(`- Sections losing visibility together: ${deep.templateLosses.slice(0, 3).map((x) => `${x.section} ${x.impressionsPrev} to ${x.impressions} impressions across ${x.pagesPrev} to ${x.pages} pages`).join("; ")}.`);
    else if (deep.sections.length) L.push(`- By site section (28 days vs the 28 before): ${deep.sections.slice(0, 3).map((x) => `${x.section} ${x.clicks} clicks (was ${x.clicksPrev}), ${x.impressions} impressions (was ${x.impressionsPrev})`).join("; ")}.`);
  }
  const limits = [...d.status.notes, ...d.dataQualityNotes];
  if (limits.length) L.push(`- Data limits: ${limits.join(" ")}`);

  // B
  const unresolved = unresolvedImprovements(i.queue, i.now);
  L.push("", `B. BIGGEST SEARCH OPPORTUNITIES (${unresolved.length}, ranked by likely business impact: realistic extra visitors x likelihood x business value / effort)`);
  if (!unresolved.length) L.push("- None with enough evidence this week. The instruction below asks for validation instead of inventing work.");
  unresolved.forEach((u, n) => {
    L.push(`${n + 1}. [${u.ref}] ${u.title}`);
    L.push(`   ${(u.category ?? u.kind.replace(/_/g, " ")).toUpperCase()}${u.horizon ? ` | ${u.horizon}` : ""}${u.confidence ? ` | confidence ${u.confidence}` : ""}${u.scope && u.scope !== "page" ? ` | affects the whole ${u.scope}` : ""}`);
    if (u.why) L.push(`   Why it brings more visitors: ${u.why}`);
    if (u.evidence[0]) L.push(`   Evidence: ${u.evidence[0]}`);
    L.push(`   Expected benefit: ${u.potentialClicks28 > 0 ? `up to about ${u.potentialClicks28} more Google clicks per 28 days (an estimate from impressions and typical click rates, not a forecast)` : "size unknown: no free source gives search volume, so no number is claimed"}`);
    const sentAt = i.sent.get(i.queue.find((q) => q.ref === u.ref)?.id ?? "");
    if (sentAt) L.push(`   Already sent to GrokBot on ${sentAt.slice(0, 10)}: this is the same request, not a new one.`);
  });

  // C
  L.push("", `C. MISSING SEARCH DEMAND (${deep?.demand.source ?? "public autocomplete"}, checked ${deep?.demand.checkedAt.slice(0, 10) ?? "n/a"}; proves people type these, not how many)`);
  if (deep?.demand.uncaptured.length) {
    for (const g of deep.demand.uncaptured.slice(0, 5)) {
      const ex = g.existingPage;
      L.push(`- "${g.label}"${g.strength ? ` [demand ${g.strength.score}/5, ${g.strength.level}]` : ""}: ${g.queries.slice(1, 4).map((q) => `"${q}"`).join(", ")}${ex ? `. Existing page: ${pathOf(ex.url)} (${ex.covers ? "already covers it; a visibility problem" : "closest page; expand it"})` : ". No page of the site serves it yet"}.`);
    }
  } else L.push(`- ${deep?.demand.notes[0] ?? "Not researched this week."}`);
  const sa = deep?.seasonalAhead;
  if (sa?.queries.length) L.push(`- Coming season (searches that earned impressions ${sa.window.start} to ${sa.window.end} last year, not yet this year): ${sa.queries.slice(0, 5).map((q) => `"${q.query}" ${q.impressionsLastYear} last year`).join(", ")}.`);
  else if (sa) L.push(`- Coming season: ${sa.note}`);
  if (deep?.inventory) L.push(`- Checked against the site's own ${deep.inventory.pages} sitemap pages, so existing pages are expanded before anything new is built.`);

  // D
  L.push("", `D. COMPETITOR INTELLIGENCE (public pages observed ${d.competitors.observedAt.slice(0, 10)}; a published page is not a ranking; competitor traffic and backlinks are not available)`);
  L.push(d.competitors.known.length ? `- Relevant competitors: ${(deep?.competitorFilter.kept.length ? deep.competitorFilter.kept.map((k) => k.replace(/ \(.*$/, "")) : d.competitors.known.map((k) => k.website)).join(", ")}` : "- No relevant competitor confirmed this week.");
  if (deep?.competitorFilter.rejected.length) L.push(`- Rejected as not genuinely competing: ${deep.competitorFilter.rejected.slice(0, 6).map((r) => r.site).join(", ")}.`);
  for (const it of (deep?.intents ?? []).filter((x) => x.competitorPages.length || x.weDoBetter.length).slice(0, 4)) {
    L.push(`- Intent "${it.label}"${it.position ? ` (ours at position ${it.position}${it.ourUrl ? ` with ${pathOf(it.ourUrl)}` : ""})` : it.ourUrl ? ` (ours: ${pathOf(it.ourUrl)})` : " (no page of ours yet)"}:`);
    for (const p of it.competitorPages) L.push(`    ${p.url} "${p.title.slice(0, 70)}" (about ${p.words} words${p.hasTool ? ", interactive tool" : ""}${p.tables ? `, ${p.tables} table(s)` : ""}${p.hasFaqSchema ? ", FAQ markup" : ""})`);
    if (it.theyCover.length) L.push(`    They cover, we do not: ${it.theyCover.slice(0, 3).map((x) => x.replace(/ \(https?:[^)]+\)$/, "")).join("; ")}`);
    if (it.weDoBetter.length) L.push(`    We already do better: ${it.weDoBetter.join("; ")}`);
  }
  if (d.competitors.newPages.length) L.push(`- New competitor pages since the previous observation: ${d.competitors.newPages.slice(0, 4).map((p) => p.url).join(", ")}.`);
  if (deep?.partners?.length) L.push(`- Listing and partnership prospects already qualified (owner action only; unsolicited outreach stays paused): ${deep.partners.slice(0, 3).map((p) => `${p.name} ${p.url} (found ${p.foundAt})`).join("; ")}.`);

  // E
  L.push("", "E. RECOMMENDED ACTIONS (what to improve, build, consolidate or promote)");
  const verb = (u: (typeof unresolved)[number]) =>
    u.kind === "cannibalization" ? "CONSOLIDATE" : u.kind === "indexing" || u.kind === "template_loss" ? "FIX" : u.kind === "new_demand" && /^Capture/.test(u.title) ? "BUILD" : u.kind === "conversion" ? "CONVERT" : "IMPROVE";
  if (!unresolved.length) L.push("- Validate the site's top intents (see the instruction) before any new work.");
  unresolved.forEach((u) => L.push(`- ${verb(u)} [${u.ref}]: ${u.actions[0] ?? u.title}`));
  if (deep?.partners?.length) L.push("- PROMOTE: list the site on the qualified listing pages above where the owner judges it appropriate; GravyBlock's off-site promotion continues for permitted channels only.");

  // F
  L.push("", "F. =================== COMPLETE DEVELOPMENT INSTRUCTION (route to this site's own developer; copy everything between the lines) ===================");
  const done = i.queue.filter((r) => r.status === "verified" || r.status === "completed").map((r) => `[${r.ref}] ${r.title}${r.verification?.deployed ? " (confirmed live)" : ""}`);
  L.push(buildPrompt(d, unresolved, done));
  L.push("=================== END OF INSTRUCTION ===================");

  // G
  L.push("", "G. PREVIOUS WORK AND RESULTS (persistent IDs; live checks are read only; search results measured separately and never assumed to be caused by the change)");
  const grouped = new Map<AuditBucket, string[]>();
  for (const r of i.queue) {
    const b = auditBucket(r, i.sent.has(r.id), i.previousAuditAt);
    if (!b) continue;
    buckets[b] = (buckets[b] ?? 0) + 1;
    (grouped.get(b) ?? grouped.set(b, []).get(b)!).push(r.ref);
  }
  for (const b of AUDIT_ORDER) if (grouped.get(b)?.length && !["VERIFIED", "COMPLETED"].includes(b)) L.push(`- ${b}: ${grouped.get(b)!.join(", ")}`);
  const doneRecs = i.queue.filter((r) => r.status === "verified" || r.status === "completed").sort((a, b) => (b.verifiedAt ?? b.completedAt ?? b.lastSeenAt).getTime() - (a.verifiedAt ?? a.completedAt ?? a.lastSeenAt).getTime());
  if (!doneRecs.length) L.push("- No completed work on record yet.");
  for (const r of doneRecs.slice(0, 6)) {
    const when = (r.verifiedAt ?? r.completedAt)?.toISOString().slice(0, 10) ?? "";
    const live = r.status === "verified" ? `live since ${when}${/Detected live/.test(r.verification?.note ?? "") ? " (implemented outside GravyBlock, detected on the live site)" : ""}` : `completed ${when}, ${r.verification?.deployed === false ? "not yet visible on the live site" : "awaiting the live check"}`;
    const res = r.outcome && r.outcome.verdict !== "too_early" ? `Google result: ${r.outcome.verdict.replace(/_/g, " ")} (${r.outcome.before?.clicks ?? "n/a"} to ${r.outcome.after?.clicks ?? "n/a"} clicks over equal 28-day windows; not proof of cause)` : "Google result: measured once 28 days have passed";
    L.push(`- [${r.ref}] ${r.title}: ${live}. ${res}.`);
  }

  // H
  L.push("", "H. CONFIDENCE AND MEASUREMENT");
  unresolved.forEach((u) => L.push(`- [${u.ref}] confidence ${u.confidence ?? "not rated"}. ${u.uncertainty ? `Uncertain: ${u.uncertainty} ` : ""}Measured by: ${u.measure ?? "the affected pages' Google clicks over 28 days before and after"}.`));
  L.push("- A deployed change is confirmed by a read-only check of the live page; a traffic result is reported only after 28 days of data and is never claimed as caused by the change.");
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
async function keySent(key: string): Promise<boolean> {
  const db = getDb()!;
  const [x] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from grokbot_deliveries where status = 'sent' and idempotency_key = ${key}`));
  return Number(x?.n ?? 0) > 0;
}

async function weekComplete(week: string): Promise<boolean> {
  const db = getDb()!;
  const [x] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from grokbot_deliveries where kind = 'weekly_audit' and status = 'sent' and idempotency_key in (${`audit:${week}:complete`}, ${`audit:${week}:summary`})`));
  return Number(x?.n ?? 0) > 0;
}

/** Builds this week's audit (summary, one section per site, parts) from the stored reports without sending or writing anything. */
export async function composeWeeklyAudit(now: Date, week: string, ownPrefix = `audit:${week}`) {
  const db = getDb()!;
  const houses = await listHouseAccounts();
  const reports = await loadReports(week);
  
  const ordered = houses.map((h) => reports.find((r) => r.businessId === h.id)).filter((r): r is StoredReport => !!r);
  const [prevAudit] = rowsOf<{ at: string | null }>(await db.execute(sql`select max(sent_at) at from grokbot_deliveries where kind = 'weekly_audit' and status = 'sent' and idempotency_key not like ${`${ownPrefix}:%`}`));
  const previousAuditAt = prevAudit?.at ? new Date(prevAudit.at) : null;
  const blocks: string[] = [];
  const summaryLines: string[] = [];
  const best: Array<{ site: string; title: string; priority: number; horizon?: string; ref?: string }> = [];
  const learned: string[] = [];
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
    const top = unresolvedImprovements(queue, now)[0];
    if (top) best.push({ site: report.name, title: top.title, priority: top.priority, horizon: top.horizon, ref: top.ref });
    for (const r of queue.filter((q) => q.outcome && q.outcome.verdict !== "too_early" && q.outcome.verdict !== "low_sample")) learned.push(`- ${report.name} [${r.ref}] ${r.kind.replace(/_/g, " ")}: ${r.outcome!.verdict.replace(/_/g, " ")} (${r.outcome!.before?.clicks ?? "n/a"} to ${r.outcome!.after?.clicks ?? "n/a"} clicks)`);
    // Fewer links per message: the site's own URLs are written as paths under one stated base (the 27 Nov audits carried 37 to 87 full URLs each).
    const base = siteBase(report.data.site.website);
    blocks.push(`\n\n######## SITE ${idx} OF ${ordered.length}: ${report.name} ########\n${base ? `All paths in this section are on ${base}\n` : ""}\n${base ? relativize(email.text, base) : email.text}`);
    summaryLines.push(`- ${report.name}: ${Object.entries(email.buckets).map(([b, n]) => `${b} ${n}`).join(", ") || "no recommendations"}; 28-day clicks ${report.data.w28?.cur.clicks ?? "n/a"}${report.data.w28 ? ` (${sign(report.data.w28.clicksChange)})` : ""}`);
  }
  // three parts as before: the part size grows with the audit (never past 90,000 characters, well under Gmail's clipping size), so a fuller audit stays in three
  const totalChars = blocks.reduce((n, b) => n + b.length, 0);
  const parts = packParts(blocks, Math.min(90_000, Math.max(PART_LIMIT_CHARS, Math.ceil(totalChars / 3) + 6_000)));
  
  // Every site's section must land in exactly one part with its instruction, so nothing disappears when the audit is split. Refuse to send otherwise.
  const placed = parts.flat().sort((a, b) => a - b);
  if (placed.length !== blocks.length || placed.some((v, i) => v !== i) || blocks.some((b) => !b.includes("COMPLETE DEVELOPMENT INSTRUCTION"))) {
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
    "Top priorities this week (each site's best unresolved opportunity; completed and verified work is never listed):",
    ...best.sort((a, b) => b.priority - a.priority).slice(0, 5).map((p, n) => `${n + 1}. ${p.site}: ${p.title}${p.horizon ? ` (${p.horizon})` : ""}${p.ref ? ` [${p.ref}]` : ""}`),
    "",
    "What earlier work did in Google (equal 28-day windows before and after; a measured change, not proof of cause; future ranking leans slightly toward kinds of work that measured well):",
    ...(learned.length ? learned.slice(0, 8) : ["- No completed work has 28 days of after-data yet."]),
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
export async function sendWeeklyAudit(now = new Date(), opts: { send?: SendFn; freshSince?: Date; gapMs?: number; batch?: string } = {}): Promise<AuditResult> {
  const db = getDb();
  const week = weekEndingFor(now);
  const out: AuditResult = { week, sites: 0, parts: 0, sent: 0, alreadySent: 0, failed: 0, waiting: false, complete: false, refreshed: [], results: [] };
  if (!db) return out;
  // An owner-authorized resend uses its own key prefix, so the weekly keys (and the Friday schedule) are untouched and the resend itself sends at most once.
  const prefix = opts.batch ? `audit:resend:${opts.batch}` : `audit:${week}`;
  if (opts.batch ? await keySent(`${prefix}:complete`) : await weekComplete(week)) return { ...out, complete: true };
  const cfg = grokbotConfig();
  const send = opts.send ?? sendViaResend;
  const gap = opts.gapMs ?? PART_GAP_MS;
  const freshSince = opts.freshSince ?? chicagoInstant(chicagoParts(now).ymd, 5, 0);
  const anySent = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from grokbot_deliveries where kind = 'weekly_audit' and status = 'sent' and idempotency_key like ${`${prefix}:part:%`}`));
  // refresh only before the first part goes out, so every part of one week's audit describes the same data
  if (Number(anySent[0]?.n ?? 0) === 0) {
    for (let pass = 0; pass < 4; pass++) {
      const g = await generateMissingSearchIntel(now, 12, { freshSince });
      out.refreshed.push(...g.generated);
      if (!g.remaining) break;
    }
  }
  const { houses, reports, ordered, blocks, parts, summary, complete } = await composeWeeklyAudit(now, week, prefix);
  out.sites = reports.length;
  out.parts = parts.length;
  if (!complete) {
    out.results.push({ part: 0, sites: [], status: "refused: a site section was missing or incomplete" });
    return out;
  }
  void houses;

  for (let n = 0; n < parts.length; n++) {
    const key = `${prefix}:part:${n + 1}`;
    const names = parts[n]!.map((i) => ordered[i]!.name);
    const [row] = rowsOf<{ status: string; sent_at: string | null }>(await db.execute(sql`select status, sent_at from grokbot_deliveries where idempotency_key = ${key}`));
    if (row?.status === "sent") { out.alreadySent++; continue; }
    if (n > 0) {
      const [prev] = rowsOf<{ sent_at: string | null; status: string }>(await db.execute(sql`select status, sent_at from grokbot_deliveries where idempotency_key = ${`${prefix}:part:${n}`}`));
      if (prev?.status !== "sent" || !prev.sent_at || now.getTime() - new Date(prev.sent_at).getTime() < gap) { out.waiting = true; break; }
    }
    const header = `GRAVYBLOCK WEEKLY AUDIT ${week}, PART ${n + 1} OF ${parts.length}: ${names.join(", ")}`;
    const text = scrubPersonal(`${header}\n\n${n === 0 ? `${summary}\n` : ""}${parts[n]!.map((i) => blocks[i]).join("")}\n`);
    const subject = `[GravyBlock Weekly Audit] ${week}${opts.batch ? ` — authorized resend ${opts.batch}` : ""} — Part ${n + 1} of ${parts.length} (${names.length} site${names.length === 1 ? "" : "s"})`;
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
  const [{ n: done }] = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from grokbot_deliveries where kind = 'weekly_audit' and status = 'sent' and idempotency_key like ${`${prefix}:part:%`}`));
  if (Number(done) >= parts.length) {
    await db.execute(sql`insert into grokbot_deliveries (occurrence, idempotency_key, kind, status, subject, sent_at) values (1, ${`${prefix}:complete`}, 'weekly_audit', 'sent', ${`all ${parts.length} parts delivered`}, now()) on conflict (idempotency_key) do nothing`);
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

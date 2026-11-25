/**
 * Weekly search and competitor intelligence: generation, storage and the portfolio roll-up used by the Friday email and the admin pages.
 * Read-only toward every site. Customer reports are prepared (tenant-scoped builder) but not enabled; see searchIntelEligible.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { listHouseAccounts } from "@/lib/house";
import { gatherSearchIntel, weekEndingFor } from "./gather";
import { buildPrompt, candidateImprovements, deriveImprovements } from "./prompt";
import { collectEmailItems, loadQueue, markEmailed, measureOutcomes, syncRecommendations, unresolvedImprovements, verifyCompleted, type EmailItem } from "./recommendations";
import { BUCKET_LABEL, type EmailBucket } from "./recommendation-model";
import type { Improvement, SiteIntel } from "./types";

type Rows<T> = T[];
const rowsOf = <T>(r: unknown) => r as unknown as Rows<T>;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
export const reportLink = (businessId: string) => `${SITE_URL}/admin/house/search-reports/${businessId}`;

export async function generateSearchIntelForSite(businessId: string, now = new Date()): Promise<{ ok: boolean; reason?: string; weekEnding?: string; improvements?: number; sync?: Awaited<ReturnType<typeof syncRecommendations>> }> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const intel = await gatherSearchIntel(businessId, now);
  if (!intel) return { ok: false, reason: "not_eligible_or_missing" };
  // Recommendations are persistent: this updates existing ones, creates only genuinely new ones, and the prompt is built from UNRESOLVED stored work.
  const sync = await syncRecommendations(businessId, candidateImprovements(intel), intel.weekEnding, now);
  const improvements = unresolvedImprovements(await loadQueue(businessId), now);
  const prompt = buildPrompt(intel, improvements);
  await db.execute(sql`insert into search_intel_reports (business_id, week_ending, data, prompt) values (${businessId}, ${intel.weekEnding}, ${JSON.stringify(intel)}::jsonb, ${prompt})
    on conflict (business_id, week_ending) do update set data = excluded.data, prompt = excluded.prompt, created_at = now()`);
  return { ok: true, weekEnding: intel.weekEnding, improvements: improvements.length, sync };
}

/**
 * The daily change check (no email): refresh Search Console history, re-derive findings from the latest data, update persistent recommendations (new ones are recorded
 * silently), re-check completed work on the live pages, and measure outcomes that have matured. Reports are still generated and emailed once a week.
 */
export async function runDailySearchIntel(businessId: string, now = new Date()): Promise<{ ok: boolean; sync?: Awaited<ReturnType<typeof syncRecommendations>>; verified?: number; measured?: number; reason?: string }> {
  const intel = await gatherSearchIntel(businessId, now, { competitors: false });
  if (!intel) return { ok: false, reason: "not_eligible_or_missing" };
  const sync = await syncRecommendations(businessId, candidateImprovements(intel), intel.weekEnding, now);
  const v = await verifyCompleted(businessId, now);
  const m = await measureOutcomes(businessId, now);
  return { ok: true, sync, verified: v.verified, measured: m.measured };
}

/** Generates reports for house sites that do not yet have one for this week, a few at a time so a worker pass stays short. */
export async function generateMissingSearchIntel(now = new Date(), maxSites = 2): Promise<{ generated: string[]; remaining: number }> {
  const db = getDb();
  if (!db) return { generated: [], remaining: 0 };
  const week = weekEndingFor(now);
  const houses = await listHouseAccounts();
  // A report built earlier in the week is refreshed once it is over 18 hours old, so the Friday email always carries data from the day before it goes out.
  const have = new Set(rowsOf<{ business_id: string }>(await db.execute(sql`select business_id from search_intel_reports where week_ending = ${week} and created_at > now() - interval '18 hours'`)).map((r) => r.business_id));
  const todo = houses.filter((h) => !have.has(h.id));
  const generated: string[] = [];
  for (const h of todo.slice(0, maxSites)) {
    try {
      const r = await generateSearchIntelForSite(h.id, now);
      if (r.ok) generated.push(h.name);
    } catch (err) {
      console.error("[search-intel] site failed", { site: h.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { generated, remaining: Math.max(0, todo.length - generated.length) };
}

export type StoredReport = { businessId: string; name: string; weekEnding: string; createdAt: string; data: SiteIntel; prompt: string };

export async function loadReports(weekEnding: string): Promise<StoredReport[]> {
  const db = getDb();
  if (!db) return [];
  const r = rowsOf<{ business_id: string; name: string; week_ending: string; created_at: string; data: SiteIntel; prompt: string }>(await db.execute(sql`
    select r.business_id, b.name, r.week_ending, r.created_at, r.data, r.prompt from search_intel_reports r join businesses b on b.id = r.business_id
    where r.week_ending = ${weekEnding} and b.account_type = 'house' order by b.name`));
  return r.map((x) => ({ businessId: x.business_id, name: x.name, weekEnding: x.week_ending, createdAt: new Date(x.created_at).toISOString(), data: x.data, prompt: x.prompt }));
}

export async function loadLatestReport(businessId: string): Promise<StoredReport | null> {
  const db = getDb();
  if (!db) return null;
  const [x] = rowsOf<{ business_id: string; name: string; week_ending: string; created_at: string; data: SiteIntel; prompt: string }>(await db.execute(sql`
    select r.business_id, b.name, r.week_ending, r.created_at, r.data, r.prompt from search_intel_reports r join businesses b on b.id = r.business_id
    where r.business_id = ${businessId} and b.account_type = 'house' order by r.week_ending desc limit 1`));
  return x ? { businessId: x.business_id, name: x.name, weekEnding: x.week_ending, createdAt: new Date(x.created_at).toISOString(), data: x.data, prompt: x.prompt } : null;
}

export type PortfolioRow = { businessId: string; name: string; status: string; clicks7: number | null; clicks7Prev: number | null; clicks28: number | null; clicks28Prev: number | null; impressions28: number | null; impressions28Prev: number | null; sample: string };
export type Priority = { site: string; businessId: string; title: string; potentialClicks28: number; kind: Improvement["kind"] };
export type PortfolioSummary = {
  weekEnding: string;
  rows: PortfolioRow[];
  missing: string[];
  totals: { clicks7: number; clicks7Prev: number; clicks28: number; clicks28Prev: number; impressions28: number; impressions28Prev: number };
  gains: Array<{ site: string; change: number }>;
  losses: Array<{ site: string; change: number }>;
  priorities: Priority[];
};

/** Portfolio roll-up. Sites with missing or low-sample data are listed but never counted into a "gain" or "loss". */
export function summarizePortfolio(reports: StoredReport[], allSites: string[], weekEnding: string): PortfolioSummary {
  const rows: PortfolioRow[] = reports.map((r) => ({
    businessId: r.businessId, name: r.name, status: r.data.status.status,
    clicks7: r.data.w7?.cur.clicks ?? null, clicks7Prev: r.data.w7?.prev.clicks ?? null,
    clicks28: r.data.w28?.cur.clicks ?? null, clicks28Prev: r.data.w28?.prev.clicks ?? null,
    impressions28: r.data.w28?.cur.impressions ?? null, impressions28Prev: r.data.w28?.prev.impressions ?? null,
    sample: r.data.w28?.sample ?? "missing",
  }));
  const sum = (f: (r: PortfolioRow) => number | null) => rows.reduce((s, r) => s + (f(r) ?? 0), 0);
  const movers = rows.filter((r) => r.sample === "ok" && r.clicks28 !== null && r.clicks28Prev !== null).map((r) => ({ site: r.name, change: (r.clicks28 ?? 0) - (r.clicks28Prev ?? 0) }));
  // Portfolio-wide: each site's single best improvement, then the five best of those, so one site's overlapping findings cannot fill the list.
  const priorities: Priority[] = reports
    .map((r) => ({ r, best: deriveImprovements(r.data)[0] }))
    .filter((x): x is { r: StoredReport; best: Improvement } => !!x.best)
    .sort((a, b) => b.best.priority - a.best.priority)
    .slice(0, 5)
    .map(({ r, best }) => ({ site: r.name, businessId: r.businessId, title: best.title, potentialClicks28: best.potentialClicks28, kind: best.kind }));
  const have = new Set(reports.map((r) => r.name));
  return {
    weekEnding,
    rows,
    missing: allSites.filter((s) => !have.has(s)),
    totals: { clicks7: sum((r) => r.clicks7), clicks7Prev: sum((r) => r.clicks7Prev), clicks28: sum((r) => r.clicks28), clicks28Prev: sum((r) => r.clicks28Prev), impressions28: sum((r) => r.impressions28), impressions28Prev: sum((r) => r.impressions28Prev) },
    gains: movers.filter((m) => m.change > 0).sort((a, b) => b.change - a.change).slice(0, 3),
    losses: movers.filter((m) => m.change < 0).sort((a, b) => a.change - b.change).slice(0, 3),
    priorities,
  };
}

const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SHORT: Record<EmailBucket, string> = { NEW: "NEW", REOPENED: "REOPENED", STILL_UNOPENED: "STILL OPEN", OPENED: "OPENED", IN_PROGRESS: "IN PROGRESS", COMPLETED_AWAITING: "COMPLETED", VERIFIED: "VERIFIED" };
const ACTIONABLE: EmailBucket[] = ["NEW", "REOPENED", "STILL_UNOPENED", "OPENED", "IN_PROGRESS"];
const ORDER: EmailBucket[] = ["NEW", "REOPENED", "OPENED", "IN_PROGRESS", "COMPLETED_AWAITING", "VERIFIED", "STILL_UNOPENED"];

const outcomeLine = (o: EmailItem["outcome"]) => (o && o.verdict !== "too_early" ? ` Measured: ${o.verdict.replace(/_/g, " ")} (${o.before?.clicks ?? "n/a"} to ${o.after?.clicks ?? "n/a"} clicks over equal 28-day windows; a measured change, not proof of cause).` : "");

/**
 * The search section of the one Friday email. Items are grouped by where they stand, so an unfinished recommendation is promoted as NEW exactly once and every later
 * week it appears as still open, opened or in progress. Daily Search Console checks send nothing; only this weekly email does.
 */
export function renderSearchSection(s: PortfolioSummary, items: EmailItem[]): { text: string; html: string; included: EmailItem[] } {
  const by = (b: EmailBucket) => items.filter((i) => i.bucket === b);
  const top = items.filter((i) => ACTIONABLE.includes(i.bucket)).slice(0, 5);
  const included: EmailItem[] = [];
  const t: string[] = [];
  t.push("WEEKLY SEARCH AND COMPETITOR INTELLIGENCE (Google search clicks and impressions only, not total website visitors)");
  t.push("  Every window ends three days before the report date (the latest complete Google data); each is compared with the equal-length window just before it, so no period is counted twice.");
  t.push(`  Portfolio 7 days: ${s.totals.clicks7} clicks (${sign(s.totals.clicks7 - s.totals.clicks7Prev)} vs the 7 days before). 28 days: ${s.totals.clicks28} clicks (${sign(s.totals.clicks28 - s.totals.clicks28Prev)}), ${s.totals.impressions28} impressions (${sign(s.totals.impressions28 - s.totals.impressions28Prev)}).`);
  t.push(`  Gains: ${s.gains.length ? s.gains.map((g) => `${g.site} ${sign(g.change)} clicks`).join(", ") : "none large enough to read"}. Losses: ${s.losses.length ? s.losses.map((g) => `${g.site} ${sign(g.change)} clicks`).join(", ") : "none large enough to read"}. Sites with too little data are not counted as gains or losses.`);
  if (s.missing.length) t.push(`  Report not generated yet for: ${s.missing.join(", ")}.`);
  t.push("  Top five opportunities still to act on (each keeps its status week to week; nothing here is re-listed as new once it has been reported):");
  if (!top.length) t.push("    none open: nothing new had enough evidence this week");
  top.forEach((p, i) => { t.push(`    ${i + 1}. [${SHORT[p.bucket]}] ${p.site}: ${p.title} (${p.ref}${p.potentialClicks28 > 0 ? `, up to about ${p.potentialClicks28} clicks per 28 days` : ""})`); included.push(p); });
  for (const b of ORDER) {
    const list = by(b);
    if (!list.length) continue;
    if (b === "STILL_UNOPENED") {
      t.push(`  ${BUCKET_LABEL[b]}: ${list.length} (not repeated here; they are in each site's report).`);
      included.push(...list);
      continue;
    }
    t.push(`  ${BUCKET_LABEL[b]} (${list.length}):`);
    for (const i of list.slice(0, 6)) {
      t.push(`    - ${i.site}: ${i.title} (${i.ref}${i.occurrence > 1 ? `, occurrence ${i.occurrence}` : ""})${b === "VERIFIED" ? ` ${i.verification?.note ?? ""}${outcomeLine(i.outcome)}` : b === "COMPLETED_AWAITING" ? ` ${i.verification && i.verification.deployed !== true ? i.verification.note : "Awaiting the next live check."}` : ""}`);
      included.push(i);
    }
    // items past the sixth are NOT marked as reported: they were not named, so they are still listed as new next week
    if (list.length > 6) t.push(`    ... and ${list.length - 6} more in the site reports`);
  }
  t.push("  Detailed site reports (sign in to GravyBlock admin; each has a COPY FOR CLAUDE/CURSOR button):");
  for (const r of s.rows) t.push(`    ${r.name}: ${reportLink(r.businessId)}`);
  const section = (b: EmailBucket) => {
    const list = by(b);
    if (!list.length || b === "STILL_UNOPENED") return "";
    return `<p style="margin:8px 0 2px;font-weight:600">${esc(BUCKET_LABEL[b])} (${list.length})</p><ul style="margin:0;padding-left:20px">${list.slice(0, 6).map((i) => `<li>${esc(i.site)}: ${esc(i.title)} <span style="color:#71717a">(${i.ref})</span>${b === "VERIFIED" ? esc(outcomeLine(i.outcome)) : ""}</li>`).join("")}</ul>`;
  };
  const h = [
    `<div style="font-family:system-ui,sans-serif;max-width:760px;margin:0 auto 18px;padding:14px 16px;border:1px solid #e4e4e7;border-radius:12px;color:#18181b;font-size:14px;line-height:1.5">`,
    `<p style="margin:0 0 6px;font-weight:700">Weekly search and competitor intelligence</p>`,
    `<p style="margin:0 0 8px;color:#52525b;font-size:12px">Google search clicks and impressions only, not total website visitors. Sites with too little data are not counted as gains or losses.</p>`,
    `<p style="margin:0 0 8px">28 days: <b>${s.totals.clicks28}</b> clicks (${sign(s.totals.clicks28 - s.totals.clicks28Prev)}), ${s.totals.impressions28} impressions (${sign(s.totals.impressions28 - s.totals.impressions28Prev)}). 7 days: <b>${s.totals.clicks7}</b> clicks (${sign(s.totals.clicks7 - s.totals.clicks7Prev)}).</p>`,
    `<p style="margin:0 0 8px">Gains: ${esc(s.gains.length ? s.gains.map((g) => `${g.site} ${sign(g.change)}`).join(", ") : "none large enough to read")}. Losses: ${esc(s.losses.length ? s.losses.map((g) => `${g.site} ${sign(g.change)}`).join(", ") : "none large enough to read")}.</p>`,
    `<p style="margin:0 0 4px;font-weight:600">Top five opportunities still to act on</p><ol style="margin:0 0 6px;padding-left:20px">${top.map((p) => `<li><b>${SHORT[p.bucket]}</b> ${esc(p.site)}: ${esc(p.title)}</li>`).join("") || "<li>None open</li>"}</ol>`,
    ORDER.map(section).join(""),
    by("STILL_UNOPENED").length ? `<p style="margin:8px 0 0;color:#52525b;font-size:12px">${by("STILL_UNOPENED").length} earlier recommendations are still unopened (listed in the site reports, not repeated here).</p>` : "",
    `<p style="margin:10px 0 4px;font-weight:600">Detailed reports (admin sign-in required)</p><ul style="margin:0;padding-left:20px">${s.rows.map((r) => `<li><a href="${reportLink(r.businessId)}">${esc(r.name)}</a></li>`).join("")}</ul>`,
    s.missing.length ? `<p style="margin:8px 0 0;color:#b91c1c">Not generated yet: ${esc(s.missing.join(", "))}</p>` : "",
    `</div>`,
  ].join("");
  return { text: t.join("\n"), html: h, included: [...new Map(included.map((i) => [i.id, i])).values()] };
}

export async function buildSearchSection(now = new Date()): Promise<{ text: string; html: string; included: EmailItem[] }> {
  const week = weekEndingFor(now);
  const houses = (await listHouseAccounts()).map((h) => h.name);
  const reports = await loadReports(week);
  return renderSearchSection(summarizePortfolio(reports, houses, week), await collectEmailItems(now));
}

export { markEmailed };

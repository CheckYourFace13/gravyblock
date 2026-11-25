/**
 * Weekly search and competitor intelligence: generation, storage and the portfolio roll-up used by the Friday email and the admin pages.
 * Read-only toward every site. Customer reports are prepared (tenant-scoped builder) but not enabled; see searchIntelEligible.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { listHouseAccounts } from "@/lib/house";
import { gatherSearchIntel, weekEndingFor } from "./gather";
import { buildPrompt, deriveImprovements } from "./prompt";
import type { Improvement, SiteIntel } from "./types";

type Rows<T> = T[];
const rowsOf = <T>(r: unknown) => r as unknown as Rows<T>;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
export const reportLink = (businessId: string) => `${SITE_URL}/admin/house/search-reports/${businessId}`;

export async function generateSearchIntelForSite(businessId: string, now = new Date()): Promise<{ ok: boolean; reason?: string; weekEnding?: string; improvements?: number }> {
  const db = getDb();
  if (!db) return { ok: false, reason: "no_db" };
  const intel = await gatherSearchIntel(businessId, now);
  if (!intel) return { ok: false, reason: "not_eligible_or_missing" };
  const improvements = deriveImprovements(intel);
  const prompt = buildPrompt(intel, improvements);
  await db.execute(sql`insert into search_intel_reports (business_id, week_ending, data, prompt) values (${businessId}, ${intel.weekEnding}, ${JSON.stringify(intel)}::jsonb, ${prompt})
    on conflict (business_id, week_ending) do update set data = excluded.data, prompt = excluded.prompt, created_at = now()`);
  return { ok: true, weekEnding: intel.weekEnding, improvements: improvements.length };
}

/** Generates reports for house sites that do not yet have one for this week, a few at a time so a worker pass stays short. */
export async function generateMissingSearchIntel(now = new Date(), maxSites = 2): Promise<{ generated: string[]; remaining: number }> {
  const db = getDb();
  if (!db) return { generated: [], remaining: 0 };
  const week = weekEndingFor(now);
  const houses = await listHouseAccounts();
  const have = new Set(rowsOf<{ business_id: string }>(await db.execute(sql`select business_id from search_intel_reports where week_ending = ${week}`)).map((r) => r.business_id));
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
  const priorities: Priority[] = reports
    .flatMap((r) => deriveImprovements(r.data).map((i) => ({ site: r.name, businessId: r.businessId, title: i.title, potentialClicks28: i.potentialClicks28, kind: i.kind, priority: i.priority })))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5)
    .map(({ priority: _p, ...rest }) => rest);
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

/** The search section of the one Friday email: plain text plus an HTML block with a link to each site's detailed report. */
export function renderSearchSection(s: PortfolioSummary): { text: string; html: string } {
  const t: string[] = [];
  t.push("WEEKLY SEARCH AND COMPETITOR INTELLIGENCE (Google search clicks and impressions only, not total website visitors)");
  t.push("  Every window ends three days before the report date (the latest complete Google data); each is compared with the equal-length window just before it, so no period is counted twice.");
  t.push(`  Portfolio 7 days: ${s.totals.clicks7} clicks (${sign(s.totals.clicks7 - s.totals.clicks7Prev)} vs the 7 days before). 28 days: ${s.totals.clicks28} clicks (${sign(s.totals.clicks28 - s.totals.clicks28Prev)}), ${s.totals.impressions28} impressions (${sign(s.totals.impressions28 - s.totals.impressions28Prev)}).`);
  t.push(`  Gains: ${s.gains.length ? s.gains.map((g) => `${g.site} ${sign(g.change)} clicks`).join(", ") : "none large enough to read"}. Losses: ${s.losses.length ? s.losses.map((g) => `${g.site} ${sign(g.change)} clicks`).join(", ") : "none large enough to read"}. Sites with too little data are not counted as gains or losses.`);
  if (s.missing.length) t.push(`  Report not generated yet for: ${s.missing.join(", ")}.`);
  t.push("  Top five priorities across the portfolio:");
  if (!s.priorities.length) t.push("    none had enough evidence this week");
  s.priorities.forEach((p, i) => t.push(`    ${i + 1}. ${p.site}: ${p.title}${p.potentialClicks28 > 0 ? ` (up to about ${p.potentialClicks28} clicks per 28 days)` : ""}`));
  t.push("  Detailed site reports (sign in to GravyBlock admin; each has a COPY FOR CLAUDE/CURSOR button):");
  for (const r of s.rows) t.push(`    ${r.name}: ${reportLink(r.businessId)}`);
  const h = [
    `<div style="font-family:system-ui,sans-serif;max-width:760px;margin:0 auto 18px;padding:14px 16px;border:1px solid #e4e4e7;border-radius:12px;color:#18181b;font-size:14px;line-height:1.5">`,
    `<p style="margin:0 0 6px;font-weight:700">Weekly search and competitor intelligence</p>`,
    `<p style="margin:0 0 8px;color:#52525b;font-size:12px">Google search clicks and impressions only, not total website visitors. Sites with too little data are not counted as gains or losses.</p>`,
    `<p style="margin:0 0 8px">28 days: <b>${s.totals.clicks28}</b> clicks (${sign(s.totals.clicks28 - s.totals.clicks28Prev)}), ${s.totals.impressions28} impressions (${sign(s.totals.impressions28 - s.totals.impressions28Prev)}). 7 days: <b>${s.totals.clicks7}</b> clicks (${sign(s.totals.clicks7 - s.totals.clicks7Prev)}).</p>`,
    `<p style="margin:0 0 8px">Gains: ${esc(s.gains.length ? s.gains.map((g) => `${g.site} ${sign(g.change)}`).join(", ") : "none large enough to read")}. Losses: ${esc(s.losses.length ? s.losses.map((g) => `${g.site} ${sign(g.change)}`).join(", ") : "none large enough to read")}.</p>`,
    `<p style="margin:0 0 4px;font-weight:600">Top five priorities</p><ol style="margin:0 0 10px;padding-left:20px">${s.priorities.map((p) => `<li>${esc(p.site)}: ${esc(p.title)}</li>`).join("") || "<li>None had enough evidence this week</li>"}</ol>`,
    `<p style="margin:0 0 4px;font-weight:600">Detailed reports (admin sign-in required)</p><ul style="margin:0;padding-left:20px">${s.rows.map((r) => `<li><a href="${reportLink(r.businessId)}">${esc(r.name)}</a></li>`).join("")}</ul>`,
    s.missing.length ? `<p style="margin:8px 0 0;color:#b91c1c">Not generated yet: ${esc(s.missing.join(", "))}</p>` : "",
    `</div>`,
  ].join("");
  return { text: t.join("\n"), html: h };
}

export async function buildSearchSection(now = new Date()): Promise<{ text: string; html: string }> {
  const week = weekEndingFor(now);
  const houses = (await listHouseAccounts()).map((h) => h.name);
  const reports = await loadReports(week);
  return renderSearchSection(summarizePortfolio(reports, houses, week));
}

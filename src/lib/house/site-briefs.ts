import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

/**
 * House accounts are read-only: GravyBlock never edits their websites, so the on-site work it finds (titles, schema, conversion fixes, content gaps)
 * can never be applied by it. Instead of leaving those findings idle in the queue, this turns them into one brief per site for that site's OWN agent.
 * It only reads the queue and writes nothing to any site. The owner (or the site's agent) decides what to apply.
 */

const ON_SITE_TYPES = ["existing_page_seo", "schema", "ctr", "technical", "conversion", "content_gap", "internal_link"];

export type BriefItem = { type: string; subtype: string | null; impact: number; confidence: number; evidence: string };
export type HouseBrief = { name: string; website: string | null; total: number; items: BriefItem[] };

const clip = (v: unknown, n = 260) => (typeof v === "string" ? v : JSON.stringify(v ?? "")).replace(/\s+/g, " ").slice(0, n);

type Ev = Record<string, unknown> | null;
/** Plain-language brief text for the search-driven findings; everything else keeps the raw clipped evidence. */
export function briefEvidence(subtype: string | null, evidence: unknown): string | null {
  const e = (evidence ?? null) as Ev;
  if (!e) return null;
  if (subtype === "search_pages_dropped") {
    const v = (e.verdicts ?? {}) as Record<string, number>;
    const groups = Array.isArray(e.byPathPrefix) ? (e.byPathPrefix as Array<{ prefix: string; before: number; lost: number }>).slice(0, 3).map((g) => `${g.prefix} ${g.lost} of ${g.before}`).join(", ") : "";
    return `HIGH PRIORITY. ${e.lostPages} of ${e.priorPages} pages that earned Google impressions in the earlier 28 days earn none now (impressions ${e.impressionsBefore} to ${e.impressionsNow}; the lost pages had earned ${e.clicksOnLostPages} clicks). By section: ${groups}. Google says for the pages it checked: noindex tag ${v.noindex_tag ?? 0}, crawled but not indexed ${v.crawled_not_indexed ?? 0}, other block ${v.blocked_other ?? 0}, indexed ${v.indexed ?? 0}. ${e.reading ?? ""}`.replace(/\s+/g, " ").slice(0, 900);
  }
  if (subtype === "embeddable_widget_brief") {
    const examples = Array.isArray(e.examples) ? (e.examples as string[]).join(", ") : "";
    return `Proposal for the site's own developer: ${e.proposal} Likely users: ${e.whoMightUseIt}. Built on ${e.existingPages} existing page(s) (${examples}). Rules: ${e.rules} Judged on: ${e.measuredBy}.`.replace(/\s+/g, " ").slice(0, 900);
  }
  if (subtype === "search_low_ctr") {
    return `${e.url} ranks at position ${e.position} for "${e.query}" with ${e.impressions} impressions but only ${(Number(e.ctr) * 100).toFixed(1)}% of them click (${e.clicks} clicks). The ranking is already won; the title and description decide the click. ${e.seasonal ? "The demand looks seasonal, so check it before the next peak." : ""}`.replace(/\s+/g, " ").slice(0, 500);
  }
  return null;
}

export async function buildHouseSiteBriefs(maxItems = 10): Promise<HouseBrief[]> {
  const db = getDb();
  if (!db) throw new Error("database unavailable");
  const rows = (await db.execute(sql`
    select b.name, b.website, o.opportunity_type t, o.subtype, o.expected_impact imp, o.confidence conf, o.evidence
    from growth_opportunities o join businesses b on b.id = o.business_id
    where b.account_type = 'house' and o.status = 'open' and o.opportunity_type in (${sql.join(ON_SITE_TYPES.map((t) => sql`${t}`), sql`, `)})
    order by b.name, (o.expected_impact * o.confidence) desc`)) as unknown as Array<{ name: string; website: string | null; t: string; subtype: string | null; imp: number; conf: number; evidence: unknown }>;
  const byName = new Map<string, HouseBrief>();
  const seen = new Set<string>();
  for (const r of rows) {
    const brief = byName.get(r.name) ?? { name: r.name, website: r.website, total: 0, items: [] };
    byName.set(r.name, brief);
    const ev = briefEvidence(r.subtype, r.evidence) ?? clip(r.evidence);
    const key = `${r.name}|${r.t}|${r.subtype ?? ""}|${ev.slice(0, 80)}`;
    if (seen.has(key)) continue; // the same finding recorded twice is one item
    seen.add(key);
    brief.total++;
    if (brief.items.length < maxItems) brief.items.push({ type: r.t, subtype: r.subtype, impact: Number(r.imp), confidence: Number(r.conf), evidence: ev });
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function renderHouseBrief(b: HouseBrief): string {
  const lines = [`# ${b.name}: site changes found by GravyBlock, for this site's own agent`, "", `Site: ${b.website ?? "(none)"}`, `GravyBlock does not edit this site. ${b.total} open finding(s); the ${b.items.length} highest-value are below, best first.`, ""];
  b.items.forEach((i, n) => lines.push(`${n + 1}. ${i.type}${i.subtype ? ` / ${i.subtype}` : ""} (impact ${i.impact}, confidence ${i.confidence})`, `   ${i.evidence}`, ""));
  return lines.join("\n");
}

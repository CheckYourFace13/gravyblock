/**
 * Assembles a growth story for one house site from the EXISTING records: proof ledger and backlink table (verified links), jobs (executed actions),
 * growth_opportunities (discovered and recommended), search_daily (Search Console history) and the Drink Place style pages-dropped finding.
 * Read-only. The wording rules live in model.ts; nothing here writes to any site.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { addDays, draftClaims, judgeAttribution, storyWindows, sumWindow, type Attribution, type Claim, type Daily, type Placement, type StoryWindows, type WindowStat } from "./model";

type Rows<T> = T[];
const rowsOf = <T>(r: unknown) => r as unknown as Rows<T>;

/** Public slugs for the pilots. Slugs are neutral: they never reveal who owns a site. */
export const PILOT_SLUGS: Record<string, string> = { "boating-chicago": "Boating Chicago", "the-drink-place": "The Drink Place" };

export type GrowthStory = {
  slug: string;
  businessId: string;
  name: string;
  website: string | null;
  generatedAt: string;
  start: { day: string | null; basis: string };
  windows: StoryWindows | null;
  baseline: WindowStat | null;
  latest: WindowStat | null;
  after: Array<{ label: "30" | "60" | "90"; elapsed: boolean; stat: WindowStat | null }>;
  historyDays: number;
  discovered: { total: number; byType: Record<string, number> };
  recommended: { briefs: number; bySubtype: Record<string, number> };
  executed: { emailsSent: number; followUps: number; organisations: number; videosPublished: number; videoUrls: string[]; firstActionAt: string | null };
  verified: { links: Placement[]; indexRechecks: Array<{ at: string; verdicts: Record<string, number> }> };
  referral: { measured: boolean; note: string };
  registrationsAndRevenue: { measured: boolean; note: string };
  dropped: { lost: number; before: number; impressionsBefore: number; impressionsNow: number } | null;
  attribution: Attribution;
  claims: Claim[];
};

export async function buildGrowthStory(slug: string, now = new Date()): Promise<GrowthStory | null> {
  const db = getDb();
  const name = PILOT_SLUGS[slug];
  if (!db || !name) return null;
  const [biz] = rowsOf<{ id: string; website: string | null }>(await db.execute(sql`select id, website from businesses where name = ${name} and account_type = 'house' limit 1`));
  if (!biz) return null;
  const id = biz.id;
  const today = now.toISOString().slice(0, 10);

  const [exec] = rowsOf<{ emails: number; follow: number; orgs: number; first: string | null }>(await db.execute(sql`
    select count(*) filter (where type = 'authority_outreach_sent')::int emails,
           count(*) filter (where type = 'authority_followup_sent')::int follow,
           count(distinct payload->>'to')::int orgs,
           min(created_at) first
    from jobs where business_id = ${id} and type in ('authority_outreach_sent', 'authority_followup_sent')`));
  const vids = rowsOf<{ url: string | null; at: string | null }>(await db.execute(sql`
    select pub.external_url url, pub.published_at at from ms_publications pub join ms_products p on p.id = pub.product_id
    where (p.business_id = ${id} or p.slug = ${name.toLowerCase().replace(/[^a-z0-9]/g, "")}) and pub.status = 'published' and pub.platform = 'youtube' order by pub.published_at`));
  const times = [exec?.first ? new Date(exec.first).toISOString() : null, ...vids.map((v) => (v.at ? new Date(v.at).toISOString() : null))].filter((x): x is string => !!x).sort();
  const firstActionAt = times[0] ?? null;
  const startDay = firstActionAt ? firstActionAt.slice(0, 10) : null;

  const daily = rowsOf<Daily>(await db.execute(sql`select day, clicks, impressions, position from search_daily where business_id = ${id} order by day`)).map((d) => ({ day: d.day, clicks: Number(d.clicks), impressions: Number(d.impressions), position: Number(d.position) }));
  const windows = startDay ? storyWindows(startDay, today) : null;
  const haveBaseline = !!windows && daily.length > 0 && daily[0]!.day <= windows.baseline.start;
  const baseline = windows && haveBaseline ? sumWindow(daily, windows.baseline) : null;
  const latest = windows && haveBaseline ? sumWindow(daily, windows.latest) : null;
  const after = (windows?.after ?? []).map((a) => ({ label: a.label, elapsed: a.elapsed, stat: a.elapsed && haveBaseline ? sumWindow(daily, a.window) : null }));

  const opp = rowsOf<{ t: string; subtype: string | null; n: number; open_briefs: number }>(await db.execute(sql`
    select opportunity_type t, subtype, count(*)::int n,
           count(*) filter (where status = 'open' and required_capability = 'website_write')::int open_briefs
    from growth_opportunities where business_id = ${id} group by 1, 2`));
  const byType: Record<string, number> = {};
  const bySubtype: Record<string, number> = {};
  let briefs = 0;
  for (const o of opp) {
    byType[o.t] = (byType[o.t] ?? 0) + Number(o.n);
    if (Number(o.open_briefs) > 0) {
      bySubtype[o.subtype ?? o.t] = (bySubtype[o.subtype ?? o.t] ?? 0) + Number(o.open_briefs);
      briefs += Number(o.open_briefs);
    }
  }

  const links = rowsOf<{ verified_at: string; destination: string | null; after_evidence: { pageUrl?: string; href?: string } | null }>(await db.execute(sql`
    select verified_at, destination, after_evidence from proof_ledger where business_id = ${id} and action_type = 'link_acquired' order by verified_at`));
  const placements: Placement[] = links.map((l) => ({ verifiedAt: new Date(l.verified_at).toISOString(), targetPage: l.after_evidence?.href ?? null, from: l.after_evidence?.pageUrl ?? l.destination ?? "" }));

  const rechecks = rowsOf<{ created_at: string; payload: { verdicts?: Record<string, number> } }>(await db.execute(sql`
    select created_at, payload from jobs where business_id = ${id} and type = 'house_index_recheck' order by created_at`));

  const [dr] = rowsOf<{ evidence: { priorPages?: number; lostPages?: number; impressionsBefore?: number; impressionsNow?: number } | null }>(await db.execute(sql`
    select evidence from growth_opportunities where business_id = ${id} and subtype = 'search_pages_dropped' order by created_at desc limit 1`));
  const dropped = dr?.evidence?.lostPages ? { lost: Number(dr.evidence.lostPages), before: Number(dr.evidence.priorPages ?? 0), impressionsBefore: Number(dr.evidence.impressionsBefore ?? 0), impressionsNow: Number(dr.evidence.impressionsNow ?? 0) } : null;

  const attribution = judgeAttribution({ placements, measure: null });
  const claims = draftClaims({ startDay, baseline, latest, emailsSent: Number(exec?.emails ?? 0), organisations: Number(exec?.orgs ?? 0), videos: vids.length, linksVerified: placements.length, attribution, droppedPages: dropped });

  return {
    slug,
    businessId: id,
    name,
    website: biz.website,
    generatedAt: now.toISOString(),
    start: { day: startDay, basis: startDay ? "the earliest completed GravyBlock off-site action for this site (an outreach email or a published video)" : "no off-site action has been completed yet" },
    windows,
    baseline,
    latest,
    after,
    historyDays: daily.length,
    discovered: { total: Object.values(byType).reduce((a, b) => a + b, 0), byType },
    recommended: { briefs, bySubtype },
    executed: { emailsSent: Number(exec?.emails ?? 0), followUps: Number(exec?.follow ?? 0), organisations: Number(exec?.orgs ?? 0), videosPublished: vids.length, videoUrls: vids.map((v) => v.url).filter((u): u is string => !!u).slice(0, 12), firstActionAt },
    verified: { links: placements, indexRechecks: rechecks.map((r) => ({ at: new Date(r.created_at).toISOString(), verdicts: r.payload?.verdicts ?? {} })) },
    referral: { measured: false, note: "NOT MEASURED. Visits to this site from videos or other sites are counted by the site's own analytics, which GravyBlock cannot read." },
    registrationsAndRevenue: { measured: false, note: "NOT MEASURED. Registrations, claims and revenue happen inside the site's own system, which GravyBlock cannot read." },
    dropped,
    attribution,
    claims,
  };
}

export { addDays };

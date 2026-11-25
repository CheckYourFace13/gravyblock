import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getInternalBusinesses } from "./classification";
import { getRealCustomers, measure, type Metric } from "./acquisition";
import { buildHouseSiteBriefs } from "@/lib/house/site-briefs";
import { getSourceTypeStats } from "@/lib/authority/engine";

/**
 * One combined, read-only portfolio report for the 12 House Accounts (the Friday report, also available on demand).
 * It reports only what is measured. A number that cannot be measured is "not measured" and never 0, and nothing here
 * is estimated: off-site views come from the platform's own counters (ms_publication_metrics), site visits and scans
 * come from first-party funnel events. A visit belongs to a video when its session arrived tagged utm_source=youtube;
 * the later steps of that session (scan completed, checkout) do not repeat the tags, so they are counted through the session.
 * Only gravyblock.com has first-party funnel events in this database; every other house site must report its own
 * traffic, so their visits and signups are listed as "not measured here" instead of guessed.
 *
 * It writes nothing. Sending it to the owner is src/lib/email/weekly-house-report.ts.
 */

export type ProductOffsite = { slug: string; liveVideos: number; views: number; likes: number; comments: number; failed: number; waiting: number; lastPublished: string | null; metricsAsOf: string | null };
export type VideoAttribution = { campaign: string; sessions: number; scansStarted: number; scansCompleted: number; checkouts: number; leads: number };
export type HouseEngine = { name: string; open: number; acted: number; verified: number; noGain: number };
export type Pair = { now: number; before: number };
export type WeekOverWeek = { viewsLifetime: Pair; videosPublished: Pair; publicationsFailed: Pair; videoVisits: Pair; videoScansCompleted: Pair; videoCheckouts: Pair };
export type SearchDriven = { discovered: number; open: number; acted: number; evaluated: number; positive: number; items: Array<{ site: string; page: string; band: string; status: string; baselineClicks: number | null; afterClicks: number | null; measured: string | null }> };
export type ChannelRow = { channel: string; actions: string; visits: number | null; scans: number | null; checkouts: number | null; note: string };
/** Small samples are never called a win or a loss. */
export function judgeChannel(visits: number | null, conversions: number | null): string {
  if (visits === null || conversions === null) return "NOT MEASURED";
  if (conversions >= 3) return "working (3 or more conversions)";
  if (visits >= 100 && conversions === 0) return "no conversions at this volume (100 or more visits)";
  return `too early to judge (${visits} visits, ${conversions} conversions; needs 30+ visits or 3+ conversions)`;
}
export type PortfolioReport = {
  generatedAt: string;
  windowDays: number;
  offsite: Metric<ProductOffsite[]>;
  attribution: Metric<VideoAttribution[]>;
  weekly: Metric<WeekOverWeek>;
  revenue: Metric<{ customers: number; mrr: number }>;
  backlinks: Metric<{ acquired: number; inOutreach: number; acquiredThisWeek: number }>;
  search: Metric<{ connected: number; clicks28d: number | null; impressions28d: number | null; bySite?: Array<{ name: string; clicks: number; impressions: number; priorClicks: number; priorImpressions: number }> }>;
  scanFunnel: Metric<{ views: number; engaged: number; interacted: number; submitted: number; failed: number; completed: number; failures: Array<{ detail: string; n: number }> }>;
  siteDrafts: Metric<Array<{ name: string; total: number }>>;
  searchDriven: Metric<SearchDriven>;
  channels: Metric<ChannelRow[]>;
  learning: Metric<Array<{ type: string; contacted: number; acquired: number; retired: boolean }>>;
  actions: Metric<Array<{ type: string; discovered: number; acted: number; verified: number; noGain: number }>>;
  engines: Metric<HouseEngine[]>;
  health: Metric<{ failedJobsByType: Record<string, number>; sendFailures7d: number; lastWatchdog: Record<string, unknown> | null; cold7d: number; followup7d: number; breakup7d: number }>;
  setup: Metric<{ houseCount: number; searchConsoleConnected: number; publishingLiveEnabled: boolean | null; citationsNeedingOwner: number; proofLedgerEntries: number }>;
};

type Rows<T> = T[];
const rowsOf = <T>(r: unknown) => r as unknown as Rows<T>;

export async function gatherPortfolioReport(windowDays = 7): Promise<PortfolioReport> {
  const db = getDb();
  if (!db) throw new Error("database unavailable");
  const dayMs = 86_400_000;
  const nowIso = new Date().toISOString();
  const since = new Date(Date.now() - windowDays * dayMs).toISOString();
  const prevSince = new Date(Date.now() - 2 * windowDays * dayMs).toISOString();
  const since7 = new Date(Date.now() - 7 * dayMs).toISOString();

  const offsite = await measure("portfolio.offsite", async () => {
    const r = rowsOf<{ slug: string; live: number; failed: number; waiting: number; last: string | null }>(await db.execute(sql`
      select pr.slug, count(*) filter (where p.status='published' and p.remote_deleted_at is null)::int live,
             count(*) filter (where p.status='failed')::int failed, count(*) filter (where p.status='approval_required')::int waiting,
             max(p.published_at)::text last
      from ms_publications p join ms_products pr on pr.id = p.product_id where p.platform='youtube' group by pr.slug order by pr.slug`));
    const m = rowsOf<{ slug: string; views: number | null; likes: number | null; comments: number | null; asof: string | null }>(await db.execute(sql`
      with l as (select distinct on (publication_id) publication_id, product_id, metrics, collected_at from ms_publication_metrics order by publication_id, collected_at desc)
      select pr.slug, sum((metrics->'views'->>'value')::int)::int views, sum((metrics->'reactions'->>'value')::int)::int likes,
             sum((metrics->'comments'->>'value')::int)::int comments, max(collected_at)::text asof
      from l join ms_products pr on pr.id = l.product_id join ms_publications p on p.id = l.publication_id
      where p.status='published' and p.remote_deleted_at is null group by pr.slug`));
    const bySlug = new Map(m.map((x) => [x.slug, x]));
    return r.map((x): ProductOffsite => {
      const k = bySlug.get(x.slug);
      return { slug: x.slug, liveVideos: Number(x.live), views: Number(k?.views ?? 0), likes: Number(k?.likes ?? 0), comments: Number(k?.comments ?? 0), failed: Number(x.failed), waiting: Number(x.waiting), lastPublished: x.last, metricsAsOf: k?.asof ?? null };
    });
  });

  const internal = await measure("portfolio.internal", async () => [...(await getInternalBusinesses()).keys()]);
  const internalIds = internal.ok ? internal.value : [];
  // sessions marked internal or automated at the time of the visit (metadata.excluded) are left out of every genuine-visitor number
  const markedY = sql`and not exists (select 1 from funnel_events x where x.session_id = y.session_id and x.metadata->>'excluded' is not null)`;
  const attributionBetween = async (from: string, to: string) => {
    const internalSessions = sql`${markedY} ${internalIds.length
      ? sql`and not exists (select 1 from funnel_events i where i.session_id = y.session_id and i.business_id in (${sql.join(internalIds.map((id) => sql`${id}::uuid`), sql`, `)}))`
      : sql``}`;
    return rowsOf<{ campaign: string | null; sessions: number; ss: number; sc: number; co: number; le: number }>(await db.execute(sql`
      with y as (select session_id, min(coalesce(utm_campaign, '(no campaign)')) campaign from funnel_events
                 where utm_source = 'youtube' and session_id is not null and created_at >= ${from}::timestamptz and created_at < ${to}::timestamptz group by 1)
      select y.campaign, count(distinct y.session_id)::int sessions,
             count(*) filter (where e.event_type = 'scan_started')::int ss, count(*) filter (where e.event_type = 'scan_completed')::int sc,
             count(*) filter (where e.event_type in ('checkout_started', 'checkout_completed'))::int co, count(*) filter (where e.event_type = 'lead_form_submitted')::int le
      from y join funnel_events e on e.session_id = y.session_id where true ${internalSessions}
      group by 1 order by 2 desc`));
  };

  const attribution = await measure("portfolio.attribution", async () => {
    const r = await attributionBetween(since, nowIso);
    return r.map((x): VideoAttribution => ({ campaign: x.campaign ?? "(no campaign)", sessions: Number(x.sessions), scansStarted: Number(x.ss), scansCompleted: Number(x.sc), checkouts: Number(x.co), leads: Number(x.le) }));
  });

  const weekly = await measure("portfolio.weekly", async () => {
    const sum = (r: Array<{ sessions: number; sc: number; co: number }>) => r.reduce((a, x) => ({ v: a.v + Number(x.sessions), s: a.s + Number(x.sc), c: a.c + Number(x.co) }), { v: 0, s: 0, c: 0 });
    const cur = sum(await attributionBetween(since, nowIso));
    const prev = sum(await attributionBetween(prevSince, since));
    const viewsAt = async (cutoff: string) =>
      Number(rowsOf<{ n: number }>(await db.execute(sql`
        select coalesce(sum((m.metrics->'views'->>'value')::int), 0)::int n from (
          select distinct on (publication_id) metrics from ms_publication_metrics where collected_at <= ${cutoff}::timestamptz order by publication_id, collected_at desc) m`))[0]?.n ?? 0);
    const pubs = rowsOf<{ pub_now: number; pub_prev: number; fail_now: number; fail_prev: number }>(await db.execute(sql`
      select count(*) filter (where status = 'published' and published_at >= ${since}::timestamptz)::int pub_now,
             count(*) filter (where status = 'published' and published_at >= ${prevSince}::timestamptz and published_at < ${since}::timestamptz)::int pub_prev,
             count(*) filter (where status = 'failed' and updated_at >= ${since}::timestamptz)::int fail_now,
             count(*) filter (where status = 'failed' and updated_at >= ${prevSince}::timestamptz and updated_at < ${since}::timestamptz)::int fail_prev
      from ms_publications`))[0];
    return {
      viewsLifetime: { now: await viewsAt(nowIso), before: await viewsAt(since) },
      videosPublished: { now: Number(pubs?.pub_now ?? 0), before: Number(pubs?.pub_prev ?? 0) },
      publicationsFailed: { now: Number(pubs?.fail_now ?? 0), before: Number(pubs?.fail_prev ?? 0) },
      videoVisits: { now: cur.v, before: prev.v },
      videoScansCompleted: { now: cur.s, before: prev.s },
      videoCheckouts: { now: cur.c, before: prev.c },
    } satisfies WeekOverWeek;
  });

  const revenue = await measure("portfolio.revenue", async () => {
    const c = await getRealCustomers();
    return { customers: c.customers.length, mrr: c.mrr };
  });

  const backlinks = await measure("portfolio.backlinks", async () => {
    const r = rowsOf<{ acquired: number; inout: number }>(await db.execute(sql`
      select count(*) filter (where o.status = 'acquired')::int acquired,
             count(*) filter (where o.status in ('contacted', 'followed_up', 'qualified', 'outreach_queued'))::int inout
      from backlink_opportunities o join businesses b on b.id = o.business_id where b.account_type = 'house'`));
    const w = rowsOf<{ n: number }>(await db.execute(sql`
      select count(*)::int n from proof_ledger p join businesses b on b.id = p.business_id
      where b.account_type = 'house' and p.action_type = 'link_acquired' and p.created_at >= ${since}::timestamptz`));
    return { acquired: Number(r[0]?.acquired ?? 0), inOutreach: Number(r[0]?.inout ?? 0), acquiredThisWeek: Number(w[0]?.n ?? 0) };
  });

  const search = await measure("portfolio.search", async () => {
    const c = rowsOf<{ n: number }>(await db.execute(sql`
      select count(*)::int n from businesses b where b.account_type = 'house' and (
        exists (select 1 from search_console_property_connections s where s.business_id = b.id and s.status = 'connected')
        or exists (select 1 from google_oauth_connections g where g.business_id = b.id and g.search_console_property is not null))`));
    const connected = Number(c[0]?.n ?? 0);
    if (!connected) return { connected, clicks28d: null, impressions28d: null };
    // Each site stores two 28-day windows (current and the one before it). Only the latest window is "last 28 days"; the earlier one is the comparison.
    const w = rowsOf<{ name: string; start: string; clicks: number; imps: number }>(await db.execute(sql`
      select b.name, p.period_start::text start, sum(p.clicks)::int clicks, sum(p.impressions)::int imps from page_performance p join businesses b on b.id = p.business_id
      where b.account_type = 'house' and p.fetched_at >= now() - interval '35 days' group by 1, 2 order by 1, 2 desc`));
    const by = new Map<string, Array<{ clicks: number; imps: number }>>();
    for (const r of w) by.set(r.name, [...(by.get(r.name) ?? []), { clicks: Number(r.clicks), imps: Number(r.imps) }]);
    const bySite = [...by.entries()].map(([name, v]) => ({ name, clicks: v[0]!.clicks, impressions: v[0]!.imps, priorClicks: v[1]?.clicks ?? 0, priorImpressions: v[1]?.imps ?? 0 }));
    if (!bySite.length) return { connected, clicks28d: null, impressions28d: null };
    return { connected, clicks28d: bySite.reduce((s, x) => s + x.clicks, 0), impressions28d: bySite.reduce((s, x) => s + x.impressions, 0), bySite };
  });

  const scanFunnel = await measure("portfolio.scanFunnel", async () => {
    const excl = sql`and not exists (select 1 from funnel_events x where x.session_id = e.session_id and x.metadata->>'excluded' is not null) ${internalIds.length ? sql`and not exists (select 1 from funnel_events i where i.session_id = e.session_id and i.business_id in (${sql.join(internalIds.map((id) => sql`${id}::uuid`), sql`, `)}))` : sql``}`;
    const r = rowsOf<{ views: number; eng: number; inter: number; subm: number; fail: number; done: number }>(await db.execute(sql`
      select count(distinct e.session_id) filter (where e.event_type = 'scan_started')::int views,
             count(distinct e.session_id) filter (where e.event_type = 'page_engaged')::int eng,
             count(distinct e.session_id) filter (where e.event_type = 'scan_form_interacted')::int inter,
             count(distinct e.session_id) filter (where e.event_type = 'scan_submitted')::int subm,
             count(distinct e.session_id) filter (where e.event_type = 'scan_submit_failed')::int fail,
             count(distinct e.session_id) filter (where e.event_type = 'scan_completed')::int done
      from funnel_events e where e.created_at >= ${since}::timestamptz and e.session_id is not null ${excl}`));
    const f = rowsOf<{ detail: string | null; n: number }>(await db.execute(sql`
      select coalesce(metadata->>'detail', '(none)') detail, count(*)::int n from funnel_events where event_type = 'scan_submit_failed' and created_at >= ${since}::timestamptz group by 1 order by 2 desc limit 5`));
    return { views: Number(r[0]?.views ?? 0), engaged: Number(r[0]?.eng ?? 0), interacted: Number(r[0]?.inter ?? 0), submitted: Number(r[0]?.subm ?? 0), failed: Number(r[0]?.fail ?? 0), completed: Number(r[0]?.done ?? 0), failures: f.map((x) => ({ detail: x.detail ?? "(none)", n: Number(x.n) })) };
  });

  const learning = await measure("portfolio.learning", async () =>
    Object.entries(await getSourceTypeStats(db))
      .filter(([, s]) => s.contacted > 0)
      .map(([type, s]) => ({ type, contacted: s.contacted, acquired: s.acquired, retired: Boolean(s.retired) }))
      .sort((a, b) => b.contacted - a.contacted));

  const searchDriven = await measure("portfolio.searchDriven", async () => {
    const c = rowsOf<{ disc: number; open: number; acted: number; ev: number; pos: number }>(await db.execute(sql`
      select count(*) filter (where o.created_at >= ${since}::timestamptz)::int disc,
             count(*) filter (where o.status = 'open')::int open,
             count(*) filter (where o.status in ('acted', 'verified', 'no_gain'))::int acted,
             count(*) filter (where o.measured_result is not null and o.measured_result->>'status' <> 'TOO_EARLY')::int ev,
             count(*) filter (where o.measured_result->>'status' = 'POSITIVE')::int pos
      from growth_opportunities o join businesses b on b.id = o.business_id where b.account_type = 'house' and o.engine = 'search_console'`));
    const it = rowsOf<{ site: string; page: string | null; band: string | null; status: string; base: number | null; after: number | null; ms: string | null }>(await db.execute(sql`
      select b.name site, o.evidence->>'url' page, o.evidence->>'band' band, o.status, (o.measurement_plan->>'baselineValue')::float base, (o.measured_result->>'afterValue')::float after, o.measured_result->>'status' ms
      from growth_opportunities o join businesses b on b.id = o.business_id where b.account_type = 'house' and o.engine = 'search_console' and o.status in ('acted', 'verified', 'no_gain') order by o.acted_at desc nulls last limit 8`));
    const x = c[0];
    return { discovered: Number(x?.disc ?? 0), open: Number(x?.open ?? 0), acted: Number(x?.acted ?? 0), evaluated: Number(x?.ev ?? 0), positive: Number(x?.pos ?? 0), items: it.map((r) => ({ site: r.site, page: r.page ?? "", band: r.band ?? "", status: r.status, baselineClicks: r.base === null ? null : Number(r.base), afterClicks: r.after === null ? null : Number(r.after), measured: r.ms })) };
  });

  const channels = await measure("portfolio.channels", async () => {
    const youtube = attribution.ok ? attribution.value.reduce((a, v) => ({ s: a.s + v.sessions, c: a.c + v.scansCompleted, k: a.k + v.checkouts }), { s: 0, c: 0, k: 0 }) : null;
    const o = rowsOf<{ sent: number }>(await db.execute(sql`select count(*)::int sent from jobs where type = 'authority_outreach_sent' and created_at >= ${since}::timestamptz`));
    const cold = rowsOf<{ visits: number; scans: number; checks: number }>(await db.execute(sql`
      select count(distinct session_id) filter (where event_type in ('scan_started', 'report_landed', 'pricing_viewed'))::int visits,
             count(distinct session_id) filter (where event_type = 'scan_completed')::int scans,
             count(distinct session_id) filter (where event_type = 'checkout_started')::int checks
      from funnel_events e where e.created_at >= ${since}::timestamptz and e.session_id is not null and e.utm_source = 'cold_outreach'
        and not exists (select 1 from funnel_events x where x.session_id = e.session_id and x.metadata->>'excluded' is not null)`));
    const sent = Number(o[0]?.sent ?? 0);
    const rows: ChannelRow[] = [
      { channel: "YouTube videos", actions: attribution.ok ? `${attribution.value.length} tagged campaigns` : "NOT MEASURED", visits: youtube ? youtube.s : null, scans: youtube ? youtube.c : null, checkouts: youtube ? youtube.k : null, note: "visits to gravyblock.com only; other sites NOT MEASURED" },
      { channel: "Backlink outreach", actions: `${sent} pitches sent`, visits: Number(cold[0]?.visits ?? 0), scans: Number(cold[0]?.scans ?? 0), checkouts: Number(cold[0]?.checks ?? 0), note: "visits tagged cold_outreach; a pitch that links back is not tagged, so live links are counted separately" },
      { channel: "Citations and directories", actions: "listings", visits: null, scans: null, checkouts: null, note: "listings carry no referral tag, so visits are NOT MEASURED" },
      { channel: "Search (organic)", actions: "see search-driven work", visits: null, scans: null, checkouts: null, note: "Search Console clicks are not tied to scans or signups, so conversions are NOT MEASURED" },
    ];
    return rows;
  });

  const siteDrafts = await measure("portfolio.siteDrafts", async () => (await buildHouseSiteBriefs(1)).map((b) => ({ name: b.name, total: b.total })));

  const actions = await measure("portfolio.actions", async () => {
    const r = rowsOf<{ t: string; disc: number; acted: number; ver: number; ng: number }>(await db.execute(sql`
      select o.opportunity_type t,
             count(*) filter (where o.created_at >= ${since}::timestamptz)::int disc,
             count(*) filter (where o.acted_at >= ${since}::timestamptz)::int acted,
             count(*) filter (where o.status = 'verified' and o.resolved_at >= ${since}::timestamptz)::int ver,
             count(*) filter (where o.status = 'no_gain' and o.resolved_at >= ${since}::timestamptz)::int ng
      from growth_opportunities o join businesses b on b.id = o.business_id where b.account_type = 'house' group by 1 having
        count(*) filter (where o.created_at >= ${since}::timestamptz) + count(*) filter (where o.acted_at >= ${since}::timestamptz) + count(*) filter (where o.resolved_at >= ${since}::timestamptz) > 0
      order by 1`));
    return r.map((x) => ({ type: x.t, discovered: Number(x.disc), acted: Number(x.acted), verified: Number(x.ver), noGain: Number(x.ng) }));
  });

  const engines = await measure("portfolio.engines", async () => {
    const r = rowsOf<{ name: string; status: string; n: number }>(await db.execute(sql`
      select b.name, o.status, count(*)::int n from growth_opportunities o join businesses b on b.id = o.business_id
      where b.account_type = 'house' group by 1, 2`));
    const map = new Map<string, HouseEngine>();
    for (const x of r) {
      const e = map.get(x.name) ?? { name: x.name, open: 0, acted: 0, verified: 0, noGain: 0 };
      if (x.status === "open") e.open += Number(x.n);
      else if (x.status === "acted") e.acted += Number(x.n);
      else if (x.status === "verified") e.verified += Number(x.n);
      else if (x.status === "no_gain") e.noGain += Number(x.n);
      map.set(x.name, e);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  const health = await measure("portfolio.health", async () => {
    const failed = rowsOf<{ type: string; n: number }>(await db.execute(sql`select type, count(*)::int n from jobs where status = 'failed' and created_at >= ${since}::timestamptz group by 1 order by 2 desc`));
    const sends = rowsOf<{ failed: number; cold: number; fu: number; br: number }>(await db.execute(sql`
      select count(*) filter (where type = 'outreach_send_failed')::int failed, count(*) filter (where type = 'cold_outreach_sent')::int cold,
             count(*) filter (where type = 'cold_outreach_followup_sent')::int fu, count(*) filter (where type = 'cold_outreach_breakup_sent')::int br
      from jobs where created_at >= ${since7}::timestamptz`));
    const wd = rowsOf<{ payload: Record<string, unknown> }>(await db.execute(sql`select payload from jobs where type = 'house_watchdog' order by created_at desc limit 1`));
    return {
      failedJobsByType: Object.fromEntries(failed.map((f) => [f.type, Number(f.n)])),
      sendFailures7d: Number(sends[0]?.failed ?? 0), cold7d: Number(sends[0]?.cold ?? 0), followup7d: Number(sends[0]?.fu ?? 0), breakup7d: Number(sends[0]?.br ?? 0),
      lastWatchdog: wd[0]?.payload ?? null,
    };
  });

  const setup = await measure("portfolio.setup", async () => {
    const h = rowsOf<{ houses: number; citations: number }>(await db.execute(sql`
      select (select count(*) from businesses where account_type = 'house')::int houses,
             (select count(*) from citation_listings l join businesses b on b.id = l.business_id where b.account_type = 'house' and l.status like 'needs_one_time%')::int citations`));
    const live = rowsOf<{ value: unknown }>(await db.execute(sql`select value from ms_settings where key = 'publishing_live_enabled'`));
    const proof = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from proof_ledger`));
    const s = search.ok ? search.value.connected : 0;
    return { houseCount: Number(h[0]?.houses ?? 0), searchConsoleConnected: s, publishingLiveEnabled: live[0] ? live[0].value === true || live[0].value === "true" : null, citationsNeedingOwner: Number(h[0]?.citations ?? 0), proofLedgerEntries: Number(proof[0]?.n ?? 0) };
  });

  return { generatedAt: nowIso, windowDays, offsite, attribution, weekly, revenue, backlinks, search, scanFunnel, siteDrafts, searchDriven, channels, learning, actions, engines, health, setup };
}

const na = "not measured";
const delta = (p: Pair) => `${p.now} (${p.now - p.before >= 0 ? "+" : ""}${p.now - p.before} vs previous period)`;

/** Plain text, no styling, so it reads the same in a terminal, an email or a file. */
export function renderPortfolioReport(r: PortfolioReport): string {
  const out: string[] = [];
  out.push(`GRAVYBLOCK HOUSE ACCOUNTS GROWTH REPORT, generated ${r.generatedAt.slice(0, 16).replace("T", " ")} UTC (last ${r.windowDays} days, compared with the ${r.windowDays} days before)`);
  out.push("");
  out.push("THIS WEEK AT A GLANCE");
  if (!r.weekly.ok) out.push(`  unavailable: ${r.weekly.error}`);
  else {
    const w = r.weekly.value;
    out.push(`  videos published: ${delta(w.videosPublished)}`);
    out.push(`  YouTube views, all videos, lifetime: ${w.viewsLifetime.now} (${w.viewsLifetime.now - w.viewsLifetime.before >= 0 ? "+" : ""}${w.viewsLifetime.now - w.viewsLifetime.before} since the start of the period)`);
    out.push(`  visits to gravyblock.com from video links: ${delta(w.videoVisits)}`);
    out.push(`  scans completed by those visitors: ${delta(w.videoScansCompleted)}`);
    out.push(`  checkouts started by those visitors: ${delta(w.videoCheckouts)}`);
    out.push(`  publications that failed: ${delta(w.publicationsFailed)}`);
  }
  out.push(`  paying customers and revenue: ${r.revenue.ok ? `${r.revenue.value.customers} paying customers, $${r.revenue.value.mrr.toFixed(2)} monthly recurring revenue (house accounts are never counted)` : `unavailable: ${r.revenue.error}`}`);
  out.push(`  verified backlinks: ${r.backlinks.ok ? `${r.backlinks.value.acquired} live and verified in total, ${r.backlinks.value.acquiredThisWeek} new this period, ${r.backlinks.value.inOutreach} pitches still in progress` : `unavailable: ${r.backlinks.error}`}`);
  if (!r.search.ok) out.push(`  search performance: unavailable: ${r.search.error}`);
  else if (!r.search.value.connected) out.push("  search performance (Search Console): not measured, no house site is connected");
  else {
    out.push(`  search performance (Search Console, ${r.search.value.connected} sites connected, latest 28 days): ${r.search.value.clicks28d ?? na} clicks, ${r.search.value.impressions28d ?? na} impressions`);
    for (const s of [...(r.search.value.bySite ?? [])].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)) {
      const d = (cur: number, prev: number) => (cur >= prev ? "+" : "") + (cur - prev);
      out.push(`    ${s.name.padEnd(16)} ${String(s.clicks).padStart(4)} clicks (${d(s.clicks, s.priorClicks)} vs the 28 days before), ${String(s.impressions).padStart(6)} impressions (${d(s.impressions, s.priorImpressions)})`);
    }
  }
  out.push("");
  out.push("OFF-SITE (YouTube, platform counters, lifetime)");
  if (!r.offsite.ok) out.push(`  unavailable: ${r.offsite.error}`);
  else {
    out.push("  product          live  views  likes  comments  failed  waiting  last published");
    for (const p of r.offsite.value) out.push(`  ${p.slug.padEnd(15)} ${String(p.liveVideos).padStart(5)} ${String(p.views).padStart(6)} ${String(p.likes).padStart(6)} ${String(p.comments).padStart(9)} ${String(p.failed).padStart(7)} ${String(p.waiting).padStart(8)}  ${p.lastPublished?.slice(0, 10) ?? "never"}`);
    const t = r.offsite.value.reduce((a, p) => ({ v: a.v + p.liveVideos, w: a.w + p.views, l: a.l + p.likes }), { v: 0, w: 0, l: 0 });
    out.push(`  total: ${t.v} live videos, ${t.w} views, ${t.l} likes`);
  }
  out.push("");
  out.push("TRAFFIC TO gravyblock.com FROM VIDEO LINKS (first-party funnel events, internal sessions excluded)");
  if (!r.attribution.ok) out.push(`  unavailable: ${r.attribution.error}`);
  else if (!r.attribution.value.length) out.push("  no visits tagged utm_source=youtube in the period");
  else for (const a of r.attribution.value) out.push(`  ${a.campaign.padEnd(18)} visits ${a.sessions}, scan page views ${a.scansStarted}, scans completed ${a.scansCompleted}, checkouts ${a.checkouts}, leads ${a.leads}`);
  out.push("  Visits, scans and signups for the other 11 sites: " + na + " here (those sites report their own traffic).");
  out.push("");
  out.push("FREE SCAN BEHAVIOR (distinct visitors this period, internal sessions excluded; interaction events started 2026-11-23, so earlier periods show 0 by construction)");
  if (!r.scanFunnel.ok) out.push(`  unavailable: ${r.scanFunnel.error}`);
  else {
    const f = r.scanFunnel.value;
    out.push(`  viewed the scan page ${f.views} (${f.engaged} showed human input such as a scroll, tap or key press), touched the form ${f.interacted}, submitted ${f.submitted}, hit an error ${f.failed}, completed a scan ${f.completed}`);
    if (f.failures.length) out.push(`  errors shown to visitors: ${f.failures.map((x) => `"${x.detail}" x${x.n}`).join("; ")}`);
  }
  out.push("");
  out.push("SEARCH-DRIVEN WORK (Search Console findings that became actions; a page is judged on its own clicks after 28 days, never on the action itself)");
  if (!r.searchDriven.ok) out.push(`  unavailable: ${r.searchDriven.error}`);
  else {
    const s = r.searchDriven.value;
    out.push(`  queued this period ${s.discovered}, open ${s.open}, acted on ${s.acted}, measured after the window ${s.evaluated}, positive ${s.positive}`);
    if (!s.items.length) out.push("  no search-driven action has been taken yet");
    for (const i of s.items) out.push(`  ${i.site.padEnd(16)} ${i.band.padEnd(14)} ${i.page.replace(/^https?:\/\//, "").slice(0, 52)} baseline clicks ${i.baselineClicks ?? na}, after ${i.afterClicks ?? na}: ${i.measured ?? "waiting for the 28-day window"}`);
  }
  out.push("");
  out.push("CHANNEL COMPARISON (qualified visits, scans and checkouts for gravyblock.com; verdicts need enough volume)");
  if (!r.channels.ok) out.push(`  unavailable: ${r.channels.error}`);
  else for (const c of r.channels.value) out.push(`  ${c.channel.padEnd(26)} ${c.actions}; visits ${c.visits ?? na}, scans ${c.scans ?? na}, checkouts ${c.checkouts ?? na}: ${judgeChannel(c.visits, c.checkouts)} (${c.note})`);
  out.push("");
  out.push("WHAT THE ENGINE LEARNED (backlink outreach by prospect type; a type with 12 or more contacts and no verified link is retired from new pitches)");
  if (!r.learning.ok) out.push(`  unavailable: ${r.learning.error}`);
  else if (!r.learning.value.length) out.push("  no outreach yet");
  else for (const l of r.learning.value) out.push(`  ${l.type.padEnd(18)} contacted ${l.contacted}, verified links ${l.acquired}${l.retired ? "  RETIRED (no result after enough tries)" : ""}`);
  out.push("");
  out.push("GROWTH ACTIONS ON THE HOUSE ACCOUNTS (this period; verified means confirmed on the live surface)");
  if (!r.actions.ok) out.push(`  unavailable: ${r.actions.error}`);
  else if (!r.actions.value.length) out.push("  none recorded");
  else for (const a of r.actions.value) out.push(`  ${a.type.padEnd(18)} discovered ${a.discovered}, acted ${a.acted}, verified ${a.verified}, no gain ${a.noGain}`);
  out.push("");
  if (!r.siteDrafts.ok) out.push(`SITE CHANGES FOR EACH SITE'S OWN AGENT: unavailable: ${r.siteDrafts.error}`);
  else out.push(`SITE CHANGES WAITING FOR EACH SITE'S OWN AGENT (GravyBlock never edits house sites; briefs: scripts/ops/house-site-briefs.ts): ${r.siteDrafts.value.length ? r.siteDrafts.value.map((d) => `${d.name} ${d.total}`).join(", ") : "none"}`);
  out.push("");
  out.push("HOUSE ENGINES (opportunity queue per site)");
  if (!r.engines.ok) out.push(`  unavailable: ${r.engines.error}`);
  else for (const e of r.engines.value) out.push(`  ${e.name.padEnd(16)} open ${e.open}, acted ${e.acted}, verified ${e.verified}, no gain ${e.noGain}`);
  out.push("");
  out.push("HEALTH AND FAILURES");
  if (!r.health.ok) out.push(`  unavailable: ${r.health.error}`);
  else {
    const h = r.health.value;
    const failed = Object.entries(h.failedJobsByType);
    out.push(`  failed jobs in period: ${failed.length ? failed.map(([k, v]) => `${k} ${v}`).join(", ") : "none"}`);
    out.push(`  cold outreach last 7 days: ${h.cold7d} first emails, ${h.followup7d} follow-ups, ${h.breakup7d} final emails, ${h.sendFailures7d} send failures`);
    out.push(`  house watchdog: ${h.lastWatchdog ? `green ${h.lastWatchdog.green}, yellow ${h.lastWatchdog.yellow}, red ${h.lastWatchdog.red} of ${h.lastWatchdog.checked}` : "no run recorded"}`);
  }
  out.push("");
  out.push("SETUP GAPS");
  if (!r.setup.ok) out.push(`  unavailable: ${r.setup.error}`);
  else {
    const s = r.setup.value;
    out.push(`  Search Console connected for ${s.searchConsoleConnected} of ${s.houseCount} house sites`);
    out.push(`  publishing_live_enabled (Meta/Facebook posting): ${s.publishingLiveEnabled === null ? "unknown" : s.publishingLiveEnabled ? "on" : "off"}`);
    out.push(`  directory/citation listings waiting on a one-time owner step: ${s.citationsNeedingOwner}`);
    out.push(`  proof ledger entries (verified outcomes): ${s.proofLedgerEntries}`);
  }
  return out.join("\n");
}

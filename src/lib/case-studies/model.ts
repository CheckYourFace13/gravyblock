/**
 * Growth-story model: pure functions only (no database), so every rule that decides what may be CLAIMED is unit tested.
 *
 * Six stages are kept strictly apart and never inferred from one another:
 *   DISCOVERED   a finding or prospect was found
 *   RECOMMENDED  a brief was written for the site's own agent
 *   EXECUTED     GravyBlock actually did something off site (an email sent, a video published)
 *   VERIFIED     the result was confirmed on the other party's live page (a link found)
 *   MEASURED     a number was read from Search Console (or another independent source) over a stated window
 *   ATTRIBUTABLE the measured change can reasonably be put down to GravyBlock's verified work (rare, with explicit conditions)
 * A sent email, a brief or a found problem is never presented as the cause of later traffic.
 */

export type Daily = { day: string; clicks: number; impressions: number; position: number };
export type DayWindow = { start: string; end: string };
export type WindowStat = DayWindow & { days: number; daysWithData: number; clicks: number; impressions: number; position: number | null };

const DAY = 86_400_000;
export const addDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

export function sumWindow(daily: Daily[], w: DayWindow): WindowStat {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  let daysWithData = 0;
  for (const d of daily) {
    if (d.day < w.start || d.day > w.end) continue;
    daysWithData++;
    clicks += d.clicks;
    impressions += d.impressions;
    weighted += d.position * d.impressions;
  }
  return { ...w, days: daysBetween(w.start, w.end) + 1, daysWithData, clicks, impressions, position: impressions ? Number((weighted / impressions).toFixed(1)) : null };
}

/** Search Console lags about three days, so a window counts as elapsed only once its last day is at least that old. */
export const GSC_LAG_DAYS = 3;

export type StoryWindows = {
  baseline: DayWindow;
  /** the 30 complete days that end 30, 60 and 90 days after the start; `elapsed` is false until Search Console can have them */
  after: Array<{ label: "30" | "60" | "90"; window: DayWindow; elapsed: boolean }>;
  latest: DayWindow;
};

export function storyWindows(startDay: string, today: string): StoryWindows {
  const baseline = { start: addDays(startDay, -30), end: addDays(startDay, -1) };
  const after = ([30, 60, 90] as const).map((n) => {
    const window = { start: addDays(startDay, n - 30), end: addDays(startDay, n - 1) };
    return { label: String(n) as "30" | "60" | "90", window, elapsed: window.end <= addDays(today, -GSC_LAG_DAYS) };
  });
  const latestEnd = addDays(today, -GSC_LAG_DAYS);
  return { baseline, after, latest: { start: addDays(latestEnd, -29), end: latestEnd } };
}

export type Placement = { verifiedAt: string; targetPage: string | null; from: string };
export type PageMeasure = { pageClicksBefore: number; pageClicksAfter: number; siteClicksBefore: number; siteClicksAfter: number };
export type Attribution = { attributable: boolean; reasons: string[] };

/**
 * ATTRIBUTABLE only when ALL hold: a placement was verified on a live third-party page; the linked page's own clicks were measured before and after it;
 * the gain is large enough to mean something (at least 10 clicks and at least 20 clicks after); and the page grew clearly faster than the rest of the site
 * (a site-wide rise is never credited to one link). Anything else is reported as a measured change with no claim of cause.
 */
export function judgeAttribution(input: { placements: Placement[]; measure: PageMeasure | null }): Attribution {
  const reasons: string[] = [];
  if (!input.placements.length) reasons.push("no live link or placement has been verified on another site");
  if (!input.measure) reasons.push("no before and after measurement of the linked page has been taken");
  if (input.measure) {
    const m = input.measure;
    const gain = m.pageClicksAfter - m.pageClicksBefore;
    if (gain < 10 || m.pageClicksAfter < 20) reasons.push("the linked page's click gain is too small to read as a result");
    const pageRatio = (m.pageClicksAfter + 1) / (m.pageClicksBefore + 1);
    const siteRatio = (m.siteClicksAfter + 1) / (m.siteClicksBefore + 1);
    if (pageRatio < siteRatio * 1.5) reasons.push("the page did not grow clearly faster than the rest of the site");
  }
  return { attributable: reasons.length === 0, reasons };
}

export type Stage = "DISCOVERED" | "RECOMMENDED" | "EXECUTED" | "VERIFIED" | "MEASURED" | "ATTRIBUTABLE";
export type Claim = { key: string; stage: Stage; template: string; values: Record<string, string> };

export const renderClaim = (c: { template: string; values: Record<string, string> }): string => c.template.replace(/\{(\w+)\}/g, (_, k: string) => c.values[k] ?? "n/a");

const pct = (a: number, b: number): string => (b === 0 ? "n/a" : `${a >= b ? "+" : "-"}${Math.abs(Math.round(((a - b) / b) * 100))}%`);
const fmt = (n: number): string => n.toLocaleString("en-US");
const longDay = (iso: string): string => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export type ClaimInput = {
  startDay: string | null;
  baseline: WindowStat | null;
  latest: WindowStat | null;
  emailsSent: number;
  organisations: number;
  videos: number;
  linksVerified: number;
  attribution: Attribution;
  droppedPages?: { lost: number; before: number; impressionsBefore: number; impressionsNow: number } | null;
};

/** Draft claims written from verified numbers only. Wording is fixed here, so an owner approves sentences, and only the numbers inside them can refresh. */
export function draftClaims(i: ClaimInput): Claim[] {
  const c: Claim[] = [];
  if (i.startDay) c.push({ key: "start", stage: "EXECUTED", template: "GravyBlock's first off-site action for this site was on {date}. Every comparison below starts from the 30 days before that date.", values: { date: longDay(i.startDay) } });
  if (i.emailsSent > 0) c.push({ key: "outreach", stage: "EXECUTED", template: "GravyBlock has sent {emails} outreach emails to {orgs} relevant organisations. A sent email is an action, not a result.", values: { emails: fmt(i.emailsSent), orgs: fmt(i.organisations) } });
  if (i.videos > 0) c.push({ key: "videos", stage: "EXECUTED", template: "{videos} product videos have been published to YouTube with tagged links back to the site.", values: { videos: fmt(i.videos) } });
  c.push({
    key: "links",
    stage: "VERIFIED",
    template: i.linksVerified > 0 ? "{links} live links from other sites have been independently found and verified." : "No live link from another site has been verified yet.",
    values: { links: fmt(i.linksVerified) },
  });
  if (i.baseline && i.latest) {
    c.push({
      key: "clicks",
      stage: "MEASURED",
      template: "Google search clicks in the 30 days to {latestEnd}: {latest}, compared with {before} in the 30 days before GravyBlock started ({change}). Source: Google Search Console.",
      values: { latestEnd: longDay(i.latest.end), latest: fmt(i.latest.clicks), before: fmt(i.baseline.clicks), change: pct(i.latest.clicks, i.baseline.clicks) },
    });
    c.push({
      key: "impressions",
      stage: "MEASURED",
      template: "Google search impressions over the same two windows: {latest} now, {before} before ({change}).",
      values: { latest: fmt(i.latest.impressions), before: fmt(i.baseline.impressions), change: pct(i.latest.impressions, i.baseline.impressions) },
    });
  }
  if (i.droppedPages) {
    c.push({
      key: "indexing",
      stage: "MEASURED",
      template: "In the latest Search Console comparison, {lost} of {before} pages that earned Google impressions earlier earned none (impressions {impBefore} to {impNow}). The site's own developer has the findings; recovery is being tracked.",
      values: { lost: fmt(i.droppedPages.lost), before: fmt(i.droppedPages.before), impBefore: fmt(i.droppedPages.impressionsBefore), impNow: fmt(i.droppedPages.impressionsNow) },
    });
  }
  c.push({
    key: "attribution",
    stage: "ATTRIBUTABLE",
    template: i.attribution.attributable
      ? "A verified placement and a before-and-after measurement of the linked page support crediting part of that page's gain to GravyBlock's work."
      : "These measurements describe what changed, not what caused it. Changes in search traffic have many causes, and GravyBlock does not claim credit for them without a verified placement and a page-level before-and-after result.",
    values: {},
  });
  return c;
}

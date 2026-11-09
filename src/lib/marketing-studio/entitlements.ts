/**
 * Plan-controlled video allowance. Nothing here is a universal frequency: each product has an entitlement (a plan preset plus optional overrides, stored as a
 * setting) saying how many NEW qualified videos a billing period allows, how far apart they must be, whether unused allowance carries over, and what branding
 * attribution the plan carries. The numbers below are PROVISIONAL placeholders; commercial limits are finalized later and only this table (or a per-product
 * override) changes.
 *
 * Two rules sit above the numbers:
 *   - Quality beats quota. An allowance is a ceiling, never a target. Nothing is generated to use it up: when no strong distinct opportunity exists the product
 *     waits (WAITING_FOR_NEW_OPPORTUNITY) and the allowance stays unspent. A video is counted only once its script has passed every gate and is queued or reviewed.
 *   - Corrections are free. A replacement made because the owner requested changes to an existing video never consumes a new-video allowance.
 */
import { and, eq, inArray } from "drizzle-orm";
import { ms, type StudioDb } from "./db";
import { getSetting } from "./runtime";
import { listReviews } from "./publishing/video-review";

export type PlanKey = "portfolio" | "starter" | "growth" | "pro" | "agency";
export type Period = "week" | "month";
export type AttributionMode = "required" | "subtle" | "none";

export type Entitlement = {
  plan: PlanKey;
  label: string;
  /** null = no cap (the owner's own portfolio) */
  videosPerPeriod: number | null;
  period: Period;
  minSpacingDays: number;
  /** unused allowance from the previous period may be used in this one (at most one period's worth) */
  carryOver: boolean;
  attribution: AttributionMode;
};

/** PROVISIONAL plan presets. Names and limits are placeholders until pricing is final. */
export const PLAN_ENTITLEMENTS: Record<PlanKey, Entitlement> = {
  portfolio: { plan: "portfolio", label: "iScream portfolio", videosPerPeriod: null, period: "month", minSpacingDays: 0, carryOver: false, attribution: "none" },
  starter: { plan: "starter", label: "Starter", videosPerPeriod: 1, period: "month", minSpacingDays: 14, carryOver: false, attribution: "required" },
  growth: { plan: "growth", label: "Growth", videosPerPeriod: 1, period: "week", minSpacingDays: 5, carryOver: false, attribution: "subtle" },
  pro: { plan: "pro", label: "Pro", videosPerPeriod: 3, period: "week", minSpacingDays: 2, carryOver: true, attribution: "subtle" },
  agency: { plan: "agency", label: "Agency", videosPerPeriod: 6, period: "week", minSpacingDays: 1, carryOver: true, attribution: "none" },
};

export type ProductEntitlement = {
  plan: PlanKey;
  overrides?: Partial<Pick<Entitlement, "videosPerPeriod" | "period" | "minSpacingDays" | "carryOver" | "attribution">>;
  /** day of the month (1 to 28) a monthly billing period starts on; default 1 */
  anchorDay?: number;
};
export const entitlementKey = (productId: string) => `video_entitlement_${productId}`;

export async function entitlementFor(db: StudioDb, product: { id: string; ownerKind?: string }): Promise<Entitlement & { anchorDay: number }> {
  const stored = await getSetting<ProductEntitlement | null>(entitlementKey(product.id), null, db);
  const plan: PlanKey = stored?.plan && stored.plan in PLAN_ENTITLEMENTS ? stored.plan : product.ownerKind === "customer" ? "starter" : "portfolio";
  return { ...PLAN_ENTITLEMENTS[plan], ...(stored?.overrides ?? {}), anchorDay: Math.min(28, Math.max(1, stored?.anchorDay ?? 1)) };
}

export type VideoEvent = { at: number; kind: "new" | "replacement" };
export type Allowance = {
  plan: PlanKey;
  label: string;
  period: Period;
  periodStart: string;
  periodEnd: string;
  /** null = uncapped */
  allowance: number | null;
  carried: number;
  generated: number;
  replacements: number;
  remaining: number | null;
  /** earliest moment a new video may start, or null when none is blocked by plan limits */
  nextEligibleAt: string | null;
  eligible: boolean;
  reason: string;
};

const DAY = 86_400_000;
/** Start of the billing period containing `t` (UTC): the Monday of the week, or the anchor day of the month. */
export function periodStart(period: Period, t: number, anchorDay = 1): number {
  const d = new Date(t);
  if (period === "week") {
    const day = (d.getUTCDay() + 6) % 7;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  }
  const thisMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), anchorDay);
  return t >= thisMonth ? thisMonth : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, anchorDay);
}
export function periodEnd(period: Period, start: number, anchorDay = 1): number {
  if (period === "week") return start + 7 * DAY;
  const d = new Date(start);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, anchorDay);
}
const prevStart = (period: Period, start: number, anchorDay: number) => periodStart(period, start - 1, anchorDay);

/** Pure: what the plan allows right now, given the new-video and replacement events so far. */
export function computeAllowance(ent: Entitlement & { anchorDay?: number }, events: VideoEvent[], now: number): Allowance {
  const anchor = ent.anchorDay ?? 1;
  const start = periodStart(ent.period, now, anchor);
  const end = periodEnd(ent.period, start, anchor);
  const inPeriod = (e: VideoEvent) => e.at >= start && e.at < end;
  const news = events.filter((e) => e.kind === "new");
  const generated = news.filter(inPeriod).length;
  const replacements = events.filter((e) => e.kind === "replacement" && inPeriod(e)).length;
  const last = news.reduce((m, e) => Math.max(m, e.at), 0);
  const spacingOk = ent.minSpacingDays <= 0 || last === 0 || now >= last + ent.minSpacingDays * DAY;
  const spacingAt = last ? last + ent.minSpacingDays * DAY : 0;
  const base = { plan: ent.plan, label: ent.label, period: ent.period, periodStart: new Date(start).toISOString(), periodEnd: new Date(end).toISOString(), generated, replacements };
  if (ent.videosPerPeriod === null) return { ...base, allowance: null, carried: 0, remaining: null, nextEligibleAt: null, eligible: true, reason: "no plan cap" };
  let carried = 0;
  if (ent.carryOver) {
    const ps = prevStart(ent.period, start, anchor);
    const prevGenerated = news.filter((e) => e.at >= ps && e.at < start).length;
    carried = Math.min(ent.videosPerPeriod, Math.max(0, ent.videosPerPeriod - prevGenerated));
  }
  const allowance = ent.videosPerPeriod + carried;
  const remaining = Math.max(0, allowance - generated);
  const eligible = remaining > 0 && spacingOk;
  let nextEligibleAt: string | null = null;
  let reason = "a new video may start";
  if (remaining === 0) {
    nextEligibleAt = new Date(Math.max(end, spacingAt)).toISOString();
    reason = `this ${ent.period}'s allowance of ${allowance} is used`;
  } else if (!spacingOk) {
    nextEligibleAt = new Date(spacingAt).toISOString();
    reason = `new videos are spaced at least ${ent.minSpacingDays} days apart`;
  }
  return { ...base, allowance, carried, remaining, nextEligibleAt, eligible, reason };
}

/** Every new video and replacement the product has had, from its reviews (one script = one new video; each extra version of it is a replacement) plus scripts in flight. */
export async function videoEventsFor(db: StudioDb, productId: string, now = Date.now()): Promise<VideoEvent[]> {
  const reviews = (await listReviews(db)).filter((r) => r.productId === productId);
  const bySpec = new Map<string, number[]>();
  for (const r of reviews) {
    const k = r.specId ?? r.publicationId;
    bySpec.set(k, [...(bySpec.get(k) ?? []), Date.parse(r.uploadedAt)]);
  }
  const events: VideoEvent[] = [];
  for (const times of bySpec.values()) {
    times.sort((a, b) => a - b);
    events.push({ at: times[0], kind: "new" }, ...times.slice(1).map((at) => ({ at, kind: "replacement" as const })));
  }
  const inflight = await db.select({ input: ms.msMediaJobs.input }).from(ms.msMediaJobs).where(and(eq(ms.msMediaJobs.productId, productId), eq(ms.msMediaJobs.kind, "library_video"), inArray(ms.msMediaJobs.status, ["queued", "running"])));
  for (const j of inflight) {
    const spec = (j.input as { specId?: string } | null)?.specId;
    if (spec && !bySpec.has(spec)) events.push({ at: now, kind: "new" });
  }
  return events;
}

export async function allowanceFor(db: StudioDb, product: { id: string; ownerKind?: string }, now = Date.now()): Promise<Allowance> {
  return computeAllowance(await entitlementFor(db, product), await videoEventsFor(db, product.id, now), now);
}

/** Approved and published counts this period, for the customer's usage view. */
export async function outcomesFor(db: StudioDb, productId: string, now = Date.now(), ent?: Entitlement & { anchorDay?: number }): Promise<{ approved: number; published: number }> {
  const e = ent ?? { ...PLAN_ENTITLEMENTS.portfolio, anchorDay: 1 };
  const start = periodStart(e.period, now, e.anchorDay ?? 1);
  const reviews = (await listReviews(db)).filter((r) => r.productId === productId);
  const t = (s?: string) => (s ? Date.parse(s) : 0);
  return { approved: reviews.filter((r) => t(r.approvedAt) >= start).length, published: reviews.filter((r) => t(r.publicAt) >= start).length };
}

// ---- branding attribution -----------------------------------------------------------------------------------------------------------------------

export const ATTRIBUTION_LINE = "Created automatically by GravyBlock Marketing Studio";
export const ATTRIBUTION_SUBTLE = "Created with GravyBlock";
export const attributionKey = (productId: string) => `video_attribution_${productId}`;

/** The end-card line for a mode. It is small, below the customer's own call to action, and never replaces the customer's logo or name. */
export const attributionText = (mode: AttributionMode): string | null => (mode === "required" ? ATTRIBUTION_LINE : mode === "subtle" ? ATTRIBUTION_SUBTLE : null);

/**
 * GravyBlock's own videos always say it; the owner's other portfolio products do not unless asked; customers follow a per-product setting if one exists (only the
 * owner/admin may remove it, as a white-label option), else their plan's mode.
 */
export async function attributionFor(db: StudioDb, product: { id: string; slug?: string; ownerKind?: string }): Promise<string | null> {
  if (product.slug === "gravyblock") return ATTRIBUTION_LINE;
  const override = await getSetting<AttributionMode | null>(attributionKey(product.id), null, db);
  if (override === "required" || override === "subtle" || override === "none") return attributionText(override);
  return attributionText((await entitlementFor(db, product)).attribution);
}

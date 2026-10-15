import { and, inArray, sql } from "drizzle-orm";
import { getDb, businesses } from "@/lib/db";
import { getStripeServerClient } from "@/lib/stripe/server";
import { getInternalBusinesses, SCAN_ORIGINS } from "./classification";

/**
 * Acquisition numbers for the internal daily report and /admin/acquisition. Rules:
 *  1. Owner, staff, QA/test and house accounts are never customers, revenue or conversions.
 *  2. Public website visitors and cold-outreach recipients are reported as separate funnels.
 *  3. First-party funnel events are the source of truth; raw page views and system-generated scans are never counted as prospects.
 *  4. 0 means "measured zero". A query that fails is `null` / `ok: false` and is shown as Unavailable, never as 0.
 *
 * Every function here is read-only. Classification writes live in classification.ts and run separately.
 */

export type Metric<T> = { ok: true; value: T } | { ok: false; error: string };

/** Runs one metric, logs the real error if it fails, and never throws. */
export async function measure<T>(label: string, fn: () => Promise<T>): Promise<Metric<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    const cause = (error as { cause?: { message?: string } } | undefined)?.cause?.message;
    const message = cause ?? (error instanceof Error ? error.message : String(error));
    console.error(`[reporting] ${label} failed: ${message}`);
    return { ok: false, error: message.slice(0, 300) };
  }
}

/** postgres.js cannot bind a JS Date inside a raw sql template; bind an ISO string and cast it. */
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

export type RealCustomer = { id: string; name: string; email: string; monthly: number; since: Date };
export type CustomerSummary = { customers: RealCustomer[]; mrr: number; excluded: { name: string; reason: string }[] };

/** Paying customers: an outside business with an active or trialing Stripe subscription. */
export async function getRealCustomers(): Promise<CustomerSummary> {
  const db = getDb();
  if (!db) throw new Error("database unavailable");
  const internal = await getInternalBusinesses();
  const paid = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      planTier: businesses.planTier,
      billingEmail: businesses.billingEmail,
      stripeSubscriptionId: businesses.stripeSubscriptionId,
      subscriptionStatus: businesses.subscriptionStatus,
      createdAt: businesses.createdAt,
    })
    .from(businesses)
    .where(and(sql`${businesses.planTier} <> 'free'`, inArray(businesses.subscriptionStatus, ["active", "trialing"])));

  const stripe = getStripeServerClient();
  const customers: RealCustomer[] = [];
  const excluded: { name: string; reason: string }[] = [];
  for (const b of paid) {
    const reason = internal.get(b.id);
    if (reason) {
      excluded.push({ name: b.name ?? "(unnamed)", reason });
      continue;
    }
    if (!b.stripeSubscriptionId) {
      excluded.push({ name: b.name ?? "(unnamed)", reason: "no_stripe_subscription" });
      continue;
    }
    let monthly = 0;
    if (stripe) {
      try {
        const sub = await stripe.subscriptions.retrieve(b.stripeSubscriptionId, { expand: ["items.data.price"] });
        if (sub.status !== "active" && sub.status !== "trialing") {
          excluded.push({ name: b.name ?? "(unnamed)", reason: `stripe_status_${sub.status}` });
          continue;
        }
        const unit = sub.items?.data?.[0]?.price?.unit_amount;
        monthly = unit != null ? unit / 100 : 0;
      } catch {
        // Stripe could not confirm this subscription: do not count it as a customer or as revenue.
        excluded.push({ name: b.name ?? "(unnamed)", reason: "stripe_subscription_unverifiable" });
        continue;
      }
    }
    customers.push({ id: b.id, name: b.name ?? "(unnamed)", email: b.billingEmail ?? "—", monthly, since: new Date(b.createdAt) });
  }
  return { customers, mrr: customers.reduce((s, c) => s + c.monthly, 0), excluded };
}

export type ScanCounts = { public: number; outreach: number; internal: number; system: number; unknown: number; total: number };

/** Scan counts by origin. The legacy `free_scan` value (and anything unrecognized) is reported as unknown. */
export async function getScanCounts(since?: Date): Promise<ScanCounts> {
  const db = getDb();
  if (!db) throw new Error("database unavailable");
  const rows = (await db.execute(
    since
      ? sql`select source, count(*)::int as n from scans where created_at >= ${ts(since)} group by source`
      : sql`select source, count(*)::int as n from scans group by source`,
  )) as unknown as Array<{ source: string | null; n: number }>;
  const out: ScanCounts = { public: 0, outreach: 0, internal: 0, system: 0, unknown: 0, total: 0 };
  for (const r of rows) {
    const n = Number(r.n);
    out.total += n;
    if (r.source === SCAN_ORIGINS.public) out.public += n;
    else if (r.source === SCAN_ORIGINS.outreach) out.outreach += n;
    else if (r.source === SCAN_ORIGINS.internal) out.internal += n;
    else if (r.source === SCAN_ORIGINS.system) out.system += n;
    else out.unknown += n;
  }
  return out;
}

type Row = { n: number };

const uuidList = (ids: string[]) => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);

async function distinctSessions(eventTypes: string[], since: Date, outreach: boolean, internalIds: string[]): Promise<number> {
  const db = getDb();
  if (!db) throw new Error("database unavailable");
  const types = sql.join(eventTypes.map((t) => sql`${t}`), sql`, `);
  const internalFilter = internalIds.length
    ? sql`and (e.business_id is null or e.business_id not in (${uuidList(internalIds)}))
          and (e.session_id not in (select session_id from funnel_events where business_id in (${uuidList(internalIds)}) and session_id is not null))`
    : sql``;
  const outreachSessions = sql`(select distinct session_id from funnel_events where session_id is not null and (utm_source = 'cold_outreach' or metadata->>'attributionToken' is not null))`;
  const rows = (await db.execute(sql`
    select count(distinct e.session_id)::int as n
    from funnel_events e
    where e.event_type in (${types}) and e.session_id is not null and e.created_at >= ${ts(since)}
      and e.session_id ${outreach ? sql`in` : sql`not in`} ${outreachSessions}
      ${internalFilter}`)) as unknown as Row[];
  return Number(rows[0]?.n ?? 0);
}

/** Completed checkouts are written by the Stripe webhook (no browser session), so count distinct paying businesses instead. */
async function paidBusinesses(since: Date, outreach: boolean, internalIds: string[]): Promise<number> {
  const db = getDb();
  if (!db) throw new Error("database unavailable");
  const internalFilter = internalIds.length ? sql`and e.business_id not in (${uuidList(internalIds)})` : sql``;
  const rows = (await db.execute(sql`
    select count(distinct e.business_id)::int as n from funnel_events e
    where e.event_type = 'checkout_completed' and e.business_id is not null and e.created_at >= ${ts(since)}
      and (e.metadata->>'attributionToken' is not null) = ${outreach}
      ${internalFilter}`)) as unknown as Row[];
  return Number(rows[0]?.n ?? 0);
}

/** Each stage is measured on its own: a failed stage is `null` (Unavailable), the rest still render. */
export type PublicFunnel = {
  visitors: number | null;
  scanStarted: number | null;
  scanCompleted: number | null;
  unlocked: number | null;
  startClicked: number | null;
  checkoutStarted: number | null;
  paid: number | null;
};

const orNull = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
  const m = await measure(label, fn);
  return m.ok ? m.value : null;
};

/** Genuine public website funnel (outreach sessions and internal sessions excluded) for a window. */
export async function getPublicFunnel(since: Date): Promise<PublicFunnel> {
  const internalMetric = await measure("internal accounts", async () => [...(await getInternalBusinesses()).keys()]);
  if (!internalMetric.ok) {
    // Without the internal-account list the funnel cannot be trusted, so every stage is unavailable.
    return { visitors: null, scanStarted: null, scanCompleted: null, unlocked: null, startClicked: null, checkoutStarted: null, paid: null };
  }
  const internal = internalMetric.value;
  const c = (label: string, types: string[]) => orNull(`public ${label}`, () => distinctSessions(types, since, false, internal));
  const [visitors, scanStarted, scanCompleted, unlocked, startClicked, checkoutStarted, paid] = await Promise.all([
    c("visitors", ["scan_started", "pricing_viewed", "report_landed"]),
    c("scan started", ["scan_started"]),
    c("scan completed", ["scan_completed"]),
    c("unlocked", ["report_unlocked"]),
    c("start clicked", ["scale_cta_clicked"]),
    c("checkout started", ["checkout_started"]),
    orNull("public paid", () => paidBusinesses(since, false, internal)),
  ]);
  return { visitors, scanStarted, scanCompleted, unlocked, startClicked, checkoutStarted, paid };
}

export type OutreachFunnel = {
  delivered: number | null;
  reportVisits: number | null;
  unlocked: number | null;
  checkoutStarted: number | null;
  paid: number | null;
};

/** Cold-outreach funnel, kept separate from public traffic. Read-only; never touches the A/B experiment. */
export async function getOutreachFunnel(since: Date): Promise<OutreachFunnel> {
  const db = getDb();
  const internalMetric = await measure("internal accounts", async () => [...(await getInternalBusinesses()).keys()]);
  const internal = internalMetric.ok ? internalMetric.value : null;
  const delivered = await orNull("outreach delivered", async () => {
    if (!db) throw new Error("database unavailable");
    const rows = (await db.execute(sql`
      select count(*)::int as n from outreach_sends
      where is_test = 'false' and sequence_step = 'initial' and delivered_at is not null and delivered_at >= ${ts(since)}`)) as unknown as Row[];
    return Number(rows[0]?.n ?? 0);
  });
  const o = (label: string, types: string[]) => (internal ? orNull(`outreach ${label}`, () => distinctSessions(types, since, true, internal)) : Promise.resolve(null));
  const [reportVisits, unlocked, checkoutStarted, paid] = await Promise.all([
    o("report visits", ["report_landed"]),
    o("unlocked", ["report_unlocked"]),
    o("checkout started", ["checkout_started"]),
    internal ? orNull("outreach paid", () => paidBusinesses(since, true, internal)) : Promise.resolve(null),
  ]);
  return { delivered, reportVisits, unlocked, checkoutStarted, paid };
}

export const show = (v: number | null) => (v === null ? "Unavailable" : v.toLocaleString());
export const pct = (num: number | null, den: number | null) => (num === null || den === null ? "n/a" : den > 0 ? `${Math.round((num / den) * 100)}%` : "n/a");

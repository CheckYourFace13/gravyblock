import { and, inArray, sql } from "drizzle-orm";
import { getDb, businesses } from "@/lib/db";
import { getStripeServerClient } from "@/lib/stripe/server";
import { getInternalBusinesses, SCAN_ORIGINS } from "./classification";

/**
 * Acquisition numbers for the internal daily report. Three rules keep them honest:
 *  1. Owner, staff, QA/test and house accounts are never customers, revenue or conversions.
 *  2. Public website visitors and cold-outreach recipients are reported as separate funnels.
 *  3. First-party funnel events are the source of truth; raw page views and system-generated scans are never counted as prospects.
 */

export type RealCustomer = { id: string; name: string; email: string; monthly: number; since: Date };

/** Paying customers: an outside business with an active or trialing Stripe subscription. */
export async function getRealCustomers(): Promise<{ customers: RealCustomer[]; mrr: number; excluded: { name: string; reason: string }[] }> {
  const db = getDb();
  if (!db) return { customers: [], mrr: 0, excluded: [] };
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
      excluded.push({ name: b.name, reason });
      continue;
    }
    if (!b.stripeSubscriptionId) {
      excluded.push({ name: b.name, reason: "no_stripe_subscription" });
      continue;
    }
    let monthly = 0;
    if (stripe) {
      try {
        const sub = await stripe.subscriptions.retrieve(b.stripeSubscriptionId, { expand: ["items.data.price"] });
        if (sub.status !== "active" && sub.status !== "trialing") {
          excluded.push({ name: b.name, reason: `stripe_status_${sub.status}` });
          continue;
        }
        const unit = sub.items?.data?.[0]?.price?.unit_amount;
        monthly = unit != null ? unit / 100 : 0;
      } catch {
        monthly = 0;
      }
    }
    customers.push({ id: b.id, name: b.name, email: b.billingEmail ?? "—", monthly, since: new Date(b.createdAt) });
  }
  return { customers, mrr: customers.reduce((s, c) => s + c.monthly, 0), excluded };
}

export type ScanCounts = { public: number; outreach: number; internal: number; system: number; unknown: number; total: number };

/** All-time and windowed scan counts by origin (the legacy `free_scan` value is reported as unknown). */
export async function getScanCounts(since?: Date): Promise<ScanCounts> {
  const db = getDb();
  const zero: ScanCounts = { public: 0, outreach: 0, internal: 0, system: 0, unknown: 0, total: 0 };
  if (!db) return zero;
  const rows = (await db.execute(
    since
      ? sql`select source, count(*)::int as n from scans where created_at >= ${since} group by source`
      : sql`select source, count(*)::int as n from scans group by source`,
  )) as unknown as Array<{ source: string; n: number }>;
  const out = { ...zero };
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

export type PublicFunnel = {
  visitors: number;
  scanStarted: number;
  scanCompleted: number;
  unlocked: number;
  startClicked: number;
  checkoutStarted: number;
  paid: number;
};

type Row = { n: number };

/** Completed checkouts are written by the Stripe webhook (no browser session), so count distinct paying businesses instead. */
async function paidBusinesses(since: Date, outreach: boolean, internalIds: string[]): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const internalFilter = internalIds.length ? sql`and e.business_id not in (${sql.join(internalIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``;
  const rows = (await db.execute(sql`
    select count(distinct e.business_id)::int as n from funnel_events e
    where e.event_type = 'checkout_completed' and e.business_id is not null and e.created_at >= ${since}
      and (e.metadata->>'attributionToken' is not null) = ${outreach}
      ${internalFilter}`)) as unknown as Row[];
  return Number(rows[0]?.n ?? 0);
}

async function distinctSessions(eventTypes: string[], since: Date, outreach: boolean, internalIds: string[]): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const types = sql.join(eventTypes.map((t) => sql`${t}`), sql`, `);
  const internalFilter = internalIds.length
    ? sql`and (e.business_id is null or e.business_id not in (${sql.join(internalIds.map((id) => sql`${id}::uuid`), sql`, `)}))
          and (e.session_id not in (select session_id from funnel_events where business_id in (${sql.join(internalIds.map((id) => sql`${id}::uuid`), sql`, `)}) and session_id is not null))`
    : sql``;
  const outreachSessions = sql`(select distinct session_id from funnel_events where session_id is not null and (utm_source = 'cold_outreach' or metadata->>'attributionToken' is not null))`;
  const q = sql`
    select count(distinct e.session_id)::int as n
    from funnel_events e
    where e.event_type in (${types}) and e.session_id is not null and e.created_at >= ${since}
      and e.session_id ${outreach ? sql`in` : sql`not in`} ${outreachSessions}
      ${internalFilter}`;
  const rows = (await db.execute(q)) as unknown as Row[];
  return Number(rows[0]?.n ?? 0);
}

/** Genuine public website funnel (outreach sessions and internal sessions excluded) for a window. */
export async function getPublicFunnel(since: Date): Promise<PublicFunnel> {
  const internal = [...(await getInternalBusinesses()).keys()];
  const c = (types: string[]) => distinctSessions(types, since, false, internal);
  const [visitors, scanStarted, scanCompleted, unlocked, startClicked, checkoutStarted, paid] = await Promise.all([
    c(["scan_started", "pricing_viewed", "report_landed"]),
    c(["scan_started"]),
    c(["scan_completed"]),
    c(["report_unlocked"]),
    c(["scale_cta_clicked"]),
    c(["checkout_started"]),
    paidBusinesses(since, false, internal),
  ]);
  return { visitors, scanStarted, scanCompleted, unlocked, startClicked, checkoutStarted, paid };
}

export type OutreachFunnel = { delivered: number; reportVisits: number; unlocked: number; checkoutStarted: number; paid: number };

/** Cold-outreach funnel, kept separate from public traffic. Read-only; never touches the A/B experiment. */
export async function getOutreachFunnel(since: Date): Promise<OutreachFunnel> {
  const db = getDb();
  if (!db) return { delivered: 0, reportVisits: 0, unlocked: 0, checkoutStarted: 0, paid: 0 };
  const internal = [...(await getInternalBusinesses()).keys()];
  const rows = (await db.execute(sql`
    select count(*)::int as n from outreach_sends
    where is_test = 'false' and sequence_step = 'initial' and delivered_at is not null and delivered_at >= ${since}`)) as unknown as Row[];
  const delivered = Number(rows[0]?.n ?? 0);
  const [reportVisits, unlocked, checkoutStarted, paid] = await Promise.all([
    distinctSessions(["report_landed"], since, true, internal),
    distinctSessions(["report_unlocked"], since, true, internal),
    distinctSessions(["checkout_started"], since, true, internal),
    paidBusinesses(since, true, internal),
  ]);
  return { delivered, reportVisits, unlocked, checkoutStarted, paid };
}

export const pct = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : "n/a");

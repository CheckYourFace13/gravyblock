import { getDb, businesses } from "@/lib/db";
import { planFeatures, normalizePlanTierFromDb, type PlanTier } from "@/lib/plans";
import { eq, gte, or, and, ne } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "MRR Dashboard — GravyBlock Admin" };

const PAID_TIERS: PlanTier[] = ["starter", "growth", "pro", "agency"];

type TierStat = {
  tier: PlanTier;
  label: string;
  count: number;
  mrr: number;
  introMrr: number;
};

async function getMrrData() {
  const db = getDb();
  if (!db) {
    return { tiers: [] as TierStat[], total: 0, totalIntro: 0, recentNew: 0, recentChurn: 0, allActive: [] as { id: string; name: string; planTier: string; subscriptionStatus: string | null; billingEmail: string | null; currentPeriodEnd: Date | null }[] };
  }

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [allBiz, recentNewBiz] = await Promise.all([
    db.select({
      id: businesses.id,
      name: businesses.name,
      planTier: businesses.planTier,
      subscriptionStatus: businesses.subscriptionStatus,
      billingEmail: businesses.billingEmail,
      currentPeriodEnd: businesses.currentPeriodEnd,
      createdAt: businesses.createdAt,
    }).from(businesses),
    db.select({ id: businesses.id }).from(businesses).where(
      and(
        gte(businesses.createdAt, monthAgo),
        or(...PAID_TIERS.map(t => eq(businesses.planTier, t))),
      )
    ),
  ]);

  const active = allBiz.filter(b => {
    const tier = normalizePlanTierFromDb(b.planTier);
    return PAID_TIERS.includes(tier) && (b.subscriptionStatus === "active" || b.subscriptionStatus === "trialing");
  });

  const churned = allBiz.filter(b =>
    b.subscriptionStatus === "canceled" || b.subscriptionStatus === "past_due_downgraded"
  );

  const recentChurn = churned.filter(b => {
    if (!b.currentPeriodEnd) return false;
    return b.currentPeriodEnd.getTime() >= monthAgo.getTime();
  }).length;

  const tiers: TierStat[] = PAID_TIERS.map(tier => {
    const f = planFeatures(tier);
    const bizForTier = active.filter(b => normalizePlanTierFromDb(b.planTier) === tier);
    return {
      tier,
      label: f.label,
      count: bizForTier.length,
      mrr: bizForTier.length * f.monthlyPrice,
      introMrr: bizForTier.length * f.introPrice,
    };
  });

  const total = tiers.reduce((sum, t) => sum + t.mrr, 0);
  const totalIntro = tiers.reduce((sum, t) => sum + t.introMrr, 0);

  return {
    tiers,
    total,
    totalIntro,
    recentNew: recentNewBiz.length,
    recentChurn,
    allActive: active,
  };
}

export default async function MrrPage() {
  const data = await getMrrData();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">MRR Dashboard</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Monthly recurring revenue breakdown by plan. Based on active + trialing subscriptions in the database.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border-2 border-red-200 bg-red-50/50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Full-price MRR</p>
          <p className="mt-2 text-3xl font-semibold text-zinc-900">${data.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="mt-1 text-xs text-zinc-500">If all active on regular pricing</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Introductory MRR</p>
          <p className="mt-2 text-3xl font-semibold text-zinc-900">${data.totalIntro.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="mt-1 text-xs text-zinc-500">At INTRO50 discounted rate</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">New subscriptions (30d)</p>
          <p className="mt-2 text-3xl font-semibold text-zinc-900">{data.recentNew}</p>
          <p className="mt-1 text-xs text-zinc-500">Paid businesses added</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Churn (30d)</p>
          <p className="mt-2 text-3xl font-semibold text-zinc-900">{data.recentChurn}</p>
          <p className="mt-1 text-xs text-zinc-500">Canceled or downgraded</p>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">By plan tier</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.tiers.map((t) => (
            <div key={t.tier} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-zinc-900">{t.label}</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-900">{t.count}</p>
              <p className="text-xs text-zinc-500">active subscribers</p>
              <div className="mt-3 space-y-1 text-xs text-zinc-600">
                <p>Full price: <span className="font-semibold text-zinc-900">${t.mrr.toFixed(2)}/mo</span></p>
                <p>Intro price: <span className="font-semibold text-zinc-700">${t.introMrr.toFixed(2)}/mo</span></p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Active subscribers</h2>
          <span className="text-sm text-zinc-500">{data.allActive.length} total</span>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 text-left">Business</th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Billing email</th>
                <th className="px-4 py-3 text-left">Period end</th>
                <th className="px-4 py-3 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.allActive.map((b) => {
                const tier = normalizePlanTierFromDb(b.planTier);
                const f = planFeatures(tier);
                return (
                  <tr key={b.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 font-medium text-zinc-900">{b.name}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                        {f.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{b.subscriptionStatus}</td>
                    <td className="px-4 py-3 text-zinc-500">{b.billingEmail ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-500">
                      {b.currentPeriodEnd ? new Date(b.currentPeriodEnd).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/businesses/${b.id}`} className="text-xs font-semibold text-red-700 hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!data.allActive.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-500">
                    No active paid subscribers yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

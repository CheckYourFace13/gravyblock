import Link from "next/link";
import { customerLogoutAction } from "@/app/actions/customer-login";
import { requireCustomerSession } from "@/lib/auth/customer-guards";
import { normalizePlanTierFromDb, planFeatures } from "@/lib/plans";
import { resolveAccessibleBusinesses } from "@/lib/auth/customer-auth";

export const dynamic = "force-dynamic";

export default async function CustomerDashboardPage() {
  const session = await requireCustomerSession("/app");
  if (session.email === "admin") {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-semibold text-zinc-900">Admin session active</h1>
        <p className="text-zinc-700">Open the admin dashboard for full operator access.</p>
        <Link href="/admin" className="inline-flex rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
          Open admin
        </Link>
      </div>
    );
  }

  const businesses = await resolveAccessibleBusinesses(session.email);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-14 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900">Your businesses</h1>
          <p className="mt-2 text-sm text-zinc-600">Access your workspace, reports, and billing-linked details in one place.</p>
        </div>
        <form action={customerLogoutAction}>
          <button
            type="submit"
            className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:border-zinc-400"
          >
            Sign out
          </button>
        </form>
      </header>

      {!businesses.length ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm text-zinc-700">
            We couldn&apos;t find businesses tied to this email yet. Use the same email on report unlock or billing, then sign in again.
          </p>
          <div className="mt-4">
            <Link href="/scan" className="inline-flex rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
              Run a free scan
            </Link>
          </div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50">
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Latest report</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {businesses.map((business) => {
                const plan = normalizePlanTierFromDb(business.planTier);
                const feature = planFeatures(plan);
                return (
                  <tr key={business.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-zinc-900">{business.name}</p>
                      <p className="text-xs text-zinc-500">{business.billingEmail ?? "No billing email yet"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900">{feature.label}</p>
                      <p className="text-xs text-zinc-500">{business.subscriptionStatus ?? "none"}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {business.latestReportAt ? new Date(business.latestReportAt).toLocaleDateString() : "No report yet"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/workspace/${business.id}`} className="font-semibold text-red-800 hover:underline">
                          Access your workspace
                        </Link>
                        {business.latestReportPublicId ? (
                          <Link href={`/report/${business.latestReportPublicId}`} className="font-semibold text-zinc-700 hover:underline">
                            Report
                          </Link>
                        ) : null}
                        <Link href={`/workspace/${business.id}#billing`} className="font-semibold text-zinc-700 hover:underline">
                          Billing
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}


import Link from "next/link";
import { normalizePlanTierFromDb, planFeatures } from "@/lib/plans";
import { listBusinessSummaries } from "@/lib/report/repository";
import { getHouseFleetStatus, type HouseHealth } from "@/lib/house";
import { enrollHouseSite, runFleetCycleNow, runHouseCycleNow, runSelfTestNow, runWatchdogNow } from "./house-actions";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status || status === "none") return <span className="text-zinc-400">—</span>;
  const color =
    status === "active" || status === "trialing"
      ? "bg-green-100 text-green-800"
      : status === "past_due"
      ? "bg-yellow-100 text-yellow-800"
      : status === "past_due_downgraded" || status === "canceled"
      ? "bg-red-100 text-red-800"
      : "bg-zinc-100 text-zinc-600";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      {status}
    </span>
  );
}

function PlanBadge({ planTier }: { planTier: string | null | undefined }) {
  if (!planTier || planTier === "free") return <span className="text-zinc-400">free</span>;
  const color =
    planTier === "agency" || planTier === "managed"
      ? "bg-zinc-900 text-white"
      : planTier === "pro"
      ? "bg-red-700 text-white"
      : planTier === "growth"
      ? "bg-red-100 text-red-900"
      : "bg-zinc-100 text-zinc-700";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      {planTier}
    </span>
  );
}

const ago = (d: Date | null) => {
  if (!d) return "never";
  const h = (Date.now() - d.getTime()) / 3_600_000;
  return h < 1 ? "under 1h ago" : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
};

function HealthDot({ h }: { h: HouseHealth }) {
  const c = h === "GREEN" ? "bg-green-100 text-green-800" : h === "YELLOW" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c}`}>{h}</span>;
}

type Props = { searchParams: Promise<{ q?: string }> };

export default async function AdminBusinessesPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const businesses = await listBusinessSummaries(query || undefined);
  const paidCount = businesses.filter((b) =>
    b.accountType !== "house" && (b.subscriptionStatus === "active" || b.subscriptionStatus === "trialing")
  ).length;
  // House accounts come straight from the database, not from the 200 most recently updated rows above
  // (that window silently dropped older house accounts as prospect records piled up).
  const houseAccounts = await getHouseFleetStatus().catch(() => []);
  const houseCount = houseAccounts.length;
  const pastDueCount = businesses.filter((b) => b.subscriptionStatus === "past_due").length;
  const freeCount = businesses.filter((b) => !b.subscriptionStatus || b.subscriptionStatus === "none").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Businesses</h1>
          <p className="mt-2 text-sm text-zinc-600">
            All business profiles with billing status, plan, and workspace access.
          </p>
        </div>
        <form className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name or billing email…"
            className="w-64 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
            Search
          </button>
          {query ? (
            <Link href="/admin/businesses" className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
              Clear
            </Link>
          ) : null}
        </form>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Total</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{businesses.length}</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Active paid</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{paidCount}</p>
        </div>
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-yellow-700">Past due</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{pastDueCount}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Free / no billing</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{freeCount}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">House accounts</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{houseCount}</p>
        </div>
      </div>

      <div id="house-accounts" className="scroll-mt-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-800">
          House accounts — quick access ({houseCount})
        </h2>
        <div className="mt-1 text-xs text-amber-900">
          <Link href="/admin/house" className="font-semibold underline">Per-account engine detail</Link>
          <form action={runFleetCycleNow} className="ml-3 inline">
            <button type="submit" className="font-semibold underline">Queue a full cycle for all</button>
          </form>
          <form action={runWatchdogNow} className="ml-3 inline">
            <button type="submit" className="font-semibold underline">Run watchdog now</button>
          </form>
        </div>
        {houseCount > 0 ? (
          <ul className="mt-3 divide-y divide-amber-100">
            {houseAccounts.map((b) => (
              <li key={b.id} className="space-y-1.5 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="mr-2 inline-block"><HealthDot h={b.health} /></span>
                    <span className="font-medium text-zinc-900">{b.name}</span>
                    <span className="ml-2 text-xs text-zinc-500">{b.domain ?? "no website"} · {b.mode}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-semibold">
                    <Link href={`/workspace/${b.id}`} className="text-red-700 hover:text-red-800">
                      Open workspace
                    </Link>
                    <Link href={`/admin/businesses/${b.id}`} className="text-zinc-700 hover:text-zinc-900">
                      Manage
                    </Link>
                    {b.connector !== "none" ? (
                      <form action={runSelfTestNow.bind(null, b.id)}>
                        <button type="submit" className="text-zinc-500 hover:text-zinc-800">Connector self-test</button>
                      </form>
                    ) : null}
                    <form action={runHouseCycleNow.bind(null, b.id)}>
                      <button type="submit" className="text-zinc-500 hover:text-zinc-800" disabled={b.state.cycleRequested}>{b.state.cycleRequested ? "Cycle queued…" : "Run cycle now"}</button>
                    </form>
                  </div>
                </div>
                <div className="grid gap-x-6 gap-y-0.5 text-xs text-zinc-600 sm:grid-cols-2">
                  <span>Last cycle: {b.state.lastCycle ? `${ago(b.state.lastCycle.at)}, ${b.state.lastCycle.status}${b.state.lastCycle.errors.length ? ` (${b.state.lastCycle.errors.join("; ").slice(0, 80)})` : ""}, acted ${b.state.lastCycle.acted}` : "never"}</span>
                  <span>Last light check: {ago(b.state.lastLight)}</span>
                  <span>Last deep refresh: {ago(b.state.lastDeep)} (next due {b.nextDeepDue ? b.nextDeepDue.toISOString().slice(0, 10) : "now"})</span>
                  <span>Last opportunity discovery: {ago(b.state.lastDiscovery)}</span>
                  <span>Last orchestrator run: {ago(b.state.lastOrchestrator)}</span>
                  <span>Connector: {b.connector}{b.connectorCapabilities.length ? ` (${b.connectorCapabilities.join(", ")})` : ""}</span>
                  <span>Last verified action: {b.lastAction ? `${ago(b.lastAction.at)}: ${b.lastAction.summary.slice(0, 80)}` : "none yet"}</span>
                  <span>Top opportunity: {b.topOpportunity ?? "none open"}</span>
                  <span>Open {b.openOpportunities} · measuring {b.measuring}</span>
                  <span>Proof: L1 {b.proof.level1} · L2 {b.proof.level2} · L3 {b.proof.level3}</span>
                  <span>Blocked one-time capabilities: {b.blocked.length ? b.blocked.join(", ") : "none"}</span>
                </div>
                {b.reasons.length ? <p className={`text-xs ${b.health === "RED" ? "text-red-700" : "text-amber-800"}`}>{b.reasons.join("; ")}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-amber-700">
            None yet. Convert a business below or from its detail page, or from the Reports list.
          </p>
        )}
        <form action={enrollHouseSite} className="mt-4 flex flex-wrap items-end gap-2 border-t border-amber-200 pt-4 text-xs">
          <label className="flex flex-col gap-1 font-semibold text-zinc-700">Add an owned site (enrolls once, then fully automatic)
            <span className="flex flex-wrap gap-2">
              <input name="name" required placeholder="Site name" className="w-40 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm font-normal" />
              <input name="website" required placeholder="example.com" className="w-48 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm font-normal" />
              <select name="focusArea" defaultValue="online" className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm font-normal">
                <option value="online">online</option><option value="national">national</option><option value="regional">regional</option><option value="local">local</option>
              </select>
              <button type="submit" className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800">Enroll</button>
            </span>
          </label>
        </form>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-zinc-100 text-sm">
          <thead className="bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Billing status</th>
              <th className="px-4 py-3">Billing email</th>
              <th className="px-4 py-3">Renews</th>
              <th className="px-4 py-3">Cadence</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {businesses.map((b) => {
              const tier = normalizePlanTierFromDb(b.planTier);
              const features = planFeatures(tier);
              return (
                <tr key={b.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    {b.name}
                    {b.vertical ? (
                      <span className="ml-2 text-xs text-zinc-400">{b.vertical}</span>
                    ) : null}
                    {b.accountType === "house" ? (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        House
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <PlanBadge planTier={b.planTier} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={b.subscriptionStatus} />
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {b.billingEmail ? (
                      <a href={`mailto:${b.billingEmail}`} className="hover:underline">
                        {b.billingEmail}
                      </a>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {b.currentPeriodEnd
                      ? new Date(b.currentPeriodEnd).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{features.refreshCadenceLabel}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">
                    {new Date(b.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3 text-xs font-semibold">
                      <Link href={`/workspace/${b.id}`} className="text-red-700 hover:text-red-800">
                        Workspace
                      </Link>
                      <Link href={`/admin/businesses/${b.id}`} className="text-zinc-700 hover:text-zinc-900">
                        Ops
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!businesses.length ? (
              <tr>
                <td className="px-4 py-6 text-zinc-500" colSpan={8}>
                  No businesses yet. Complete a scan from the marketing site.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { backfillScanClassification, getInternalBusinesses, markInternalBusinesses } from "@/lib/reporting/classification";
import { getOutreachFunnel, getPublicFunnel, getRealCustomers, getScanCounts, pct } from "@/lib/reporting/acquisition";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Acquisition" };

const DAY = 24 * 60 * 60 * 1000;
const windows = [
  { label: "24h", ms: DAY },
  { label: "7d", ms: 7 * DAY },
  { label: "30d", ms: 30 * DAY },
];

function Table({ rows }: { rows: Array<{ label: string; values: number[] }> }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase text-zinc-500">
          <th className="py-1 pr-4" />
          {windows.map((w) => (
            <th key={w.label} className="px-3 py-1 text-right">{w.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.label} className="border-t border-zinc-100">
            <td className="py-1.5 pr-4 text-zinc-700">{r.label}</td>
            {r.values.map((v, k) => (
              <td key={k} className="px-3 py-1.5 text-right font-semibold text-zinc-900">
                {v.toLocaleString()}
                {i > 0 ? <span className="ml-2 text-xs font-normal text-zinc-400">{pct(v, rows[i - 1].values[k])}</span> : null}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function AcquisitionPage() {
  await markInternalBusinesses().catch(() => 0);
  await backfillScanClassification().catch(() => ({}));
  const [real, internal, scansAll, pub, out] = await Promise.all([
    getRealCustomers(),
    getInternalBusinesses(),
    getScanCounts(),
    Promise.all(windows.map((w) => getPublicFunnel(new Date(Date.now() - w.ms)))),
    Promise.all(windows.map((w) => getOutreachFunnel(new Date(Date.now() - w.ms)))),
  ]);
  const p = (k: keyof (typeof pub)[number]) => pub.map((f) => f[k]);
  const o = (k: keyof (typeof out)[number]) => out.map((f) => f[k]);
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Acquisition</h1>
        <p className="mt-2 text-3xl font-bold text-zinc-900">Real paying customers: {real.customers.length}</p>
        <p className="text-3xl font-bold text-zinc-900">Customer MRR: ${real.mrr.toFixed(2)}</p>
        <p className="mt-2 text-xs text-zinc-500">
          Owner, staff, test and house accounts are excluded ({internal.size} classified). Excluded paid accounts:{" "}
          {real.excluded.length ? real.excluded.map((e) => `${e.name} (${e.reason.replace(/_/g, " ")})`).join(", ") : "none"}.
        </p>
      </div>
      <section>
        <h2 className="mb-2 font-semibold text-zinc-900">Real website funnel (public visitors only)</h2>
        <Table
          rows={[
            { label: "Visitors", values: p("visitors") },
            { label: "Scan started", values: p("scanStarted") },
            { label: "Scan completed", values: p("scanCompleted") },
            { label: "Report unlocked", values: p("unlocked") },
            { label: "Start GravyBlock clicked", values: p("startClicked") },
            { label: "Checkout started", values: p("checkoutStarted") },
            { label: "Paid", values: p("paid") },
          ]}
        />
      </section>
      <section>
        <h2 className="mb-2 font-semibold text-zinc-900">Outreach funnel (separate)</h2>
        <Table
          rows={[
            { label: "Initial outreach delivered", values: o("delivered") },
            { label: "Report visited", values: o("reportVisits") },
            { label: "Report unlocked", values: o("unlocked") },
            { label: "Checkout started", values: o("checkoutStarted") },
            { label: "Paid", values: o("paid") },
          ]}
        />
      </section>
      <section>
        <h2 className="mb-2 font-semibold text-zinc-900">Scans by origin (all time)</h2>
        <ul className="text-sm text-zinc-700">
          <li>Public: {scansAll.public.toLocaleString()}</li>
          <li>Outreach prospect scans: {scansAll.outreach.toLocaleString()}</li>
          <li>Internal / QA: {scansAll.internal.toLocaleString()}</li>
          <li>System / automated: {scansAll.system.toLocaleString()}</li>
          <li>Unknown (historical): {scansAll.unknown.toLocaleString()}</li>
          <li className="font-semibold">Total records: {scansAll.total.toLocaleString()}</li>
        </ul>
      </section>
    </div>
  );
}

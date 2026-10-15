import type { Metadata } from "next";
import { getInternalBusinesses } from "@/lib/reporting/classification";
import { getOutreachFunnel, getPublicFunnel, getRealCustomers, getScanCounts, measure, pct, show, type Metric, type OutreachFunnel, type PublicFunnel, type ScanCounts } from "@/lib/reporting/acquisition";
import { runClassificationAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Acquisition" };

const DAY = 24 * 60 * 60 * 1000;
const windows = [
  { label: "24h", ms: DAY },
  { label: "7d", ms: 7 * DAY },
  { label: "30d", ms: 30 * DAY },
];

/** This page only reads. A failed metric shows "Unavailable" (with the real error logged), never a fake zero. */
function Table({ rows }: { rows: Array<{ label: string; values: Array<number | null> }> }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase text-zinc-500">
          <th className="py-1 pr-4" />
          {windows.map((w) => (
            <th key={w.label} className="px-3 py-1 text-right">
              {w.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.label} className="border-t border-zinc-100">
            <td className="py-1.5 pr-4 text-zinc-700">{r.label}</td>
            {r.values.map((v, k) => (
              <td key={k} className={`px-3 py-1.5 text-right font-semibold ${v === null ? "text-amber-700" : "text-zinc-900"}`}>
                {show(v)}
                {i > 0 && v !== null ? <span className="ml-2 text-xs font-normal text-zinc-400">{pct(v, rows[i - 1].values[k])}</span> : null}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const cell = (m: Metric<ScanCounts>, k: keyof ScanCounts) => (m.ok ? m.value[k].toLocaleString() : "Unavailable");

export default async function AcquisitionPage() {
  const [realM, internalM, scansM, pub, out] = await Promise.all([
    measure("customers", getRealCustomers),
    measure("internal accounts", getInternalBusinesses),
    measure("scans", () => getScanCounts()),
    Promise.all(windows.map((w) => getPublicFunnel(new Date(Date.now() - w.ms)))),
    Promise.all(windows.map((w) => getOutreachFunnel(new Date(Date.now() - w.ms)))),
  ]);
  const p = (k: keyof PublicFunnel) => pub.map((f) => f[k]);
  const o = (k: keyof OutreachFunnel) => out.map((f) => f[k]);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Acquisition</h1>
        <p className="mt-2 text-3xl font-bold text-zinc-900">Real paying customers: {realM.ok ? realM.value.customers.length : "Unavailable"}</p>
        <p className="text-3xl font-bold text-zinc-900">Customer MRR: {realM.ok ? `$${realM.value.mrr.toFixed(2)}` : "Unavailable"}</p>
        <p className="mt-2 text-xs text-zinc-500">
          Owner, staff, test and house accounts are excluded ({internalM.ok ? internalM.value.size : "Unavailable"} classified). Excluded paid accounts:{" "}
          {realM.ok ? (realM.value.excluded.length ? realM.value.excluded.map((e) => `${e.name} (${e.reason.replace(/_/g, " ")})`).join(", ") : "none") : "Unavailable"}.
        </p>
        {!realM.ok ? <p className="mt-1 text-xs text-amber-700">Customer query failed: {realM.error}</p> : null}
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
        <p className="mt-1 text-xs text-zinc-500">0 means measured zero. Unavailable means the query failed; the error is in the server log.</p>
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
          <li>Public: {cell(scansM, "public")}</li>
          <li>Outreach prospect scans: {cell(scansM, "outreach")}</li>
          <li>Internal / QA: {cell(scansM, "internal")}</li>
          <li>System / automated: {cell(scansM, "system")}</li>
          <li>Unknown (historical, not classifiable): {cell(scansM, "unknown")}</li>
          <li className="font-semibold">Total records: {cell(scansM, "total")}</li>
        </ul>
        <form action={runClassificationAction} className="mt-3">
          <button type="submit" className="rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-semibold text-zinc-800 hover:border-zinc-400">
            Run classification now
          </button>
          <span className="ml-3 text-xs text-zinc-500">Classifies older scans and internal accounts. Idempotent, never deletes. Also runs daily.</span>
        </form>
      </section>
    </div>
  );
}

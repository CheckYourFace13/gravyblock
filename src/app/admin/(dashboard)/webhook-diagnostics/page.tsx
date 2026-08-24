import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { getDb, jobs } from "@/lib/db";
import type { WebhookDiagnosticRecord } from "@/lib/integrations/webhook-diagnostics";

export const metadata: Metadata = { title: "Webhook diagnostics — Admin" };
export const dynamic = "force-dynamic";

async function getRecentWebhookDiagnostics(limit = 100) {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ id: jobs.id, status: jobs.status, payload: jobs.payload, createdAt: jobs.createdAt })
    .from(jobs)
    .where(eq(jobs.type, "webhook_diagnostic"))
    .orderBy(desc(jobs.createdAt))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt, ...(r.payload as WebhookDiagnosticRecord) }));
}

export default async function WebhookDiagnosticsPage() {
  const rows = await getRecentWebhookDiagnostics(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">📡 Webhook diagnostics</h1>
        <p className="mt-1 text-sm text-zinc-500">
          One row per request the Resend webhook route received — which stage it reached, whether the signature
          verified, and the exact exception if it failed. Never shows the secret, signature value, or email content.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-400">No webhook requests logged yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-zinc-400 uppercase tracking-wide">
                <th className="pb-2 pr-4 font-semibold">Time</th>
                <th className="pb-2 pr-4 font-semibold">HTTP</th>
                <th className="pb-2 pr-4 font-semibold">Stage reached</th>
                <th className="pb-2 pr-4 font-semibold">Event</th>
                <th className="pb-2 pr-4 font-semibold">Resend email ID</th>
                <th className="pb-2 pr-4 font-semibold">Sig headers</th>
                <th className="pb-2 pr-4 font-semibold">Sig verified</th>
                <th className="pb-2 font-semibold">Exception</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {rows.map((r) => (
                <tr key={r.id} className={r.httpStatus && r.httpStatus >= 400 ? "bg-red-50" : ""}>
                  <td className="py-2 pr-4 text-zinc-400 whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className={`py-2 pr-4 font-semibold ${r.httpStatus && r.httpStatus >= 400 ? "text-red-700" : "text-emerald-700"}`}>
                    {r.httpStatus ?? "—"}
                  </td>
                  <td className="py-2 pr-4 text-zinc-700">{r.stage}</td>
                  <td className="py-2 pr-4 text-zinc-700">{r.eventType ?? "—"}</td>
                  <td className="py-2 pr-4 font-mono text-zinc-500">{r.resendEmailId ?? "—"}</td>
                  <td className="py-2 pr-4">{r.signatureHeadersPresent ? "yes" : "no"}</td>
                  <td className="py-2 pr-4">
                    {r.signatureVerified === null ? "—" : r.signatureVerified ? "✓ yes" : "✗ no"}
                  </td>
                  <td className="py-2 text-red-700">
                    {r.exceptionClass ? `${r.exceptionClass}: ${r.exceptionMessage ?? ""}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

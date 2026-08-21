import Link from "next/link";
import type { EmailHealth } from "./outreach/actions";

export function EmailHealthBanner({ health }: { health: EmailHealth }) {
  if (health.redAlert) {
    return (
      <div className="rounded-2xl border-2 border-red-400 bg-red-50 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-red-700">⚠ {health.redAlert}</p>
        <p className="mt-1 text-sm text-red-800">
          {health.webhookConfigured === false
            ? "Resend's webhook is not registered correctly for this endpoint — see the Outreach page for details."
            : health.webhookConfigured === null
              ? "Could not check Resend's webhook config (API error)."
              : "Webhook appears registered — check Resend's own delivery logs for this endpoint."}
          {" "}
          <Link href="/admin/outreach" className="font-semibold underline">
            Open outreach diagnostics →
          </Link>
        </p>
      </div>
    );
  }

  if (health.webhookConfigured === false) {
    return (
      <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-5">
        <p className="text-sm font-bold uppercase tracking-wide text-amber-800">⚠ Resend webhook not fully configured</p>
        <p className="mt-1 text-sm text-amber-900">
          <Link href="/admin/outreach" className="font-semibold underline">
            Open outreach diagnostics →
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm font-semibold text-emerald-900">
        ✓ Email tracking healthy — {health.eventsLast24h} provider events in the last 24h ({health.sentLast24h} sent)
      </p>
    </div>
  );
}
